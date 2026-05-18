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
} from './_shared'

export async function onRequestPost(context) {
  if (!isAllowedOrigin(context.request, context.env)) return json({ error: 'Origin is not allowed.' }, 403)
  let job = null
  try {
    const { identity } = await requirePdfWorkspaceAccess(context.env, context.request)
    const body = await context.request.json()
    const source = await fetchPdfDocument(context.env, body?.document_id)
    if (!source) return json({ error: 'Source PDF was not found.' }, 404)
    const redactions = Array.isArray(body?.redactions) ? body.redactions : []
    if (!redactions.length) return json({ error: 'Add at least one redaction area.' }, 400)
    const bytes = await readStorageBytes(context.env, source.latest_path)

    job = await createPdfJob(context.env, {
      action: 'redact-export',
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      inputDocumentIds: [source.id],
      config: { redactions },
    })

    const outputBytes = await annotatePdfBytes(bytes, redactions.map((item) => ({ ...item, type: 'redaction' })))
    const output = await createDerivedPdfDocument(context.env, {
      sourceDocument: source,
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      createdByEmail: identity.email,
      createdByName: identity.name || identity.email,
      title: `${source.title} · redacted`,
      filename: `${source.filename.replace(/\.pdf$/i, '')}-redacted.pdf`,
      bytes: outputBytes,
      tags: source.tags || [],
      metadata: {
        redacted: true,
        redaction_count: redactions.length,
      },
      isFinal: body?.mark_final === true,
      status: body?.mark_final === true ? 'final' : 'active',
    })

    await completePdfJob(context.env, job.id, {
      outputDocumentIds: [output.id],
      result: { redaction_count: redactions.length },
    })
    await insertAudit(context.env, {
      action: 'redact',
      actor_email: identity.email,
      actor_name: identity.name || identity.email,
      document_id: output.id,
      scope: source.scope,
      details: { redaction_count: redactions.length },
    })
    return json({ document: output, job_id: job.id })
  } catch (error) {
    await failPdfJob(context.env, job?.id, error).catch(() => {})
    console.warn('PDF redact failed:', error)
    return json({ error: error?.message || 'Could not create the redacted PDF.' }, 500)
  }
}
