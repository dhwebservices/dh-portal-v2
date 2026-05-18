import {
  enrichDocumentsWithSignedUrls,
  fetchPdfAnnotations,
  fetchPdfDocumentsForWorkspace,
  fetchPdfFolders,
  fetchPdfJobs,
  fetchPdfShares,
  fetchShareTargets,
  filterVisibleDocuments,
  filterVisibleFolders,
  isAllowedOrigin,
  json,
  normalizeScope,
  requirePdfWorkspaceAccess,
} from './_shared'

export async function onRequestGet(context) {
  if (!isAllowedOrigin(context.request, context.env)) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }

  try {
    const { identity, perms } = await requirePdfWorkspaceAccess(context.env, context.request)
    const url = new URL(context.request.url)
    const scope = normalizeScope(url.searchParams.get('scope') || 'personal')
    const folderId = String(url.searchParams.get('folderId') || '').trim()
    const view = String(url.searchParams.get('view') || 'recent').trim()
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase()

    const [documents, folders, shares, annotations, jobs, shareTargets] = await Promise.all([
      fetchPdfDocumentsForWorkspace(context.env),
      fetchPdfFolders(context.env),
      fetchPdfShares(context.env),
      fetchPdfAnnotations(context.env),
      fetchPdfJobs(context.env, identity.email),
      fetchShareTargets(context.env),
    ])

    const visibleFolders = filterVisibleFolders(folders, shares, identity.email, perms)
    let visibleDocuments = filterVisibleDocuments(documents, shares, identity.email, perms)

    if (scope === 'personal') {
      visibleDocuments = visibleDocuments.filter((doc) => doc.scope === 'personal' && doc.owner_email === identity.email)
    } else if (scope === 'shared') {
      visibleDocuments = visibleDocuments.filter((doc) => doc.scope === 'shared')
    } else if (scope === 'template') {
      visibleDocuments = visibleDocuments.filter((doc) => doc.scope === 'template' || doc.is_template === true)
    }

    if (folderId) visibleDocuments = visibleDocuments.filter((doc) => doc.folder_id === folderId)

    if (view === 'final') visibleDocuments = visibleDocuments.filter((doc) => doc.is_final)
    if (view === 'awaiting_signature') visibleDocuments = visibleDocuments.filter((doc) => doc.status === 'awaiting_signature')
    if (view === 'redacted') visibleDocuments = visibleDocuments.filter((doc) => doc.metadata?.redacted === true)
    if (view === 'compressed') visibleDocuments = visibleDocuments.filter((doc) => doc.metadata?.compressed === true)
    if (view === 'templates') visibleDocuments = visibleDocuments.filter((doc) => doc.is_template === true || doc.scope === 'template')

    if (q) {
      visibleDocuments = visibleDocuments.filter((doc) => {
        const haystack = [
          doc.title,
          doc.filename,
          doc.owner_name,
          doc.owner_email,
          doc.library_key,
          ...(Array.isArray(doc.tags) ? doc.tags : []),
        ].join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }

    const annotationsByDocument = (annotations || []).reduce((acc, annotation) => {
      const key = String(annotation.document_id || '')
      acc[key] = acc[key] || []
      acc[key].push(annotation)
      return acc
    }, {})

    const enrichedDocuments = (await enrichDocumentsWithSignedUrls(context.env, visibleDocuments)).map((doc) => ({
      ...doc,
      annotations: annotationsByDocument[doc.id] || [],
    }))

    return json({
      documents: enrichedDocuments,
      folders: visibleFolders,
      jobs,
      shareTargets,
      permissions: {
        pdf_workspace: perms?.pdf_workspace !== false,
        pdf_shared_view: perms?.pdf_shared_view === true || perms?.pdf_shared_edit === true || perms?.pdf_shared_admin === true,
        pdf_shared_edit: perms?.pdf_shared_edit === true || perms?.pdf_shared_admin === true,
        pdf_shared_admin: perms?.pdf_shared_admin === true,
      },
      libraries: [
        { key: 'personal', label: 'My PDFs', scope: 'personal' },
        { key: 'company', label: 'Shared Library', scope: 'shared' },
        { key: 'templates', label: 'Templates', scope: 'template' },
      ],
    })
  } catch (error) {
    console.warn('PDF workspace library failed:', error)
    return json({ error: error?.message || 'Could not load PDF workspace.' }, 500)
  }
}
