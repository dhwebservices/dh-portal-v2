import {
  fetchPdfDocument,
  fetchPdfFolders,
  insertAudit,
  isAllowedOrigin,
  json,
  normalizeLibraryKey,
  normalizeScope,
  requirePdfWorkspaceAccess,
  supabaseFetch,
} from './_shared'

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) return json({ error: 'Origin is not allowed.' }, 403)
  try {
    const body = await context.request.json()
    const nextScope = normalizeScope(body?.scope || 'personal')
    const needSharedEdit = nextScope !== 'personal'
    const { identity } = await requirePdfWorkspaceAccess(context.env, context.request, { needSharedEdit })

    const documentId = String(body?.document_id || '').trim()
    const folderId = String(body?.folder_id || '').trim() || null
    if (!documentId) return json({ error: 'Select a document to move.' }, 400)
    const doc = await fetchPdfDocument(context.env, documentId)
    if (!doc) return json({ error: 'Document not found.' }, 404)
    if (folderId) {
      const folders = await fetchPdfFolders(context.env)
      const folder = (folders || []).find((row) => row.id === folderId)
      if (!folder) return json({ error: 'Folder not found.' }, 404)
    }

    const libraryKey = normalizeLibraryKey(body?.library_key || '', nextScope, identity.email)
    const rows = await supabaseFetch(context.env, `/rest/v1/pdf_documents?id=eq.${encodeURIComponent(documentId)}&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        scope: nextScope,
        library_key: libraryKey,
        folder_id: folderId,
        title: String(body?.title || '').trim() || doc.title,
        tags: Array.isArray(body?.tags) ? body.tags : doc.tags,
        is_final: body?.is_final === undefined ? doc.is_final : body.is_final === true,
        is_template: body?.is_template === undefined ? doc.is_template : body.is_template === true,
        updated_at: new Date().toISOString(),
        metadata: {
          ...(doc.metadata || {}),
          due_at: body?.due_at || doc.metadata?.due_at || null,
          workflow_status: body?.status || doc.metadata?.workflow_status || '',
        },
      }),
    })
    const updated = Array.isArray(rows) ? rows[0] : rows
    await insertAudit(context.env, {
      action: 'move',
      actor_email: identity.email,
      actor_name: identity.name || identity.email,
      document_id: updated?.id || documentId,
      scope: nextScope,
      details: {
        folder_id: folderId,
        library_key: libraryKey,
        scope: nextScope,
        status: body?.status || '',
        due_at: body?.due_at || null,
      },
    })
    return json({ document: updated })
  } catch (error) {
    console.warn('PDF move failed:', error)
    return json({ error: error?.message || 'Could not move the PDF document.' }, 500)
  }
}
