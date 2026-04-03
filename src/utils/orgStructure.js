import { DIRECTOR_EMAILS } from './staffLifecycle'

export const ORG_ROLE_SCOPES = [
  ['director', 'Director'],
  ['department_manager', 'Department Manager'],
  ['staff', 'Staff'],
  ['read_only', 'Read Only'],
]

export const DEPARTMENT_REQUEST_TYPES = [
  ['assign_staff', 'Assign to department'],
  ['move_staff', 'Move department'],
  ['remove_staff', 'Remove from department'],
  ['manager_change', 'Change department manager'],
]

export const DEPARTMENT_REQUEST_STATUSES = [
  ['pending', 'Pending approval'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['cancelled', 'Cancelled'],
]

export function normalizeRoleScope(value = '') {
  const safe = String(value || '').toLowerCase().replace(/\s+/g, '_')
  return ORG_ROLE_SCOPES.some(([key]) => key === safe) ? safe : 'staff'
}

export function normalizeDepartmentName(value = '') {
  return String(value || '').trim()
}

export function buildStaffOrgKey(email = '') {
  return `staff_org:${String(email || '').toLowerCase().trim()}`
}

export function buildDepartmentCatalogKey() {
  return 'department_catalog'
}

export function buildDepartmentRequestKey(id = '') {
  return `department_request:${id || crypto.randomUUID()}`
}

export function createDefaultOrgRecord({ email = '', department = '', isDirector = false } = {}) {
  const safeDepartment = normalizeDepartmentName(department)
  const roleScope = isDirector ? 'director' : 'staff'

  return {
    email: String(email || '').toLowerCase().trim(),
    role_scope: roleScope,
    department: safeDepartment,
    managed_departments: roleScope === 'director' ? [] : [],
    reports_to_email: '',
    reports_to_name: '',
    notes: '',
  }
}

export function mergeOrgRecord(raw = {}, defaults = {}) {
  const base = createDefaultOrgRecord(defaults)
  const managedDepartments = Array.isArray(raw?.managed_departments)
    ? raw.managed_departments.map(normalizeDepartmentName).filter(Boolean)
    : base.managed_departments

  return {
    ...base,
    ...raw,
    email: String(raw?.email || base.email || '').toLowerCase().trim(),
    role_scope: normalizeRoleScope(raw?.role_scope || base.role_scope),
    department: normalizeDepartmentName(raw?.department || base.department),
    reports_to_email: String(raw?.reports_to_email || base.reports_to_email || '').toLowerCase().trim(),
    reports_to_name: String(raw?.reports_to_name || base.reports_to_name || '').trim(),
    managed_departments: managedDepartments,
    notes: String(raw?.notes || base.notes || '').trim(),
  }
}

export function getManagedDepartments(orgRecord = {}) {
  const merged = mergeOrgRecord(orgRecord)
  if (merged.role_scope === 'director') return ['*']
  const departments = new Set(merged.managed_departments || [])
  if (merged.role_scope === 'department_manager' && merged.department) {
    departments.add(merged.department)
  }
  return [...departments].filter(Boolean)
}

export function hydrateManagedDepartments(orgRecord = {}, departmentCatalog = [], email = '') {
  const safeEmail = String(email || orgRecord?.email || '').toLowerCase().trim()
  const merged = mergeOrgRecord(orgRecord, { email: safeEmail })
  const departments = new Set(Array.isArray(merged.managed_departments) ? merged.managed_departments : [])

  ;(Array.isArray(departmentCatalog) ? departmentCatalog : []).forEach((department) => {
    if (!department?.name) return
    if (String(department.manager_email || '').toLowerCase().trim() === safeEmail) {
      departments.add(normalizeDepartmentName(department.name))
    }
  })

  if (merged.role_scope === 'department_manager' && merged.department) {
    departments.add(merged.department)
  }

  return mergeOrgRecord({
    ...merged,
    managed_departments: [...departments].filter(Boolean),
  }, { email: safeEmail, department: merged.department })
}

export function isDirectorEmail(email = '') {
  return DIRECTOR_EMAILS.has(String(email || '').toLowerCase().trim())
}

export function canManageDepartment(orgRecord = {}, department = '', userEmail = '') {
  const safeDepartment = normalizeDepartmentName(department)
  if (!safeDepartment) return false
  if (isDirectorEmail(userEmail) || normalizeRoleScope(orgRecord?.role_scope) === 'director') return true
  return getManagedDepartments(orgRecord).includes(safeDepartment)
}

export function canViewDepartment(orgRecord = {}, department = '', userEmail = '') {
  if (isDirectorEmail(userEmail) || normalizeRoleScope(orgRecord?.role_scope) === 'director') return true
  return canManageDepartment(orgRecord, department, userEmail)
}

export function canViewStaffMember({ viewerEmail = '', viewerOrg = {}, targetProfile = {}, targetOrg = {} } = {}) {
  if (isDirectorEmail(viewerEmail) || normalizeRoleScope(viewerOrg?.role_scope) === 'director') return true

  const targetDepartment = normalizeDepartmentName(targetOrg?.department || targetProfile?.department)
  if (!targetDepartment) return false
  return canViewDepartment(viewerOrg, targetDepartment, viewerEmail)
}

export function createDepartmentSkeleton(name = '') {
  const label = normalizeDepartmentName(name)
  return {
    id: crypto.randomUUID(),
    name: label,
    active: true,
    manager_email: '',
    manager_name: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function mergeDepartmentCatalog(raw = []) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ({
      id: item?.id || crypto.randomUUID(),
      name: normalizeDepartmentName(item?.name),
      active: item?.active !== false,
      manager_email: String(item?.manager_email || '').toLowerCase().trim(),
      manager_name: String(item?.manager_name || '').trim(),
      created_at: item?.created_at || new Date().toISOString(),
      updated_at: item?.updated_at || item?.created_at || new Date().toISOString(),
    }))
    .filter((item) => item.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function createDepartmentRequest(raw = {}) {
  const type = DEPARTMENT_REQUEST_TYPES.some(([key]) => key === raw?.type) ? raw.type : 'assign_staff'
  const status = DEPARTMENT_REQUEST_STATUSES.some(([key]) => key === raw?.status) ? raw.status : 'pending'
  return {
    id: raw?.id || crypto.randomUUID(),
    type,
    status,
    target_email: String(raw?.target_email || '').toLowerCase().trim(),
    target_name: String(raw?.target_name || '').trim(),
    current_department: normalizeDepartmentName(raw?.current_department),
    requested_department: normalizeDepartmentName(raw?.requested_department),
    requested_role_scope: normalizeRoleScope(raw?.requested_role_scope || 'staff'),
    requested_manager_email: String(raw?.requested_manager_email || '').toLowerCase().trim(),
    requested_manager_name: String(raw?.requested_manager_name || '').trim(),
    requested_by_email: String(raw?.requested_by_email || '').toLowerCase().trim(),
    requested_by_name: String(raw?.requested_by_name || '').trim(),
    notes: String(raw?.notes || '').trim(),
    director_notes: String(raw?.director_notes || '').trim(),
    approved_by_email: String(raw?.approved_by_email || '').toLowerCase().trim(),
    approved_by_name: String(raw?.approved_by_name || '').trim(),
    decided_at: raw?.decided_at || '',
    created_at: raw?.created_at || new Date().toISOString(),
    updated_at: raw?.updated_at || raw?.created_at || new Date().toISOString(),
  }
}

export function getRoleScopeLabel(value = '') {
  return ORG_ROLE_SCOPES.find(([key]) => key === normalizeRoleScope(value))?.[1] || 'Staff'
}
