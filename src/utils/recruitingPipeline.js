import { RECRUITING_STATUSES } from './recruiting'

export function buildRecruitingBoard(applications = []) {
  return RECRUITING_STATUSES.map(([status, label]) => ({
    status,
    label,
    items: applications.filter((item) => item.status === status),
  }))
}
