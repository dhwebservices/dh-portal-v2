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
  parsePageRanges,
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
    const ranges = parsePageRanges(body?.ranges, sourcePdf.getPageCount())

    job = await createPdfJob(context.env, {
      action: 'split',
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      inputDocumentIds: [source.id],
      config: { ranges },
    })

    const outputs = []
    for (const range of ranges) {
      const next = await PDFDocument.create()
      const indexes = Array.from({ length: range.to - range.from + 1 }, (_, offset) => range.from - 1 + offset)
      const copied = await next.copyPages(sourcePdf, indexes)
      copied.forEach((page) => next.addPage(page))
      const nextBytes = await next.save()
      const doc = await createDerivedPdfDocument(context.env, {
        sourceDocument: source,
        ownerEmail: identity.email,
        ownerName: identity.name || identity.email,
        createdByEmail: identity.email,
        createdByName: identity.name || identity.email,
        title: `${source.title} · pages ${range.from}-${range.to}`,
        filename: `${source.filename.replace(/\.pdf$/i, '')}-${range.from}-${range.to}.pdf`,
        bytes: nextBytes,
        tags: source.tags || [],
        metadata: { split_from: source.id, range },
      })
      outputs.push(doc)
    }

    await completePdfJob(context.env, job.id, {
      outputDocumentIds: outputs.map((row) => row.id),
      result: { count: outputs.length },
    })
    await insertAudit(context.env, {
      action: 'split',
      actor_email: identity.email,
      actor_name: identity.name || identity.email,
      document_id: source.id,
      scope: source.scope,
      details: { ranges },
    })
    return json({ documents: outputs, job_id: job.id })
  } catch (error) {
    await failPdfJob(context.env, job?.id, error).catch(() => {})
    console.warn('PDF split failed:', error)
    return json({ error: error?.message || 'Could not split the PDF.' }, 500)
  }
}
