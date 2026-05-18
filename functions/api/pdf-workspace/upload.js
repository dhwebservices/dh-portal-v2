import {
  createPdfDocumentPayload,
  ensurePdfBytesFromUpload,
  insertAudit,
  insertPdfDocument,
  isAllowedOrigin,
  json,
  normalizeLibraryKey,
  normalizeScope,
  normalizeTagList,
  requirePdfWorkspaceAccess,
  storageUpload,
  buildPdfStoragePath,
} from './_shared'

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }

  try {
    const { identity } = await requirePdfWorkspaceAccess(context.env, context.request)
    const formData = await context.request.formData()
    const files = formData.getAll('files').filter((item) => item instanceof File)
    if (!files.length) {
      return json({ error: 'Upload at least one PDF or image.' }, 400)
    }

    const scope = normalizeScope(formData.get('scope') || 'personal')
    const needSharedEdit = scope !== 'personal'
    if (needSharedEdit) {
      await requirePdfWorkspaceAccess(context.env, context.request, { needSharedEdit: true })
    }
    const folderId = String(formData.get('folder_id') || '').trim() || null
    const libraryKey = normalizeLibraryKey(formData.get('library_key') || '', scope, identity.email)
    const tags = normalizeTagList(formData.get('tags') || '')

    const created = []
    for (const file of files) {
      const { bytes, filename } = await ensurePdfBytesFromUpload(file)
      const documentId = crypto.randomUUID()
      const storagePath = buildPdfStoragePath({
        ownerEmail: identity.email,
        scope,
        documentId,
        filename,
        variant: 'original',
      })
      await storageUpload(context.env, storagePath, bytes, 'application/pdf')
      const payload = createPdfDocumentPayload({
        rootDocumentId: documentId,
        scope,
        libraryKey,
        folderId,
        ownerEmail: identity.email,
        ownerName: identity.name || identity.email,
        createdByEmail: identity.email,
        createdByName: identity.name || identity.email,
        title: String(formData.get('title') || '').trim() || filename.replace(/\.pdf$/i, ''),
        filename,
        fileSize: bytes.byteLength,
        originalPath: storagePath,
        latestPath: storagePath,
        tags,
        metadata: {
          imported_from: file.type || 'upload',
          converted_from_image: file.type?.startsWith('image/') === true,
        },
        status: 'active',
        isTemplate: scope === 'template',
      })
      const row = await insertPdfDocument(context.env, { ...payload, id: documentId })
      created.push(row)
      await insertAudit(context.env, {
        action: 'upload',
        actor_email: identity.email,
        actor_name: identity.name || identity.email,
        document_id: row.id,
        scope,
        details: {
          filename,
          file_size: bytes.byteLength,
          scope,
          library_key: libraryKey,
        },
      })
    }

    return json({ documents: created })
  } catch (error) {
    console.warn('PDF upload failed:', error)
    return json({ error: error?.message || 'Could not upload PDF files.' }, 500)
  }
}
