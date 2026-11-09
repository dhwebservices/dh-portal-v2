import { useAuth } from '../contexts/AuthContext'
import { staff } from './exampleData'

// The signed-in person as one of the example staff (matched by name), or null.
export default function useMe() {
  const { user } = useAuth()
  const name = String(user?.name || '').trim().toLowerCase()
  return staff.find((s) => s.name.toLowerCase() === name) || null
}
