/**
 * The enrolment profile (.mobileconfig) a phone installs to join DH device
 * management. It carries the phone's identity certificate and the MDM payload.
 *
 * AccessRights decides, on the phone itself, what we are allowed to do. Erase
 * (8) is deliberately left out, so this MDM can never wipe a phone, and the
 * phone's Settings shows that to the person enrolling.
 */
import { issueDeviceIdentity } from './certs.js'

export const PROFILE_ID = 'uk.co.dhwebsiteservices.mdm'

const RIGHTS = {
  inspectProfiles: 1,
  installProfiles: 2,
  lockAndPasscode: 4,
  // erase: 8 -- never granted
  deviceInfo: 16,
  networkInfo: 32,
  inspectProvisioning: 64,
  installProvisioning: 128,
  inspectApps: 256,
  restrictionQueries: 512,
  securityQueries: 1024,
  settings: 2048,
  manageApps: 4096,
}
export const ACCESS_RIGHTS = Object.values(RIGHTS).reduce((a, b) => a + b, 0)

export async function buildEnrollmentProfile(env, { secret, email, name }) {
  const identityUuid = crypto.randomUUID().toUpperCase()
  const { p12, password } = await issueDeviceIdentity(env, `DH MDM ${email}`)
  const base = env.PUBLIC_URL.replace(/\/$/, '')
  const org = env.ORG_NAME || 'DH Website Services'

  return {
    PayloadType: 'Configuration',
    PayloadVersion: 1,
    PayloadIdentifier: PROFILE_ID,
    PayloadUUID: crypto.randomUUID().toUpperCase(),
    PayloadDisplayName: `${org} device management`,
    PayloadOrganization: org,
    PayloadDescription: `Lets ${org} see this iPhone's model, iOS version, storage, battery and security settings, list its apps, and lock it if it is lost. It cannot erase the phone, read messages, photos, email or browsing, or see where it is. Remove it at any time in Settings > General > VPN & Device Management.${name ? ` Enrolled for ${name}.` : ''}`,
    PayloadScope: 'System',
    PayloadRemovalDisallowed: false,
    PayloadContent: [
      {
        PayloadType: 'com.apple.security.pkcs12',
        PayloadVersion: 1,
        PayloadIdentifier: `${PROFILE_ID}.identity`,
        PayloadUUID: identityUuid,
        PayloadDisplayName: 'Device identity',
        PayloadCertificateFileName: 'dh-device.p12',
        PayloadContent: p12,
        Password: password,
      },
      {
        PayloadType: 'com.apple.mdm',
        PayloadVersion: 1,
        PayloadIdentifier: `${PROFILE_ID}.mdm`,
        PayloadUUID: crypto.randomUUID().toUpperCase(),
        PayloadDisplayName: 'Device management',
        ServerURL: `${base}/mdm/connect?s=${secret}`,
        CheckInURL: `${base}/mdm/checkin?s=${secret}`,
        Topic: env.MDM_PUSH_TOPIC,
        IdentityCertificateUUID: identityUuid,
        AccessRights: ACCESS_RIGHTS,
        CheckOutWhenRemoved: true,
        SignMessage: false,
      },
    ],
  }
}
