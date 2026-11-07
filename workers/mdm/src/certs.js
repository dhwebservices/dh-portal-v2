/**
 * Each enrolled phone gets its own identity certificate, issued by our own CA
 * and delivered inside the enrolment profile as a PKCS#12. iOS requires one
 * for the MDM payload (IdentityCertificateUUID).
 *
 * Slow maths stays native: the phone's RSA key is generated and the
 * certificate is signed with WebCrypto. node-forge only lays out the ASN.1
 * and wraps the PKCS#12, which is cheap.
 *
 * The PKCS#12 password travels in the same profile, so its encryption protects
 * nothing on its own; what keeps the identity private is that the profile is
 * downloaded once over HTTPS by the person enrolling. A low iteration count
 * keeps the Worker well inside its CPU limit.
 */
import forge from 'node-forge'
import { b64ToBytes, bytesToB64 } from './plist.js'

const bytesToBin = (bytes) => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return s
}
const binToBytes = (bin) => {
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

let caCache = null

async function loadCa(env) {
  if (caCache) return caCache
  if (!env.MDM_CA_KEY || !env.MDM_CA_CERT) throw new Error('MDM CA is not configured.')
  const key = await crypto.subtle.importKey('pkcs8', b64ToBytes(env.MDM_CA_KEY), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(bytesToBin(b64ToBytes(env.MDM_CA_CERT))))
  caCache = { key, cert }
  return caCache
}

function serial() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[0] &= 0x7f // positive
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/**
 * Issue an identity for one phone. Returns { p12: Uint8Array, password, certB64 }.
 */
export async function issueDeviceIdentity(env, commonName) {
  const ca = await loadCa(env)

  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  )
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
  const privateKey = forge.pki.privateKeyFromAsn1(forge.asn1.fromDer(bytesToBin(pkcs8)))

  const cert = forge.pki.createCertificate()
  cert.publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e)
  cert.serialNumber = serial()
  const now = new Date()
  cert.validity.notBefore = new Date(now.getTime() - 5 * 60 * 1000)
  cert.validity.notAfter = new Date(now.getTime() + 5 * 365 * 24 * 3600 * 1000)
  cert.setSubject([{ name: 'commonName', value: commonName }, { name: 'organizationName', value: env.ORG_NAME || 'DH Website Services' }])
  cert.setIssuer(ca.cert.subject.attributes)
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', clientAuth: true },
  ])

  // Sign with WebCrypto, then hand forge the result.
  cert.siginfo.algorithmOid = forge.pki.oids.sha256WithRSAEncryption
  cert.signatureOid = forge.pki.oids.sha256WithRSAEncryption
  const tbs = binToBytes(forge.asn1.toDer(forge.pki.getTBSCertificate(cert)).getBytes())
  cert.signature = bytesToBin(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', ca.key, tbs)))

  const password = bytesToB64(crypto.getRandomValues(new Uint8Array(18))).replace(/[+/=]/g, 'x')
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert, ca.cert], password, {
    algorithm: '3des', // the widest-supported choice for iOS configuration profiles
    count: 1,
    friendlyName: commonName,
  })
  const p12 = binToBytes(forge.asn1.toDer(p12Asn1).getBytes())
  const certB64 = bytesToB64(binToBytes(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()))
  return { p12, password, certB64 }
}

/** The CA certificate (DER) for the profile, so the phone trusts its own identity's issuer. */
export async function caCertDer(env) {
  return b64ToBytes(env.MDM_CA_CERT)
}
