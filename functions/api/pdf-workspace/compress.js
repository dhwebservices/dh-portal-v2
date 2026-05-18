import { PDFDocument } from 'pdf-lib'
import {
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
    const bytes = await readStorageBytes(context.env, source.latest_path)
    const sourcePdf = await PDFDocument.load(bytes)

    job = await createPdfJob(context.env, {
      action: 'compress',
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      inputDocumentIds: [source.id],
      config: {},
    })

    const compressedBytes = await sourcePdf.save({ useObjectStreams: true, addDefaultPage: false })
    const output = await createDerivedPdfDocument(context.env, {
      sourceDocument: source,
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      createdByEmail: identity.email,
      createdByName: identity.name || identity.email,
      title: `${source.title} · compressed`,
      filename: `${source.filename.replace(/\.pdf$/i, '')}-compressed.pdf`,
      bytes: compressedBytes,
      tags: source.tags || [],
      metadata: {
        compressed: true,
        compressed_from: source.id,
        original_size: source.file_size || bytes.byteLength,
        compressed_size: compressedBytes.byteLength,
      },
    })

    await completePdfJob(context.env, job.id, {
      outputDocumentIds: [output.id],
      result: {
        original_size: source.file_size || bytes.byteLength,
        compressed_size: compressedBytes.byteLength,
      },
    })
    await insertAudit(context.env, {
      action: 'compress',
      actor_email: identity.email,
      actor_name: identity.name || identity.email,
      document_id: output.id,
      scope: source.scope,
      details: {
        original_size: source.file_size || bytes.byteLength,
        compressed_size: compressedBytes.byteLength,
      },
    })
    return json({ document: output, job_id: job.id })
  } catch (error) {
    await failPdfJob(context.env, job?.id, error).catch(() => {})
    console.warn('PDF compress failed:', error)
    return json({ error: error?.message || 'Could not compress the PDF.' }, 500)
  }
}
