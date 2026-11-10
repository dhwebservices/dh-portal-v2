/**
 * Health check: turns what a phone has reported into a short list of
 * pass / warn / fail lines a person can act on. Everything here comes from
 * queries Apple allows on an unsupervised phone (device details, security,
 * apps, profiles, certificates). Apple gives MDM no access to battery health,
 * crash logs or sysdiagnose, so those are not here and can't be.
 */
import { PROFILE_ID } from './profile.js'

const HOUR = 3600 * 1000
const DAY = 24 * HOUR

// Apple's public feed of current iOS releases per device model.
let releaseCache = { at: 0, sets: null }
async function iosReleases() {
  if (releaseCache.sets && Date.now() - releaseCache.at < 6 * HOUR) return releaseCache.sets
  try {
    const res = await fetch('https://gdmf.apple.com/v2/pmv', { signal: AbortSignal.timeout(5000) })
    const data = await res.json()
    releaseCache = { at: Date.now(), sets: data?.PublicAssetSets?.iOS || [] }
  } catch {
    if (!releaseCache.sets) return []
  }
  return releaseCache.sets
}

const parts = (v) => String(v || '').split('.').map((n) => parseInt(n, 10) || 0)
function compare(a, b) {
  const x = parts(a), y = parts(b)
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0)
  return 0
}

export async function latestIos(product) {
  const versions = (await iosReleases())
    .filter((s) => !product || (s.SupportedDevices || []).includes(product))
    .map((s) => s.ProductVersion)
    .sort(compare)
  if (!versions.length) return null
  return { newest: versions[versions.length - 1], byMajor: versions }
}

