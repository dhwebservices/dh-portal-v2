import {
  insertAudit,
  isAllowedOrigin,
  json,
  normalizeLibraryKey,
  normalizeScope,
  normalizeSlugPart,
  requirePdfWorkspaceAccess,
  supabaseFetch,
  currentIso,
} from './_shared'

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) return json({ error: 'Origin is not allowed.' }, 403)
  try {
    const body = await context.request.json()
    const scope = normalizeScope(body?.scope || 'personal')
    const needSharedEdit = scope !== 'personal'
    const { identity } = await requirePdfWorkspaceAccess(context.env, context.request, { needSharedEdit })
    const name = String(body?.name || '').trim()
    if (!name) return json({ error: 'Add a folder name.' }, 400)
    const rows = await supabaseFetch(context.env, '/rest/v1/pdf_folders?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{
        scope,
        name,
        slug: normalizeSlugPart(name),
        owner_email: scope === 'personal' ? identity.email : null,
        library_key: normalizeLibraryKey(body?.library_key || '', scope, identity.email),
        parent_id: body?.parent_id || null,
        description: String(body?.description || '').trim(),
        metadata: body?.metadata || {},
        created_by_email: identity.email,
        created_by_name: identity.name || identity.email,
        created_at: currentIso(),
        updated_at: currentIso(),
      }]),
    })
    const folder = Array.isArray(rows) ? rows[0] : rows
    await insertAudit(context.env, {
      action: 'folder_create',
      actor_email: identity.email,
      actor_name: identity.name || identity.email,
      folder_id: folder?.id || null,
      scope,
      details: { name },
    })
    return json({ folder })
  } catch (error) {
    console.warn('PDF folder create failed:', error)
    return json({ error: error?.message || 'Could not create the folder.' }, 500)
  }
}
