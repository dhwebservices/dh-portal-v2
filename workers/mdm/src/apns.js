/**
 * Wakes a phone so it checks in for commands.
 *
 * MDM pushes are different from the app's normal notifications: Apple only
 * accepts them over a TLS connection that presents the MDM push certificate
 * (no token auth), with the phone's MDM token and its PushMagic. The
 * certificate is bound to this Worker as the APNS_MDM mTLS binding, which
 * presents it on every request made through that binding.
 */

export const pushReady = (env) => Boolean(env.APNS_MDM && env.MDM_PUSH_TOPIC)

export async function wake(env, device) {
  if (!pushReady(env)) return { ok: false, reason: 'The MDM push certificate is not set up yet.' }
  if (!device.push_token || !device.push_magic) return { ok: false, reason: 'This phone has not finished enrolling.' }
  try {
    const res = await env.APNS_MDM.fetch(`https://api.push.apple.com/3/device/${device.push_token}`, {
      method: 'POST',
      headers: {
        'apns-topic': device.topic || env.MDM_PUSH_TOPIC,
        'apns-push-type': 'mdm',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 24 * 3600),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ mdm: device.push_magic }),
    })
    if (res.status === 200) return { ok: true }
    const text = await res.text().catch(() => '')
    let reason = text
    try { reason = JSON.parse(text).reason || text } catch {}
    return { ok: false, status: res.status, reason: reason || `APNs ${res.status}` }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}
