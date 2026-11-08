import { test } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { issueDeviceIdentity } from '../src/certs.js'
import { buildEnrollmentProfile, ACCESS_RIGHTS } from '../src/profile.js'
import { buildPlist, parsePlist } from '../src/plist.js'

// A throwaway CA, made with openssl, so the test never touches the real one.
const dir = mkdtempSync(join(tmpdir(), 'dhmdm-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'ca.key'), '-out', join(dir, 'ca.pem'), '-days', '2', '-subj', '/CN=Test CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign'], { stdio: 'ignore' })
const b64 = (args) => execFileSync('openssl', args).toString('base64')
const env = {
  MDM_CA_KEY: b64(['pkcs8', '-topk8', '-nocrypt', '-in', join(dir, 'ca.key'), '-outform', 'DER']),
  MDM_CA_CERT: b64(['x509', '-in', join(dir, 'ca.pem'), '-outform', 'DER']),
  ORG_NAME: 'DH Website Services',
  PUBLIC_URL: 'https://mdm.example',
  MDM_PUSH_TOPIC: 'com.apple.mgmt.External.test',
}

test('device identity is a valid PKCS#12 whose cert chains to the CA', async () => {
  const started = performance.now()
  const { p12, password } = await issueDeviceIdentity(env, 'DH MDM test@dhwebsiteservices.co.uk')
  const ms = performance.now() - started
  const file = join(dir, 'id.p12')
  writeFileSync(file, p12)
  const pem = execFileSync('openssl', ['pkcs12', '-legacy', '-in', file, '-passin', `pass:${password}`, '-clcerts', '-nokeys']).toString()
  writeFileSync(join(dir, 'id.pem'), pem)
  const verify = execFileSync('openssl', ['verify', '-CAfile', join(dir, 'ca.pem'), join(dir, 'id.pem')]).toString()
  assert.match(verify, /OK/)
  const key = execFileSync('openssl', ['pkcs12', '-legacy', '-in', file, '-passin', `pass:${password}`, '-nocerts', '-nodes']).toString()
  assert.match(key, /PRIVATE KEY/)
  console.log(`issued in ${ms.toFixed(0)} ms`)
})

test('enrolment profile has the MDM payload, never the erase right', async () => {
  const profile = await buildEnrollmentProfile(env, { secret: 'a'.repeat(48), email: 'x@dhwebsiteservices.co.uk', name: 'X' })
  const round = parsePlist(buildPlist(profile))
  const mdm = round.PayloadContent.find((p) => p.PayloadType === 'com.apple.mdm')
  const id = round.PayloadContent.find((p) => p.PayloadType === 'com.apple.security.pkcs12')
  assert.equal(mdm.IdentityCertificateUUID, id.PayloadUUID)
  assert.equal(mdm.AccessRights & 8, 0)
  assert.equal(ACCESS_RIGHTS & 8, 0)
  assert.match(mdm.ServerURL, /\/mdm\/connect\?s=a{48}$/)
  assert.ok(id.PayloadContent instanceof Uint8Array && id.PayloadContent.length > 1000)
})

test('parses a real Authenticate message', () => {
  const msg = parsePlist(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>BuildVersion</key>
	<string>22A3354</string>
	<key>MessageType</key>
	<string>Authenticate</string>
	<key>Token</key>
	<data>
	AAEC
	</data>
	<key>UDID</key>
	<string>00008110-000A1B2C3D4E5F6A</string>
	<key>Awaiting</key>
	<false/>
</dict>
</plist>`)
  assert.equal(msg.MessageType, 'Authenticate')
  assert.equal(msg.UDID, '00008110-000A1B2C3D4E5F6A')
  assert.deepEqual([...msg.Token], [0, 1, 2])
  assert.equal(msg.Awaiting, false)
})
