/**
 * WorkVault accounts. Entries live on users' phones, so this page only ever
 * shows accounts and usage, with phone numbers masked.
 */
import { useCallback, useEffect, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { Button, Alert, StatusBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ds'
import { callPortalApi } from '../utils/portalApi'

const API = '/api/workvault-admin'

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function WorkVaultAdmin() {
  const { instance, accounts } = useMsal()
  const account = accounts?.[0]
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await callPortalApi(instance, account, API, { action: 'overview' }))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [instance, account])

  useEffect(() => { load() }, [load])

  async function act(action, user) {
    const prompts = {
      suspend: 'Suspend this WorkVault account? They will be signed out and blocked from analysis. Their entries stay on their phone.',
      restore: 'Restore this WorkVault account?',
      delete: 'Delete this WorkVault account permanently? Their entries stay on their phone; the account and usage records are removed.',
    }
    if (!window.confirm(prompts[action])) return
    setBusyId(user.id)
    try {
      await callPortalApi(instance, account, API, { action, userId: user.id })
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId('')
    }
  }

  if (loading) {
    return <div className="spin-wrap" style={{ minHeight: '40vh' }}><div className="spin" /></div>
  }

  const stats = data?.stats
  const users = data?.users || []

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>WorkVault</h1>
        </div>
        <Button variant="secondary" onClick={load}>Refresh</Button>
      </div>

      {error ? <div style={{ marginBottom: 16 }}><Alert variant="warning">{error}</Alert></div> : null}

      <div style={{ marginBottom: 16 }}>
        <Alert variant="info">
          WorkVault entries stay on people’s phones, so this page shows accounts and usage only. Phone numbers are masked.
        </Alert>
      </div>

      {stats ? (
        <p style={{ marginBottom: 16 }}>
          {stats.users} accounts · {stats.activeLast30Days} active in the last 30 days · {stats.analysesLast30Days} analyses in the last 30 days
          {stats.suspended ? ` · ${stats.suspended} suspended` : ''}
        </p>
      ) : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Joined</TableHead>
            <TableHead>Sign-in</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Analyses (30 days / all)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow><TableCell colSpan={7}>No accounts yet.</TableCell></TableRow>
          ) : users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{formatDate(user.createdAt)}</TableCell>
              <TableCell>{user.signInMethod === 'phone' ? `Phone ${user.phone}` : user.signInMethod === 'apple' ? 'Apple' : user.signInMethod}</TableCell>
              <TableCell>{formatDate(user.lastSeenAt)}</TableCell>
              <TableCell>{user.appVersion || '—'}</TableCell>
              <TableCell>{user.analyses30d} / {user.analysesTotal}</TableCell>
              <TableCell>
                <StatusBadge variant={user.status === 'suspended' ? 'warning' : 'active'}>
                  {user.status === 'suspended' ? 'Suspended' : 'Active'}
                </StatusBadge>
              </TableCell>
              <TableCell>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {user.status === 'suspended'
                    ? <Button variant="secondary" disabled={busyId === user.id} onClick={() => act('restore', user)}>Restore</Button>
                    : <Button variant="secondary" disabled={busyId === user.id} onClick={() => act('suspend', user)}>Suspend</Button>}
                  <Button variant="ghost" disabled={busyId === user.id} onClick={() => act('delete', user)}>Delete</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
