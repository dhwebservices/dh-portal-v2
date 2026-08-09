import { StatusBadge } from './ds'
import { getRecruitingStatusLabel, getRecruitingStatusTone } from '../utils/recruiting'

const TONE_TO_VARIANT = { green: 'active', amber: 'warning', red: 'error', blue: 'info', grey: 'info' }

export default function RecruitingStatusBadge({ status }) {
  return <StatusBadge variant={TONE_TO_VARIANT[getRecruitingStatusTone(status)] || 'info'}>{getRecruitingStatusLabel(status)}</StatusBadge>
}
