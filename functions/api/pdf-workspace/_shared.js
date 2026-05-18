import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const DEFAULT_ALLOWED_ORIGINS = [
  'https://staff.dhwebsiteservices.co.uk',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

const DEFAULT_SUPABASE_URL = 'https://xtunnfdwltfesscmpove.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'
const PDF_BUCKET = 'pdf-workspace'
const PDF_PREVIEW_TTL = 60 * 60

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

export function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS)
}

function resolveRequestOrigin(request) {
  const origin = request.headers.get('origin')
  if (origin) return origin
  const referer = request.headers.get('referer')
  if (!referer) return ''
  try {
    return new URL(referer).origin
  } catch {
    return ''
  }
}

export function isAllowedOrigin(request, env) {
  const origin = resolveRequestOrigin(request)
  if (!origin) return false
  return getAllowedOrigins(env).has(origin)
}

export function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function normalizeTagList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function normalizeSlugPart(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeScope(value = '') {
  const safe = String(value || '').trim().toLowerCase()
  if (['personal', 'shared', 'template'].includes(safe)) return safe
  return 'personal'
}

export function normalizeLibraryKey(value = '', scope = 'personal', ownerEmail = '') {
  const safe = normalizeSlugPart(value)
  if (safe) return safe
  if (scope === 'template') return 'templates'
  if (scope === 'shared') return 'company'
  return ownerEmail || 'personal'
}

export function currentIso() {
  return new Date().toISOString()
}

function buildStoragePath(path = '') {
  return String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function resolveSupabaseConfig(env) {
  const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).trim()
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON || DEFAULT_SUPABASE_ANON_KEY).trim()
  return {
    url,
    serviceKey,
    anonKey,
  }
}

export function getRequesterIdentity(request) {
  const email = normalizeEmail(request.headers.get('x-staff-email') || request.headers.get('x-user-email') || '')
  const name = String(request.headers.get('x-staff-name') || request.headers.get('x-user-name') || '').trim()
  return { email, name }
}

export async function supabaseFetch(env, path, options = {}) {
  const { url, serviceKey, anonKey } = resolveSupabaseConfig(env)
  const token = options.useAnon ? anonKey : (serviceKey || anonKey)
  if (!url || !token) {
    throw new Error('PDF workspace is not configured.')
  }

  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Supabase request failed (${response.status}): ${errorText}`)
  }

  if (response.status === 204) return null
  return response.json().catch(() => null)
}

export async function storageUpload(env, path, bytes, contentType = 'application/pdf') {
  const { url, serviceKey, anonKey } = resolveSupabaseConfig(env)
  const token = serviceKey || anonKey
  if (!url || !token) throw new Error('PDF workspace storage is not configured.')
  const response = await fetch(`${url}/storage/v1/object/${PDF_BUCKET}/${buildStoragePath(path)}`, {
    method: 'POST',
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body: bytes,
  })
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Storage upload failed (${response.status}): ${errorText}`)
  }
  return true
}

export async function createSignedObjectUrl(env, path, expiresIn = PDF_PREVIEW_TTL) {
  const { url, serviceKey, anonKey } = resolveSupabaseConfig(env)
  const token = serviceKey || anonKey
  if (!url || !token || !path) return ''
  const response = await fetch(`${url}/storage/v1/object/sign/${PDF_BUCKET}/${buildStoragePath(path)}`, {
    method: 'POST',
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  })
  if (!response.ok) return ''
  const result = await response.json().catch(() => null)
  const signedPath = result?.signedUrl || result?.signedURL || result?.signed_url || ''
  if (!signedPath) return ''
  return signedPath.startsWith('http') ? signedPath : `${url}/storage/v1${signedPath}`
}

export async function readStorageBytes(env, path) {
  const signedUrl = await createSignedObjectUrl(env, path, 120)
  if (!signedUrl) throw new Error('Could not prepare secure access to the PDF file.')
  const response = await fetch(signedUrl)
  if (!response.ok) throw new Error(`Could not load stored PDF (${response.status}).`)
  const buffer = await response.arrayBuffer()
  return new Uint8Array(buffer)
}

