/**
 * The two small pages a person sees in Safari while enrolling.
 * Plain HTML, inline styles, no scripts.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function shell(title, inner) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
:root{--ink:#0C1013;--mid:#5A6367;--line:#E3E6E8;--blue:#3AAEF5;--bg:#F6F7F8}
@media (prefers-color-scheme:dark){:root{--ink:#F2F4F5;--mid:#A3ACB0;--line:#2A3135;--bg:#0E1214}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:520px;margin:0 auto;padding:32px 20px 48px}
h1{font-size:26px;line-height:1.15;letter-spacing:-.01em;margin:8px 0 12px}
.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mid)}
.card{border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:18px 0}
ol{padding-left:20px;margin:0}li{margin:8px 0}
ul{padding-left:20px;margin:6px 0}
.btn{display:block;text-align:center;background:var(--blue);color:#06121A;font-weight:700;text-decoration:none;padding:15px;border-radius:12px;margin:22px 0 10px}
.small{font-size:14px;color:var(--mid)}
</style></head><body><main>${inner}</main></body></html>`
}

export function enrollPage(env, enrollment, profileUrl) {
  const org = env.ORG_NAME || 'DH Website Services'
  return shell(`${org} device management`, `
<div class="eyebrow">${esc(org)}</div>
<h1>Add this iPhone to device management</h1>
<p>This is for ${esc(enrollment.name || enrollment.email)}. It takes about a minute.</p>
<a class="btn" href="${esc(profileUrl)}">Download the profile</a>
<p class="small">This link works once. Open it in Safari on the iPhone you're enrolling.</p>
<div class="card"><strong>Then:</strong><ol>
<li>Tap <b>Allow</b> when Safari asks to download a configuration profile.</li>
<li>Open <b>Settings</b>. Tap <b>Profile Downloaded</b> near the top.</li>
<li>Tap <b>Install</b>, enter your passcode, then <b>Install</b> again and <b>Trust</b> for Remote Management.</li>
</ol></div>
<div class="card"><strong>What ${esc(org)} can do</strong><ul>
<li>See the model, iOS version, storage, battery and serial number</li>
<li>Check a passcode is set and the phone is encrypted</li>
<li>See which apps are installed</li>
<li>Lock the phone if it's lost, with a message to call us</li>
</ul><strong>What we can't do</strong><ul>
<li>Erase the phone</li>
<li>Read messages, email, photos, files or browsing</li>
<li>See where the phone is</li>
</ul><p class="small">You can remove it any time in Settings &gt; General &gt; VPN &amp; Device Management.</p></div>`)
}

export function messagePage(env, title, message) {
  return shell(title, `<div class="eyebrow">${esc(env.ORG_NAME || 'DH Website Services')}</div><h1>${esc(title)}</h1><p>${esc(message)}</p>`)
}
