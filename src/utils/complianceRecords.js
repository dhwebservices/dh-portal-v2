import { normalizeEmail } from './hrProfileSync'

export function buildComplianceSettingKey(email = '') {
  return `staff_compliance:${normalizeEmail(email)}`
}

export function mergeComplianceRecord(record = {}) {
  return {
    rtw_override: record?.rtw_override === true,
    rtw_document_url: typeof record?.rtw_document_url === 'string' ? record.rtw_document_url : '',
    rtw_expiry: record?.rtw_expiry || '',
    rtw_verified_at: record?.rtw_verified_at || '',
    rtw_verified_by: typeof record?.rtw_verified_by === 'string' ? record.rtw_verified_by : '',
    rtw_status_note: typeof record?.rtw_status_note === 'string' ? record.rtw_status_note : '',
  }
}

export function getRightToWorkDocument(docs = []) {
  return docs.find((doc) => {
    const type = String(doc?.type || '').toLowerCase()
    const name = String(doc?.name || '').toLowerCase()
    const path = String(doc?.file_path || '').toLowerCase()
    return type.includes('right to work') || name.includes('right to work') || path.includes('/rtw/')
  }) || null
}

export function resolveRightToWorkRecord(profile = {}, docs = [], complianceRecord = {}) {
  const merged = mergeComplianceRecord(complianceRecord)
  const doc = getRightToWorkDocument(docs)
  const documentUrl = merged.rtw_document_url || doc?.file_url || profile?.rtw_document_url || ''
  const expiry = merged.rtw_expiry || profile?.rtw_expiry || ''
  return {
    ...merged,
    document: doc,
    documentUrl,
    expiry,
    hasDocument: !!documentUrl,
  }
}
