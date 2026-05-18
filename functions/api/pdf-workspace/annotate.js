import {
  annotatePdfBytes,
  completePdfJob,
  createDerivedPdfDocument,
  createPdfJob,
  failPdfJob,
  fetchPdfDocument,
  insertAudit,
  isAllowedOrigin,
  json,
  readStorageBytes,
  requirePdfWorkspaceAccess,
  supabaseFetch,
  currentIso,
} from './_shared'

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) return json({ error: 'Origin is not allowed.' }, 403)
  let job = null
  try {
    const { identity } = await requirePdfWorkspaceAccess(context.env, context.request)
    const body = await context.request.json()
    const source = await fetchPdfDocument(context.env, body?.document_id)
    if (!source) return json({ error: 'Source PDF was not found.' }, 404)
    const annotations = Array.isArray(body?.annotations) ? body.annotations : []
    if (!annotations.length) return json({ error: 'Add at least one annotation.' }, 400)
    const bytes = await readStorageBytes(context.env, source.latest_path)

    job = await createPdfJob(context.env, {
      action: 'annotate',
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      inputDocumentIds: [source.id],
      config: { annotation_count: annotations.length },
    })

    const outputBytes = await annotatePdfBytes(bytes, annotations)
    const output = await createDerivedPdfDocument(context.env, {
      sourceDocument: source,
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      createdByEmail: identity.email,
      createdByName: identity.name || identity.email,
      title: `${source.title} · annotated`,
      filename: `${source.filename.replace(/\.pdf$/i, '')}-annotated.pdf`,
      bytes: outputBytes,
      tags: source.tags || [],
      metadata: { annotated: true, annotation_count: annotations.length },
    })

    const rows = annotations.map((annotation) => ({
      document_id: output.id,
      page_number: Number(annotation.page || annotation.page_number || 1),
      annotation_type: String(annotation.type || annotation.annotation_type || 'text'),
      payload: annotation,
      created_by_email: identity.email,
      created_by_name: identity.name || identity.email,
      created_at: currentIso(),
      updated_at: currentIso(),
    }))
    await supabaseFetch(context.env, '/rest/v1/pdf_annotations', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    })

    await completePdfJob(context.env, job.id, {
      outputDocumentIds: [output.id],
      result: { annotation_count: annotations.length },
    })
    await insertAudit(context.env, {
      action: 'edit',
      actor_email: identity.email,
      actor_name: identity.name || identity.email,
      document_id: output.id,
      scope: source.scope,
      details: { annotation_count: annotations.length },
    })
    return json({ document: output, job_id: job.id })
  } catch (error) {
    await failPdfJob(context.env, job?.id, error).catch(() => {})
    console.warn('PDF annotate failed:', error)
    return json({ error: error?.message || 'Could not save annotations.' }, 500)
  }
}
