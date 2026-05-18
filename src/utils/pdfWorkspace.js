function buildHeaders(user) {
  return {
    'x-staff-email': String(user?.email || '').trim().toLowerCase(),
    'x-staff-name': String(user?.name || '').trim(),
  }
}

async function parseJson(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || 'PDF Workspace request failed.')
  }
  return payload
}

function buildQuery(params = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    query.set(key, String(value))
  })
  return query.toString()
}

export async function fetchPdfWorkspaceLibrary(user, params = {}) {
  const query = buildQuery(params)
  const response = await fetch(`/api/pdf-workspace/library${query ? `?${query}` : ''}`, {
    headers: {
      ...buildHeaders(user),
    },
  })
  return parseJson(response)
}

export async function uploadPdfWorkspaceFiles(user, payload = {}) {
  const formData = new FormData()
  for (const file of payload.files || []) formData.append('files', file)
  if (payload.scope) formData.append('scope', payload.scope)
  if (payload.folder_id) formData.append('folder_id', payload.folder_id)
  if (payload.library_key) formData.append('library_key', payload.library_key)
  if (payload.tags) formData.append('tags', payload.tags)
  if (payload.title) formData.append('title', payload.title)
  const response = await fetch('/api/pdf-workspace/upload', {
    method: 'POST',
    headers: buildHeaders(user),
    body: formData,
  })
  return parseJson(response)
}

async function postJson(user, path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      ...buildHeaders(user),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  })
  return parseJson(response)
}

export const createPdfWorkspaceFolder = (user, body) => postJson(user, '/api/pdf-workspace/folder', body)
export const mergePdfWorkspaceDocuments = (user, body) => postJson(user, '/api/pdf-workspace/merge', body)
export const splitPdfWorkspaceDocument = (user, body) => postJson(user, '/api/pdf-workspace/split', body)
export const reorderPdfWorkspaceDocument = (user, body) => postJson(user, '/api/pdf-workspace/reorder', body)
export const compressPdfWorkspaceDocument = (user, body) => postJson(user, '/api/pdf-workspace/compress', body)
export const redactPdfWorkspaceDocument = (user, body) => postJson(user, '/api/pdf-workspace/redact-export', body)
export const annotatePdfWorkspaceDocument = (user, body) => postJson(user, '/api/pdf-workspace/annotate', body)
export const sharePdfWorkspaceDocument = (user, body) => postJson(user, '/api/pdf-workspace/share', body)
export const movePdfWorkspaceDocument = (user, body) => postJson(user, '/api/pdf-workspace/move', body)
