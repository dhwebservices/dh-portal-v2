import { PDFDocument } from 'pdf-lib'
import {
  completePdfJob,
  createDerivedPdfDocument,
  createPdfJob,
  failPdfJob,
  fetchPdfDocuments,
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
    const ids = Array.isArray(body?.document_ids) ? body.document_ids.map(String).filter(Boolean) : []
    if (ids.length < 2) return json({ error: 'Select at least two PDFs to merge.' }, 400)
    const docs = await fetchPdfDocuments(context.env, ids)
    if (docs.length < 2) return json({ error: 'One or more PDFs could not be found.' }, 404)

    job = await createPdfJob(context.env, {
      action: 'merge',
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      inputDocumentIds: ids,
      config: { count: ids.length },
    })

    const merged = await PDFDocument.create()
    for (const doc of docs) {
      const bytes = await readStorageBytes(context.env, doc.latest_path)
      const source = await PDFDocument.load(bytes)
      const copiedPages = await merged.copyPages(source, source.getPageIndices())
      copiedPages.forEach((page) => merged.addPage(page))
    }

    const mergedBytes = await merged.save()
    const sourceRoot = docs[0]
    const output = await createDerivedPdfDocument(context.env, {
      sourceDocument: sourceRoot,
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      createdByEmail: identity.email,
      createdByName: identity.name || identity.email,
      title: String(body?.title || `Merged PDF · ${docs.length} files`).trim(),
      filename: String(body?.filename || 'merged-document.pdf').trim(),
      bytes: mergedBytes,
      tags: sourceRoot.tags || [],
      metadata: { merged_from: ids },
    })

    await completePdfJob(context.env, job.id, {
      outputDocumentIds: [output.id],
      result: { page_count: merged.getPageCount() },
    })
    await insertAudit(context.env, {
      action: 'merge',
      actor_email: identity.email,
      actor_name: identity.name || identity.email,
      document_id: output.id,
      scope: sourceRoot.scope,
      details: { merged_from: ids },
    })
    return json({ document: output, job_id: job.id })
  } catch (error) {
    await failPdfJob(context.env, job?.id, error).catch(() => {})
    console.warn('PDF merge failed:', error)
    return json({ error: error?.message || 'Could not merge PDFs.' }, 500)
  }
}
