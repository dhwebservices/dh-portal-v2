import { useLocation } from 'react-router-dom'
import RecruitmentCandidateWorkspace from '../components/RecruitmentCandidateWorkspace'

export default function RecruitingApplications() {
  const location = useLocation()
  const initialJob = new URLSearchParams(location.search).get('job') || 'all'

  return (
    <div className="fade-in">
      <RecruitmentCandidateWorkspace initialJobId={initialJob} showHeader />
    </div>
  )
}
