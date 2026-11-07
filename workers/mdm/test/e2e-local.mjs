// Simulates one iPhone enrolling against `wrangler dev --local` on :8811.
// Run: node test/e2e-local.mjs  (needs the local D1 with schema.sql applied)
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { buildPlist, parsePlist } from '../src/plist.js'

const BASE = 'http://127.0.0.1:8811'
const sql = (q) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'dh-mdm', '--local', '--json', '--command', q], { encoding: 'utf8' })
const rows = (q) => JSON.parse(sql(q))[0].results
const sha = (s) => createHash('sha256').update(s).digest('hex')
const ok = (cond, label) => { if (!cond) { console.error('FAIL', label); process.exit(1) } console.log('ok  ', label) }

const token = randomBytes(24).toString('hex')
sql('DELETE FROM enrollments; DELETE FROM devices; DELETE FROM commands; DELETE FROM audit')
sql(`INSERT INTO enrollments (id, token_hash, email, name, created_by, created_at, expires_at) VALUES ('e1', '${sha(token)}', 'test@dhwebsiteservices.co.uk', 'Test', 'david@dhwebsiteservices.co.uk', ${Date.now()}, ${Date.now() + 3600e3})`)

let r = await fetch(`${BASE}/enroll/${token}`)
ok(r.status === 200 && (await r.text()).includes('Download the profile'), 'enrol page')
r = await fetch(`${BASE}/enroll/${token}/profile`)
ok(r.headers.get('content-type') === 'application/x-apple-aspen-config', 'profile content type')
const profile = parsePlist(await r.text())
const mdm = profile.PayloadContent.find((p) => p.PayloadType === 'com.apple.mdm')
const secret = new URL(mdm.ServerURL).searchParams.get('s')
ok(secret && secret.length === 48, 'secret in ServerURL')
r = await fetch(`${BASE}/enroll/${token}/profile`)
ok(r.status === 410, 'second download refused')

const UDID = '00008110-000A1B2C3D4E5F6A'
const put = (path, body, s = secret) => fetch(`${BASE}${path}?s=${s}`, { method: 'PUT', body: buildPlist(body) })

r = await put('/mdm/checkin', { MessageType: 'Authenticate', UDID, Topic: mdm.Topic, SerialNumber: 'F2LTEST', ProductName: 'iPhone14,5', OSVersion: '27.2' })
ok(r.status === 200, 'Authenticate')
r = await put('/mdm/checkin', { MessageType: 'Authenticate', UDID, Topic: mdm.Topic }, 'b'.repeat(48))
ok(r.status === 401, 'Authenticate with a wrong secret refused')
r = await put('/mdm/checkin', { MessageType: 'TokenUpdate', UDID, Topic: mdm.Topic, Token: new Uint8Array([1, 2, 3, 4]), PushMagic: 'MAGIC-1' })
ok(r.status === 200, 'TokenUpdate')
let dev = rows(`SELECT status, push_token, push_magic FROM devices WHERE udid = '${UDID}'`)[0]
ok(dev.status === 'enrolled' && dev.push_token === '01020304' && dev.push_magic === 'MAGIC-1', 'device enrolled with push details')
ok(rows(`SELECT COUNT(*) n FROM commands WHERE udid = '${UDID}' AND status = 'queued'`)[0].n === 3, 'refresh queued on enrolment')

