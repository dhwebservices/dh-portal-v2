import {
  fetchPdfDocument,
  fetchPdfFolders,
  insertAudit,
  isAllowedOrigin,
  json,
  normalizeEmail,
  requirePdfWorkspaceAccess,
  supabaseFetch,
  currentIso,
} from './_shared'

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) return json({ error: 'Origin is not allowed.' }, 403)
  try {
    const { identity } = await requirePdfWorkspaceAccess(context.env, context.request, { needSharedEdit: true })
    const body = await context.request.json()
    const accessLevel = ['view', 'comment', 'edit', 'admin'].includes(body?.access_level) ? body.access_level : 'view'
    const sharedWithEmail = normalizeEmail(body?.shared_with_email || '')
    const documentId = String(body?.document_id || '').trim()
    const folderId = String(body?.folder_id || '').trim()
    if (!documentId && !folderId) return json({ error: 'Select a document or folder to share.' }, 400)
    if (!sharedWithEmail && !body?.shared_with_permission) return json({ error: 'Choose a staff member or permission group.' }, 400)

    if (documentId) {
      const doc = await fetchPdfDocument(context.env, documentId)
      if (!doc) return json({ error: 'Document not found.' }, 404)
    }
    if (folderId) {
      const folders = await fetchPdfFolders(context.env)
      const folder = (folders || []).find((row) => row.id === folderId)
      if (!folder) return json({ error: 'Folder not found.' }, 404)
    }

    await supabaseFetch(context.env, '/rest/v1/pdf_shares', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([{
        document_id: documentId || null,
        folder_id: folderId || null,
        shared_with_email: sharedWithEmail || null,
        shared_with_permission: body?.shared_with_permission || null,
        access_level: accessLevel,
        metadata: {
          due_at: body?.due_at || null,
          status: body?.status || '',
          note: body?.note || '',
        },
        created_by_email: identity.email,
        created_by_name: identity.name || identity.email,
        created_at: currentIso(),
        updated_at: currentIso(),
      }]),
    })

    await insertAudit(context.env, {
      action: 'share',
      actor_email: identity.email,
      actor_name: identity.name || identity.email,
      document_id: documentId || null,
      folder_id: folderId || null,
      scope: body?.scope || 'shared',
      details: {
        shared_with_email: sharedWithEmail,
        shared_with_permission: body?.shared_with_permission || '',
        access_level: accessLevel,
      },
    })
    return json({ ok: true })
  } catch (error) {
    console.warn('PDF share failed:', error)
    return json({ error: error?.message || 'Could not share the PDF item.' }, 500)
  }
}
