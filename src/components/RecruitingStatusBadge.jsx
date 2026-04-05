import { getRecruitingStatusLabel, getRecruitingStatusTone } from '../utils/recruiting'

export default function RecruitingStatusBadge({ status }) {
  return <span className={`badge badge-${getRecruitingStatusTone(status)}`}>{getRecruitingStatusLabel(status)}</span>
}
