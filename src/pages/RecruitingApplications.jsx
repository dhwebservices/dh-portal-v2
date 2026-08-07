import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import SubNav from '../components/SubNav'
import RecruitmentCandidateWorkspace from '../components/RecruitmentCandidateWorkspace'

export default function RecruitingApplications() {
  const location = useLocation()
  const navigate = useNavigate()
  const { can } = useAuth()
  const initialJob = new URLSearchParams(location.search).get('job') || 'all'

  return (
    <div className="fade-in">
      <SubNav items={[
        can('recruiting_jobs') && { label: 'Jobs', onClick: () => navigate('/recruiting') },
        { label: 'Applications', active: true, onClick: () => {} },
        can('recruiting_board') && { label: 'Board', onClick: () => navigate('/recruiting/board') },
        can('recruiting_settings') && { label: 'Settings', onClick: () => navigate('/recruiting/settings') },
      ]} />
      <RecruitmentCandidateWorkspace initialJobId={initialJob} showHeader />
    </div>
  )
}
