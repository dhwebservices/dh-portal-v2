/**
 * Entra security/distribution group registry.
 *
 * David maintains this list once in Settings → Entra Groups (paste each
 * group's Object ID from the Entra admin center). New-starter creation then
 * adds the account to every `auto_assign` group automatically, plus any
 * optional groups ticked on the form - replacing the manual trip into Entra
 * to set group membership by hand.
 *
 * Stored as a single portal_settings row, same shape/pattern as the
 * department catalog in orgStructure.js.
 *
 * SETUP REQUIRED before this does anything: the "DH portal" Entra app
 * registration (App ID 79722400-3699-4f12-a4a1-df71949b5805) needs the
 * GroupMember.ReadWrite.All *Application* permission with tenant admin
 * consent - it currently only has Mail.Read and User.ReadWrite.All. Without
 * it, accounts are still created correctly but every group assignment fails.
 */

export function buildEntraGroupCatalogKey() {
  return 'entra_group_catalog'
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
