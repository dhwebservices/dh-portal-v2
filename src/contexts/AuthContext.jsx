import { createContext, useContext, useState, useEffect } from 'react'
import { useMsal, useIsAuthenticated } from '@azure/msal-react'
import { loginRequest } from '../authConfig'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const { instance, accounts } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [wrongRole, setWrongRole] = useState(false)

  useEffect(() => {
    if (isAuthenticated && accounts.length > 0) {
      const account = accounts[0]
      const roles = account.idTokenClaims?.roles || []

      // If user has Client role but is on the staff portal — block them
      if (roles.includes('Client') && !roles.includes('Staff') && !roles.includes('Administrator')) {
        setWrongRole(true)
        setLoading(false)
        return
      }

      setUser({
        name: account.name || account.username,
        email: account.username,
        roles,
      })
      setWrongRole(false)
    } else {
      setUser(null)
    }
    setLoading(false)
  }, [isAuthenticated, accounts])

  const login  = () => instance.loginRedirect(loginRequest).catch(console.error)
  const logout = () => instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin })

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout, wrongRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
