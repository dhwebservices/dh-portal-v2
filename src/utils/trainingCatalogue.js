import { TRAINING_CATEGORY_OPTIONS } from './peopleOps'

export function buildTrainingTemplateKey(id = '') {
  return `training_template:${String(id || '').trim()}`
}

function fallbackId() {
  return `training-template-${Math.random().toString(36).slice(2, 10)}`
}

export function createTrainingTemplate(record = {}) {
  return {
    id: String(record.id || fallbackId()).trim(),
    title: String(record.title || '').trim(),
    summary: String(record.summary || '').trim(),
    category: TRAINING_CATEGORY_OPTIONS.some(([key]) => key === record.category) ? record.category : 'induction',
    mandatory: record.mandatory === true,
    default_due_days: Number.isFinite(Number(record.default_due_days)) ? Math.max(0, Number(record.default_due_days)) : 7,
    default_expiry_days: Number.isFinite(Number(record.default_expiry_days)) ? Math.max(0, Number(record.default_expiry_days)) : 0,
    certificate_name: String(record.certificate_name || '').trim(),
    notes: String(record.notes || '').trim(),
    active: record.active !== false,
    created_at: String(record.created_at || new Date().toISOString()),
    updated_at: String(record.updated_at || new Date().toISOString()),
  }
}
