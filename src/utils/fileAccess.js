import { supabase } from './supabase'
import { logAction } from './audit'

export async function openSecureDocument({
  bucket = 'hr-documents',
  filePath = '',
  fallbackUrl = '',
  userEmail = '',
  userName = '',
  action = 'document_opened',
  entity = 'document',
  entityId = '',
  details = {},
}) {
  let targetUrl = ''

  if (filePath) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 60)
    if (error) throw error
    targetUrl = data?.signedUrl || ''
  }

  if (!targetUrl && fallbackUrl) {
    targetUrl = fallbackUrl
  }

  if (!targetUrl) {
    throw new Error('No secure file link is available for this document.')
  }

  await logAction(userEmail, userName, action, entity, entityId, {
    bucket,
    file_path: filePath || '',
    ...details,
  })

  window.open(targetUrl, '_blank', 'noopener,noreferrer')
}