export async function insertAudit(env, payload = {}) {
  await supabaseFetch(env, '/rest/v1/pdf_audit', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{
      action: String(payload.action || '').trim() || 'unknown',
      actor_email: normalizeEmail(payload.actor_email || ''),
      actor_name: String(payload.actor_name || '').trim(),
      document_id: payload.document_id || null,
      folder_id: payload.folder_id || null,
      scope: normalizeScope(payload.scope || ''),
      details: payload.details || {},
      created_at: currentIso(),
    }]),
  })
}

export async function loadUserPermissions(env, email = '') {
  const safeEmail = normalizeEmail(email)
  if (!safeEmail) return {}
  const rows = await supabaseFetch(env, `/rest/v1/user_permissions?select=permissions&user_email=ilike.${encodeURIComponent(safeEmail)}&limit=1`)
  const first = Array.isArray(rows) ? rows[0] : null
  return first?.permissions && typeof first.permissions === 'object' ? first.permissions : {}
}

export async function requirePdfWorkspaceAccess(env, request, { needSharedView = false, needSharedEdit = false, needSharedAdmin = false } = {}) {
  const identity = getRequesterIdentity(request)
  if (!identity.email) {
    throw new Error('Missing portal user identity.')
  }
  const perms = await loadUserPermissions(env, identity.email)
  const canWorkspace = perms?.pdf_workspace !== false
  if (!canWorkspace) {
    throw new Error('You do not have access to PDF Workspace.')
  }
  if (needSharedView && perms?.pdf_shared_view !== true && perms?.pdf_shared_edit !== true && perms?.pdf_shared_admin !== true) {
    throw new Error('You do not have access to shared PDF libraries.')
  }
  if (needSharedEdit && perms?.pdf_shared_edit !== true && perms?.pdf_shared_admin !== true) {
    throw new Error('You do not have permission to edit shared PDF libraries.')
  }
  if (needSharedAdmin && perms?.pdf_shared_admin !== true) {
    throw new Error('You do not have permission to manage shared PDF libraries.')
  }
  return { identity, perms }
}

export async function createPdfJob(env, { action = '', ownerEmail = '', ownerName = '', inputDocumentIds = [], config = {} } = {}) {
  const createdRows = await supabaseFetch(env, '/rest/v1/pdf_jobs?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{
      action,
      status: 'running',
      owner_email: normalizeEmail(ownerEmail),
      owner_name: String(ownerName || '').trim(),
      created_by_email: normalizeEmail(ownerEmail),
      created_by_name: String(ownerName || '').trim(),
      input_document_ids: inputDocumentIds,
      config,
      created_at: currentIso(),
      started_at: currentIso(),
    }]),
  })
  return Array.isArray(createdRows) ? createdRows[0] : createdRows
}

export async function completePdfJob(env, jobId, { outputDocumentIds = [], result = {} } = {}) {
  if (!jobId) return
  await supabaseFetch(env, `/rest/v1/pdf_jobs?id=eq.${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'completed',
      output_document_ids: outputDocumentIds,
      result,
      completed_at: currentIso(),
    }),
  })
}

export async function failPdfJob(env, jobId, error) {
  if (!jobId) return
  await supabaseFetch(env, `/rest/v1/pdf_jobs?id=eq.${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'failed',
      error_message: error?.message || String(error || 'PDF job failed'),
      completed_at: currentIso(),
    }),
  })
}

export function buildPdfStoragePath({
  ownerEmail = '',
  scope = 'personal',
  documentId = '',
  filename = '',
  variant = 'original',
} = {}) {
  const safeOwner = normalizeSlugPart(ownerEmail || 'shared')
  const safeScope = normalizeScope(scope)
  const safeFile = String(filename || 'document.pdf').replace(/[^a-zA-Z0-9._-]+/g, '-')
  return `${safeScope}/${safeOwner}/${documentId}/${variant}-${Date.now()}-${safeFile}`
}