function ago(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60000))} min`
  if (ms < DAY) return `${Math.round(ms / HOUR)} h`
  return `${Math.round(ms / DAY)} days`
}

export function summarizeProfiles(list) {
  return (list || []).map((p) => ({
    name: p.PayloadDisplayName || p.PayloadIdentifier || 'Unnamed profile',
    id: p.PayloadIdentifier || null,
    org: p.PayloadOrganization || null,
    ours: p.PayloadIdentifier === PROFILE_ID,
    kinds: [...new Set((p.PayloadContent || []).map((c) => String(c.PayloadType || '').replace(/^com\.apple\./, '')))].filter(Boolean).slice(0, 6),
  }))
}

export function summarizeCertificates(list) {
  return (list || []).map((c) => ({ name: c.CommonName || 'Unnamed certificate', identity: c.IsIdentity === true }))
}

/**
 * @returns {{ checks: Array<{key,status:'ok'|'warn'|'bad'|'info',title,detail}>, worst, largestApps }}
 */
export async function healthCheck(device) {
  const info = device.info_json ? JSON.parse(device.info_json) : {}
  const sec = device.security_json ? JSON.parse(device.security_json) : {}
  const apps = device.apps_json ? JSON.parse(device.apps_json) : []
  const profiles = device.profiles_json ? JSON.parse(device.profiles_json) : null
  const certs = device.certs_json ? JSON.parse(device.certs_json) : null
  const t = Date.now()
  const checks = []
  const add = (key, status, title, detail) => checks.push({ key, status, title, detail: detail || null })

  // Contact
  const seen = device.last_seen ? t - device.last_seen : null
  if (seen == null) add('contact', 'bad', 'Never checked in')
  else if (seen > 3 * DAY) add('contact', 'bad', `Not heard from in ${ago(seen)}`, 'It may be off, out of signal, or management was removed.')
  else if (seen > 12 * HOUR) add('contact', 'warn', `Last checked in ${ago(seen)} ago`, 'Phones check in when they have signal and are switched on.')
  else add('contact', 'ok', 'Checking in normally', `Last seen ${ago(seen)} ago`)

  // iOS version
  const os = device.os_version || info.OSVersion
  const latest = os ? await latestIos(device.product || info.ProductName) : null
  if (os && latest) {
    const sameMajor = latest.byMajor.filter((v) => parts(v)[0] === parts(os)[0])
    const newestSameMajor = sameMajor[sameMajor.length - 1]
    const behind = newestSameMajor && compare(newestSameMajor, os) > 0
    const newerMajor = compare(latest.newest, os) > 0 && parts(latest.newest)[0] > parts(os)[0]
    if (behind) add('ios', 'warn', `iOS update available: ${newestSameMajor}`, `On ${os}. Settings > General > Software Update.${newerMajor ? ` iOS ${latest.newest} is also out.` : ''}`)
    else if (newerMajor) add('ios', 'info', `Up to date on iOS ${parts(os)[0]}`, `On ${os}. iOS ${latest.newest} is available as an upgrade.`)
    else add('ios', 'ok', 'iOS up to date', os)
  } else if (os) {
    add('ios', 'info', `iOS ${os}`, "Couldn't reach Apple to compare versions.")
  }

  // Storage
  if (typeof info.DeviceCapacity === 'number' && typeof info.AvailableDeviceCapacity === 'number' && info.DeviceCapacity > 0) {
    const free = info.AvailableDeviceCapacity
    const pct = free / info.DeviceCapacity
    const text = `${free.toFixed(1)} GB free of ${info.DeviceCapacity} GB`
    if (free < 2 || pct < 0.05) add('storage', 'bad', 'Storage almost full', `${text}. Updates and photos will fail.`)
    else if (pct < 0.15) add('storage', 'warn', 'Storage getting full', text)
    else add('storage', 'ok', 'Plenty of storage', text)
  }

  // Battery (charge only: Apple doesn't give MDM battery health)
  if (typeof info.BatteryLevel === 'number') {
    const b = Math.round(info.BatteryLevel * 100)
    if (b <= 10) add('battery', 'bad', `Battery ${b}%`, `Charge level when it last reported, ${ago(t - (device.info_at || t))} ago.`)
    else if (b <= 20) add('battery', 'warn', `Battery ${b}%`, `Charge level when it last reported, ${ago(t - (device.info_at || t))} ago.`)
    else add('battery', 'ok', `Battery ${b}%`, `Charge level when it last reported, ${ago(t - (device.info_at || t))} ago. Apple doesn't share battery health with MDM.`)
  }

  // Backup
  if (info.IsCloudBackupEnabled === false) add('backup', 'bad', 'iCloud Backup is off', 'If the phone is lost or breaks, photos and messages may be gone. Settings > [name] > iCloud > iCloud Backup.')
  else if (info.IsCloudBackupEnabled === true) {
    const last = info.LastCloudBackupDate ? t - new Date(info.LastCloudBackupDate).getTime() : null
    if (last == null) add('backup', 'warn', 'iCloud Backup on, never completed')
    else if (last > 7 * DAY) add('backup', 'bad', `Last iCloud backup ${ago(last)} ago`, 'Backups run on Wi-Fi while charging and locked. Check iCloud storage isn\'t full.')
    else if (last > 2 * DAY) add('backup', 'warn', `Last iCloud backup ${ago(last)} ago`, 'Backups run on Wi-Fi while charging and locked.')
    else add('backup', 'ok', 'Backed up to iCloud', `${ago(last)} ago`)
  }

  // Security
  if (sec.PasscodePresent === false) add('passcode', 'bad', 'No passcode', 'Anyone who picks the phone up can open it. Lock commands also need a passcode to mean anything.')
  else if (sec.PasscodePresent === true) add('passcode', 'ok', 'Passcode set, phone encrypted')
  if (info.IsDeviceLocatorServiceEnabled === false) add('findmy', 'warn', 'Find My is off', "If it's lost it can't be located. Settings > [name] > Find My.")
  else if (info.IsDeviceLocatorServiceEnabled === true) add('findmy', 'ok', 'Find My is on')

  // Profiles and certificates someone else installed
  if (profiles) {
    const others = profiles.filter((p) => !p.ours)
    if (others.length) {
      const risky = others.filter((p) => p.kinds.some((k) => /vpn|proxy|dnsSettings|security\.root|pkcs1|webcontent/i.test(k)))
      add('profiles', risky.length ? 'warn' : 'info', `${others.length} other profile${others.length > 1 ? 's' : ''} installed`,
        `${others.map((p) => p.name).join(', ')}.${risky.length ? ' Includes VPN, proxy, DNS or certificate settings: check these are expected.' : ''}`)
    } else add('profiles', 'ok', 'No other profiles installed')
  }
  if (certs) {
    const extra = certs.filter((c) => !c.identity && !/^DH MDM|^DH Device/i.test(c.name))
    if (extra.length) add('certs', 'warn', `${extra.length} extra certificate${extra.length > 1 ? 's' : ''} trusted`, `${extra.map((c) => c.name).slice(0, 5).join(', ')}. Extra trusted certificates can let someone read secure traffic, so check they're expected.`)
    else add('certs', 'ok', 'No extra certificates trusted')
  }

  const largestApps = apps.filter((a) => a.sizeMB).sort((a, b) => b.sizeMB - a.sizeMB).slice(0, 5)
  const rank = { bad: 3, warn: 2, info: 1, ok: 0 }
  const worst = checks.reduce((w, c) => (rank[c.status] > rank[w] ? c.status : w), 'ok')
  return { checks, worst, largestApps, checkedAt: device.info_at || null }
}
