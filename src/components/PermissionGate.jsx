import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase'

export default function PermissionGate({ pageKey, children }) {
  const { accounts } = useMsal()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState(null)

  useEffect(() => {
    const check = async () => {
      if (!user?.email) return

      // Admins always have full access
      if (user.roles?.includes('Administrator')) { setAllowed(true); return }

      try {
        const { data: allPerms } = await supabase
          .from('user_permissions')
          .select('user_email, permissions, onboarding')

        const myRow = (allPerms || []).find(
          r => r.user_email?.toLowerCase() === user.email?.toLowerCase()
        )

        // Block all access if in onboarding mode
        if (myRow?.onboarding === true) {
          setAllowed(false)
          return
        }

        const perms = myRow?.permissions
        if (perms && Object.keys(perms).length > 0) {
          const hasAccess = perms[pageKey] === true
          setAllowed(hasAccess)
          if (!hasAccess) navigate('/dashboard', { replace: true })
        } else {
          setAllowed(true)
        }
      } catch {
        setAllowed(true)
      }
    }
    check()
  }, [user, pageKey])

  if (allowed === null) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--sub)', fontSize: '13px' }}>
      Checking access…
    </div>
  )

  if (!allowed) return null

  return children
}