// The phone asks for work and answers each command.
r = await put('/mdm/connect', { UDID, Status: 'Idle' })
let cmd = parsePlist(await r.text())
ok(cmd.Command.RequestType === 'DeviceInformation' && cmd.Command.Queries.includes('BatteryLevel'), 'gets DeviceInformation')
r = await put('/mdm/connect', { UDID, Status: 'Acknowledged', CommandUUID: cmd.CommandUUID, QueryResponses: { DeviceName: "Jack's iPhone", BatteryLevel: 0.83, AvailableDeviceCapacity: 37.8, DeviceCapacity: 128, IsSupervised: false, OSVersion: '27.2', ModelName: 'iPhone 13' } })
cmd = parsePlist(await r.text())
ok(cmd.Command.RequestType === 'SecurityInfo', 'then SecurityInfo')
r = await put('/mdm/connect', { UDID, Status: 'Acknowledged', CommandUUID: cmd.CommandUUID, SecurityInfo: { PasscodePresent: true, PasscodeCompliant: true, HardwareEncryptionCaps: 3 } })
cmd = parsePlist(await r.text())
ok(cmd.Command.RequestType === 'InstalledApplicationList', 'then InstalledApplicationList')
r = await put('/mdm/connect', { UDID, Status: 'Acknowledged', CommandUUID: cmd.CommandUUID, InstalledApplicationList: [{ Name: 'DH Staff Portal', Identifier: 'uk.co.dhwebsiteservices.staff', ShortVersion: '1.1', BundleSize: 45000000 }] })
ok(r.status === 200 && (await r.text()) === '', 'queue empty afterwards')

dev = rows(`SELECT device_name, supervised, info_json, security_json, apps_json FROM devices WHERE udid = '${UDID}'`)[0]
ok(dev.device_name === "Jack's iPhone" && dev.supervised === 0, 'real name and supervision stored')
ok(JSON.parse(dev.security_json).PasscodePresent === true, 'security stored')
ok(JSON.parse(dev.apps_json)[0].name === 'DH Staff Portal', 'apps stored')

// A lock that the phone defers, then accepts.
sql(`INSERT INTO commands (uuid, udid, request_type, payload_json, status, queued_by, queued_at) VALUES ('LOCK-1', '${UDID}', 'DeviceLock', '{"Message":"call us","PhoneNumber":"01443 805303"}', 'queued', 'david@dhwebsiteservices.co.uk', ${Date.now()})`)
r = await put('/mdm/connect', { UDID, Status: 'Idle' })
cmd = parsePlist(await r.text())
ok(cmd.Command.RequestType === 'DeviceLock' && cmd.Command.PhoneNumber === '01443 805303', 'gets DeviceLock')
r = await put('/mdm/connect', { UDID, Status: 'NotNow', CommandUUID: 'LOCK-1' })
ok((await r.text()) === '', 'NotNow -> nothing more sent')
r = await put('/mdm/connect', { UDID, Status: 'Idle' })
cmd = parsePlist(await r.text())
ok(cmd.CommandUUID === 'LOCK-1', 'deferred lock resent')
r = await put('/mdm/connect', { UDID, Status: 'Acknowledged', CommandUUID: 'LOCK-1' })
ok(rows(`SELECT status FROM commands WHERE uuid = 'LOCK-1'`)[0].status === 'done', 'lock done')

// An error from the phone is recorded.
sql(`INSERT INTO commands (uuid, udid, request_type, payload_json, status, queued_by, queued_at) VALUES ('RS-1', '${UDID}', 'RestartDevice', '{}', 'queued', 'david@dhwebsiteservices.co.uk', ${Date.now()})`)
r = await put('/mdm/connect', { UDID, Status: 'Idle' })
await r.text()
r = await put('/mdm/connect', { UDID, Status: 'Error', CommandUUID: 'RS-1', ErrorChain: [{ ErrorCode: 12021, LocalizedDescription: 'The device is not supervised.' }] })
const rs = rows(`SELECT status, error FROM commands WHERE uuid = 'RS-1'`)[0]
ok(rs.status === 'error' && rs.error.includes('not supervised'), 'phone error recorded')

// Removing the profile on the phone checks out.
r = await put('/mdm/checkin', { MessageType: 'CheckOut', UDID })
ok(rows(`SELECT status FROM devices WHERE udid = '${UDID}'`)[0].status === 'removed', 'CheckOut marks removed')
r = await put('/mdm/connect', { UDID, Status: 'Idle' })
ok(r.status === 401, 'removed phone gets nothing')

// Admin API needs a Microsoft sign-in.
r = await fetch(`${BASE}/api/devices`)
ok(r.status === 401, 'API refuses without sign-in')
console.log('\nall good')