export function createPdfDocumentPayload({
  sourceDocumentId = null,
  rootDocumentId = null,
  versionNumber = 1,
  scope = 'personal',
  libraryKey = '',
  folderId = null,
  ownerEmail = '',
  ownerName = '',
  createdByEmail = '',
  createdByName = '',
  title = '',
  filename = '',
  fileSize = 0,
  originalPath = '',
  latestPath = '',
  tags = [],
  metadata = {},
  status = 'active',
  isTemplate = false,
  isFinal = false,
} = {}) {
  return {
    root_document_id: rootDocumentId,
    source_document_id: sourceDocumentId,
    version_number: versionNumber,
    scope: normalizeScope(scope),
    library_key: normalizeLibraryKey(libraryKey, scope, ownerEmail),
    folder_id: folderId,
    owner_email: normalizeEmail(ownerEmail),
    owner_name: String(ownerName || '').trim(),
    created_by_email: normalizeEmail(createdByEmail),
    created_by_name: String(createdByName || '').trim(),
    title: String(title || filename || 'Untitled PDF').trim(),
    filename: String(filename || 'document.pdf').trim(),
    mime_type: 'application/pdf',
    file_size: Number(fileSize || 0),
    bucket: PDF_BUCKET,
    original_path: originalPath,
    latest_path: latestPath,
    status,
    tags: normalizeTagList(tags),
    metadata,
    is_template: isTemplate,
    is_final: isFinal,
    created_at: currentIso(),
    updated_at: currentIso(),
  }
}

export async function insertPdfDocument(env, payload) {
  const rows = await supabaseFetch(env, '/rest/v1/pdf_documents?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([payload]),
  })
  return Array.isArray(rows) ? rows[0] : rows
}

