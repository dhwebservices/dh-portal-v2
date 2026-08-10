import { useNavigate, useLocation } from 'react-router-dom'

const WORKSPACES = [
  { id: 'people', label: 'People', path: '/people' },
  { id: 'recruiting', label: 'Recruiting', path: '/recruiting' },
  { id: 'websites', label: 'Websites', path: '/clients' },
  { id: 'support', label: 'Support', path: '/support' },
  { id: 'reports', label: 'Reports', path: '/reports' },
  { id: 'admin', label: 'Admin', path: '/settings' },
]

export default function WorkspaceNav() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => {
    return location.pathname.startsWith(path)
  }

  return (
    <div className="ds-workspace-nav">
      {WORKSPACES.map((workspace) => (
        <div
          key={workspace.id}
          className={`ds-workspace-tab ${isActive(workspace.path) ? 'active' : ''}`}
          onClick={() => navigate(workspace.path)}
          style={{ cursor: 'pointer' }}
        >
          {workspace.label}
        </div>
      ))}
    </div>
  )
}
