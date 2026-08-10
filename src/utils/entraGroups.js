/**
 * Entra security/distribution group registry.
 *
 * Settings → Entra Groups pulls the real group list from Entra (via
 * /api/microsoft-directory) so groups are picked from a dropdown rather than
 * pasted in as GUIDs. Each entry is marked automatic (every new starter joins)
 * or optional (a tick-box on the new-starter form). Creation then applies them
 * via Graph, replacing the manual trip into Entra to set membership by hand.
 *
 * Stored as a single portal_settings row, same shape/pattern as the
 * department catalog in orgStructure.js.
 *
 * Depends on these Application permissions on the "DH portal" app registration
 * (App ID 79722400-3699-4f12-a4a1-df71949b5805), all admin-consented:
 * GroupMember.ReadWrite.All, Organization.Read.All, User.ReadWrite.All.
 */

export const MICROSOFT_DIRECTORY_API_PATH = '/api/microsoft-directory'

export function buildEntraGroupCatalogKey() {
  return 'entra_group_catalog'
}

/** Fetch real groups and/or licence SKUs from Entra so pickers show live data. */
export async function fetchEntraDirectory(resource = 'all') {
  const response = await fetch(`${MICROSOFT_DIRECTORY_API_PATH}?resource=${encodeURIComponent(resource)}`)
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.error) {
    throw new Error(result?.error || 'Could not reach Microsoft Entra.')
  }
  return result
}

/** Is this work email already taken in Entra? */
export async function isWorkEmailAvailable(upn = '') {
  const response = await fetch(`${MICROSOFT_DIRECTORY_API_PATH}?resource=check-upn&upn=${encodeURIComponent(upn)}`)
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.error) throw new Error(result?.error || 'Could not check the work email.')
  return result.available === true
}

/**
 * firstname@domain, falling back to firstname.lastname@domain if taken.
 * Strips accents and anything Entra won't accept in a mail nickname.
 */
export function suggestWorkEmails(fullName = '', domain = 'dhwebsiteservices.co.uk') {
  const clean = (value) => String(value || '')
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return []

  const first = clean(parts[0])
  const last = clean(parts[parts.length - 1])
  if (!first) return []

  const candidates = [first]
  if (last && last !== first) {
    candidates.push(`${first}.${last}`)
    candidates.push(`${first}${last[0]}`)
  }
  return [...new Set(candidates)].map((local) => `${local}@${domain}`)
}

/**
 * Temporary password for first sign-in. Entra requires 3 of 4 character
 * classes; this always includes all four and avoids characters that are easy
 * to misread when the new starter types it out of the welcome email.
 */
export function generateTemporaryPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'   // no I or O
  const lower = 'abcdefghijkmnpqrstuvwxyz'   // no l or o
  const digits = '23456789'                  // no 0 or 1
  const symbols = '!@#$%*?+'
  const all = upper + lower + digits + symbols

  const pick = (set, count = 1) => Array.from(
    { length: count },
    () => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length],
  )

  const chars = [
    ...pick(upper, 2),
    ...pick(lower, 6),
    ...pick(digits, 3),
    ...pick(symbols, 2),
    ...pick(all, 3),
  ]

  // Fisher-Yates with crypto randomness so the class ordering isn't predictable.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

export function createEntraGroupSkeleton(name = '') {
  return {
    id: crypto.randomUUID(),
    name: String(name || '').trim(),
    group_id: '',
    auto_assign: true,
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function mergeEntraGroupCatalog(raw = []) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ({
      id: item?.id || crypto.randomUUID(),
      name: String(item?.name || '').trim(),
      group_id: String(item?.group_id || '').trim(),
      auto_assign: item?.auto_assign !== false,
      active: item?.active !== false,
      created_at: item?.created_at || new Date().toISOString(),
      updated_at: item?.updated_at || item?.created_at || new Date().toISOString(),
    }))
    .filter((item) => item.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Resolve which group IDs a new starter should be added to.
 * Every active auto_assign group, plus any optional groups explicitly ticked.
 */
export function resolveStarterGroupIds(catalog = [], selectedOptionalIds = []) {
  const selected = new Set(selectedOptionalIds || [])
  return mergeEntraGroupCatalog(catalog)
    .filter((group) => group.active && group.group_id)
    .filter((group) => group.auto_assign || selected.has(group.id))
    .map((group) => group.group_id)
}
