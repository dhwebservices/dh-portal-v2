export function buildComplianceRuleKey(id = '') {
  return `compliance_rule:${String(id || '').trim()}`
}

function fallbackId() {
  return `rule-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean)
}

export function createComplianceRule(record = {}) {
  return {
    id: String(record.id || fallbackId()).trim(),
    title: String(record.title || '').trim(),
    description: String(record.description || '').trim(),
    role: String(record.role || '').trim(),
    department: String(record.department || '').trim(),
    lifecycle: String(record.lifecycle || '').trim(),
    required_documents: normalizeList(record.required_documents),
    required_training_titles: normalizeList(record.required_training_titles),
    required_training_categories: normalizeList(record.required_training_categories),
    active: record.active !== false,
    created_at: String(record.created_at || new Date().toISOString()),
    updated_at: String(record.updated_at || new Date().toISOString()),
  }
}

export function normalizeComplianceRule(record = {}) {
  return createComplianceRule(record)
}

function includesLoose(haystack = '', needle = '') {
  return String(haystack || '').toLowerCase().includes(String(needle || '').toLowerCase())
}

function hasMatchingDocument(documents = [], keyword = '') {
  return documents.some((doc) => {
    const type = String(doc?.type || '')
    const name = String(doc?.name || '')
    const path = String(doc?.file_path || '')
    return includesLoose(type, keyword) || includesLoose(name, keyword) || includesLoose(path, keyword)
  })
}

function hasMatchingTraining(trainingRecords = [], title = '') {
  return trainingRecords.some((record) => {
    const status = String(record?.status || '').toLowerCase()
    if (!['completed', 'in_progress', 'assigned'].includes(status)) return false
    return includesLoose(record?.title, title)
  })
}

function hasMatchingTrainingCategory(trainingRecords = [], category = '') {
  return trainingRecords.some((record) => {
    const status = String(record?.status || '').toLowerCase()
    if (!['completed', 'in_progress', 'assigned'].includes(status)) return false
    return String(record?.category || '').trim() === String(category || '').trim()
  })
}

export function doesStaffMatchComplianceRule(rule = {}, profile = {}, lifecycleState = '') {
  if (rule.active === false) return false
  if (rule.role && String(profile?.role || '').trim() !== rule.role) return false
  if (rule.department && String(profile?.department || '').trim() !== rule.department) return false
  if (rule.lifecycle && String(lifecycleState || '').trim() !== rule.lifecycle) return false
  return true
}

export function evaluateComplianceRule(rule = {}, profile = {}, lifecycleState = '', documents = [], trainingRecords = []) {
  if (!doesStaffMatchComplianceRule(rule, profile, lifecycleState)) {
    return { applies: false, missing_documents: [], missing_training_titles: [], missing_training_categories: [], missing_count: 0 }
  }

  const missingDocuments = (rule.required_documents || []).filter((keyword) => !hasMatchingDocument(documents, keyword))
  const missingTrainingTitles = (rule.required_training_titles || []).filter((title) => !hasMatchingTraining(trainingRecords, title))
  const missingTrainingCategories = (rule.required_training_categories || []).filter((category) => !hasMatchingTrainingCategory(trainingRecords, category))

  return {
    applies: true,
    missing_documents: missingDocuments,
    missing_training_titles: missingTrainingTitles,
    missing_training_categories: missingTrainingCategories,
    missing_count: missingDocuments.length + missingTrainingTitles.length + missingTrainingCategories.length,
  }
}

export function evaluateComplianceRulesForStaff(staff = [], rules = [], options = {}) {
  const docsByEmail = options.docsByEmail || {}
  const trainingByEmail = options.trainingByEmail || {}
  const lifecycleByEmail = options.lifecycleByEmail || {}

  return staff.map((profile) => {
    const email = String(profile?.user_email || '').toLowerCase()
    const lifecycleState = String(lifecycleByEmail[email] || '').trim()
    const documents = docsByEmail[email] || []
    const trainingRecords = trainingByEmail[email] || []

    const evaluations = rules
      .map((rule) => ({ rule, result: evaluateComplianceRule(rule, profile, lifecycleState, documents, trainingRecords) }))
      .filter((item) => item.result.applies)

    const missing = evaluations.filter((item) => item.result.missing_count > 0)

    return {
      profile,
      lifecycleState,
      evaluations,
      missing,
      missingCount: missing.reduce((sum, item) => sum + item.result.missing_count, 0),
    }
  })
}