export async function patchPdfDocument(env, id, payload) {
  const rows = await supabaseFetch(env, `/rest/v1/pdf_documents?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...payload, updated_at: currentIso() }),
  })
  return Array.isArray(rows) ? rows[0] : rows
}

export async function fetchPdfDocument(env, id) {
  const rows = await supabaseFetch(env, `/rest/v1/pdf_documents?select=*&id=eq.${encodeURIComponent(id)}&deleted_at=is.null&limit=1`)
  return Array.isArray(rows) ? rows[0] || null : null
}

export async function fetchPdfDocuments(env, ids = []) {
  const clean = ids.map((id) => String(id || '').trim()).filter(Boolean)
  if (!clean.length) return []
  return supabaseFetch(env, `/rest/v1/pdf_documents?select=*&id=in.(${clean.map((id) => encodeURIComponent(id)).join(',')})&deleted_at=is.null`)
}

export async function fetchPdfShares(env) {
  return supabaseFetch(env, '/rest/v1/pdf_shares?select=*')
}

export async function fetchPdfFolders(env) {
  return supabaseFetch(env, '/rest/v1/pdf_folders?select=*&deleted_at=is.null&order=scope.asc&order=name.asc')
}

export async function fetchPdfAnnotations(env) {
  return supabaseFetch(env, '/rest/v1/pdf_annotations?select=*&order=created_at.asc')
}

export async function fetchPdfJobs(env, ownerEmail = '') {
  if (!ownerEmail) return []
  return supabaseFetch(env, `/rest/v1/pdf_jobs?select=*&owner_email=eq.${encodeURIComponent(normalizeEmail(ownerEmail))}&order=created_at.desc&limit=30`)
}

export async function fetchPdfDocumentsForWorkspace(env) {
  return supabaseFetch(env, '/rest/v1/pdf_documents?select=*&deleted_at=is.null&order=updated_at.desc&limit=200')
}

export async function fetchShareTargets(env) {
  const [profiles, lifecycleRows] = await Promise.all([
    supabaseFetch(env, '/rest/v1/hr_profiles?select=user_email,full_name,role,department&order=full_name.asc'),
    supabaseFetch(env, '/rest/v1/portal_settings?select=key,value'),
  ])
  const lifecycleMap = new Map(
    (lifecycleRows || [])
      .filter((row) => String(row?.key || '').startsWith('staff_lifecycle:'))
      .map((row) => {
        const email = normalizeEmail(String(row.key || '').replace('staff_lifecycle:', ''))
        const value = row?.value?.value ?? row?.value ?? {}
        return [email, String(value.state || '').trim().toLowerCase()]
      })
  )
  return (profiles || [])
    .filter((row) => {
      const state = lifecycleMap.get(normalizeEmail(row.user_email)) || ''
      return !['terminated', 'termination_approved', 'left', 'archived'].includes(state)
    })
    .map((row) => ({
      email: normalizeEmail(row.user_email),
      full_name: row.full_name || row.user_email,
      role: row.role || '',
      department: row.department || '',
    }))
    .filter((row) => row.email)
}

export function filterVisibleFolders(folders = [], shares = [], requesterEmail = '', perms = {}) {
  const email = normalizeEmail(requesterEmail)
  const shareFolderIds = new Set(
    shares
      .filter((row) => normalizeEmail(row.shared_with_email) === email)
      .map((row) => row.folder_id)
      .filter(Boolean)
  )
  return folders.filter((folder) => {
    if (folder.scope === 'personal') return normalizeEmail(folder.owner_email) === email
    if (folder.scope === 'template') return perms?.pdf_shared_view === true || perms?.pdf_shared_edit === true || perms?.pdf_shared_admin === true
    if (perms?.pdf_shared_view === true || perms?.pdf_shared_edit === true || perms?.pdf_shared_admin === true) return true
    return shareFolderIds.has(folder.id)
  })
}

export function filterVisibleDocuments(documents = [], shares = [], requesterEmail = '', perms = {}) {
  const email = normalizeEmail(requesterEmail)
  const shareDocIds = new Set(
    shares
      .filter((row) => normalizeEmail(row.shared_with_email) === email)
      .map((row) => row.document_id)
      .filter(Boolean)
  )
  const shareFolderIds = new Set(
    shares
      .filter((row) => normalizeEmail(row.shared_with_email) === email)
      .map((row) => row.folder_id)
      .filter(Boolean)
  )
  return documents.filter((doc) => {
    if (doc.scope === 'personal') return normalizeEmail(doc.owner_email) === email
    if (doc.scope === 'template') return perms?.pdf_shared_view === true || perms?.pdf_shared_edit === true || perms?.pdf_shared_admin === true
    if (perms?.pdf_shared_view === true || perms?.pdf_shared_edit === true || perms?.pdf_shared_admin === true) return true
    return shareDocIds.has(doc.id) || shareFolderIds.has(doc.folder_id)
  })
}

export async function enrichDocumentsWithSignedUrls(env, documents = []) {
  return Promise.all(
    (documents || []).map(async (doc) => ({
      ...doc,
      preview_url: await createSignedObjectUrl(env, doc.latest_path),
      download_url: await createSignedObjectUrl(env, doc.original_path),
    }))
  )
}

export function parsePageRanges(input = '', pageCount = 0) {
  const tokens = String(input || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const ranges = []
  for (const token of tokens) {
    if (token.includes('-')) {
      const [fromRaw, toRaw] = token.split('-')
      const from = Number(fromRaw)
      const to = Number(toRaw)
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > pageCount) {
        throw new Error(`Invalid page range: ${token}`)
      }
      ranges.push({ from, to })
    } else {
      const page = Number(token)
      if (!Number.isInteger(page) || page < 1 || page > pageCount) {
        throw new Error(`Invalid page: ${token}`)
      }
      ranges.push({ from: page, to: page })
    }
  }
  if (!ranges.length) throw new Error('Add at least one page range.')
  return ranges
}

export function parsePageOrder(input = '', pageCount = 0) {
  const order = String(input || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((value) => Number.isInteger(value))
  if (order.length !== pageCount) {
    throw new Error(`Page order must contain ${pageCount} numbers.`)
  }
  const unique = new Set(order)
  if (unique.size !== pageCount || Math.min(...order) !== 1 || Math.max(...order) !== pageCount) {
    throw new Error('Page order must include every page exactly once.')
  }
  return order
}

export async function ensurePdfBytesFromUpload(file) {
  const originalBytes = new Uint8Array(await file.arrayBuffer())
  const mime = String(file.type || '').toLowerCase()
  if (mime === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
    return {
      bytes: originalBytes,
      filename: file.name || 'document.pdf',
    }
  }

  if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg') {
    const pdfDoc = await PDFDocument.create()
    const embedded = mime === 'image/png'
      ? await pdfDoc.embedPng(originalBytes)
      : await pdfDoc.embedJpg(originalBytes)
    const page = pdfDoc.addPage([embedded.width, embedded.height])
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
    const bytes = await pdfDoc.save()
    return {
      bytes,
      filename: String(file.name || 'image').replace(/\.[^.]+$/, '') + '.pdf',
    }
  }

  throw new Error('Unsupported file type. Upload a PDF, PNG, or JPG.')
}

export async function annotatePdfBytes(bytes, annotations = []) {
  const pdfDoc = await PDFDocument.load(bytes)
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  for (const annotation of annotations || []) {
    const pageIndex = Math.max(0, Number(annotation.page || annotation.page_number || 1) - 1)
    const page = pdfDoc.getPage(pageIndex)
    if (!page) continue
    const x = Number(annotation.x || 32)
    const y = Number(annotation.y || 32)
    const width = Number(annotation.width || 160)
    const height = Number(annotation.height || 42)
    const type = String(annotation.type || annotation.annotation_type || 'text')
    const color = rgb(0.1, 0.13, 0.2)
    if (type === 'highlight') {
      page.drawRectangle({
        x,
        y,
        width,
        height,
        color: rgb(1, 0.95, 0.45),
        opacity: 0.5,
      })
      continue
    }
    if (type === 'redaction') {
      page.drawRectangle({
        x,
        y,
        width,
        height,
        color: rgb(0.07, 0.07, 0.07),
        opacity: 1,
      })
      continue
    }
    if (type === 'stamp') {
      page.drawRectangle({
        x,
        y,
        width,
        height,
        color: rgb(0.9, 0.93, 1),
        borderColor: rgb(0.3, 0.44, 0.89),
        borderWidth: 1,
        opacity: 0.9,
      })
    }
    page.drawText(String(annotation.text || annotation.label || '').slice(0, 280), {
      x: x + 8,
      y: y + Math.max(8, height / 2 - 6),
      size: Number(annotation.size || 12),
      font,
      color,
      maxWidth: Math.max(40, width - 16),
    })
  }
  return pdfDoc.save()
}

export async function createDerivedPdfDocument(env, {
  sourceDocument,
  ownerEmail,
  ownerName,
  createdByEmail,
  createdByName,
  title,
  filename,
  bytes,
  tags = [],
  metadata = {},
  status = 'active',
  isFinal = false,
}) {
  const docId = crypto.randomUUID()
  const path = buildPdfStoragePath({
    ownerEmail,
    scope: sourceDocument?.scope || 'personal',
    documentId: docId,
    filename,
    variant: isFinal ? 'final' : 'derived',
  })
  await storageUpload(env, path, bytes, 'application/pdf')
  const payload = createPdfDocumentPayload({
    sourceDocumentId: sourceDocument?.id || null,
    rootDocumentId: sourceDocument?.root_document_id || sourceDocument?.id || null,
    versionNumber: Number(sourceDocument?.version_number || 1) + 1,
    scope: sourceDocument?.scope || 'personal',
    libraryKey: sourceDocument?.library_key || '',
    folderId: sourceDocument?.folder_id || null,
    ownerEmail,
    ownerName,
    createdByEmail,
    createdByName,
    title: title || sourceDocument?.title || filename,
    filename,
    fileSize: bytes.byteLength,
    originalPath: path,
    latestPath: path,
    tags,
    metadata,
    status,
    isTemplate: sourceDocument?.is_template === true,
    isFinal,
  })
  return insertPdfDocument(env, payload)
}
