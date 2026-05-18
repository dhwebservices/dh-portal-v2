import { degrees, PDFDocument } from 'pdf-lib'
import {
  completePdfJob,
  createDerivedPdfDocument,
  createPdfJob,
  failPdfJob,
  fetchPdfDocument,
  insertAudit,
  isAllowedOrigin,
  json,
  parsePageOrder,
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
    const pageCount = sourcePdf.getPageCount()
    const order = parsePageOrder(body?.order, pageCount)
    const rotation = Number(body?.rotation || 0)
    const pageNumbers = Array.isArray(body?.page_numbers) && body.page_numbers.length
      ? body.page_numbers.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= 1 && value <= pageCount)
      : order

    job = await createPdfJob(context.env, {
      action: 'reorder',
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      inputDocumentIds: [source.id],
      config: { order, rotation, page_numbers: pageNumbers },
    })

    const reordered = await PDFDocument.create()
    const copied = await reordered.copyPages(sourcePdf, order.map((page) => page - 1))
    copied.forEach((page, index) => {
      const sourcePageNumber = order[index]
      if (rotation && pageNumbers.includes(sourcePageNumber)) {
        const currentRotation = Number(page.getRotation()?.angle || 0)
        page.setRotation(degrees(currentRotation + rotation))
      }
      reordered.addPage(page)
    })
    const reorderedBytes = await reordered.save()
    const output = await createDerivedPdfDocument(context.env, {
      sourceDocument: source,
      ownerEmail: identity.email,
      ownerName: identity.name || identity.email,
      createdByEmail: identity.email,
      createdByName: identity.name || identity.email,
      title: `${source.title} · reordered`,
      filename: `${source.filename.replace(/\.pdf$/i, '')}-reordered.pdf`,
      bytes: reorderedBytes,
      tags: source.tags || [],
      metadata: { reordered_from: source.id, order, rotation, page_numbers: pageNumbers },
    })

    await completePdfJob(context.env, job.id, {
      outputDocumentIds: [output.id],
      result: { page_count: reordered.getPageCount() },
    })
    await insertAudit(context.env, {
      action: 'reorder',
      actor_email: identity.email,
      actor_name: identity.name || identity.email,
      document_id: output.id,
      scope: source.scope,
      details: { order, rotation, page_numbers: pageNumbers },
    })
    return json({ document: output, job_id: job.id })
  } catch (error) {
    await failPdfJob(context.env, job?.id, error).catch(() => {})
    console.warn('PDF reorder failed:', error)
    return json({ error: error?.message || 'Could not reorder the PDF.' }, 500)
  }
}
