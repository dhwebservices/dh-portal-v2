import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { createStaffContract, getContractStatusLabel } from '../utils/contracts'
import { normalizeEmail } from '../utils/hrProfileSync'
import { sendManagedNotification } from '../utils/notificationPreferences'
import { Button, FormField, FormLabel, FormSelect, StatusBadge } from '../components/ds'

const DS_CARD = { background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)' }

const TONE_TO_VARIANT = { green:'active', amber:'warning', red:'error', blue:'info', grey:'info' }

const STATUS_FILTERS = [
  ['all', 'All contracts'],
  ['awaiting_staff_signature', 'Awaiting signature'],
  ['completed', 'Completed'],
  ['voided', 'Voided'],
  ['draft', 'Draft'],
]

function formatStamp(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ContractQueue() {
  const navigate = useNavigate()
  const { user, isDirector, managedDepartments } = useAuth()
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [error, setError] = useState('')
  const [busyContractId, setBusyContractId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    load()
  }, [user?.email, isDirector, managedDepartments.join('|')])

  const load = async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const currentEmail = normalizeEmail(user?.email || '')
      const { data, error: fetchError } = await supabase
        .from('portal_settings')
        .select('key,value')
        .like('key', 'staff_contract:%')

      if (fetchError) throw fetchError

      const scopedContracts = (data || [])
        .map((row) => createStaffContract({
          id: String(row.key || '').replace('staff_contract:', ''),
          ...(row.value?.value ?? row.value ?? {}),
        }))
        .filter((contract) => {
          if (isDirector) return true
          if (!managedDepartments.length) return false
          const belongsToDepartment = !!contract.staff_department && managedDepartments.includes(contract.staff_department)
          const issuedByManager = normalizeEmail(contract.manager_signature?.email || contract.manager_email || '') === currentEmail
          return belongsToDepartment || issuedByManager
        })
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())

      setContracts(scopedContracts)
    } catch (err) {
      console.error('Contract queue load failed:', err)
      setError(err.message || 'Could not load the contract queue.')
    } finally {
      setLoading(false)
    }
  }

  const departments = useMemo(() => {
    return [...new Set(contracts.map((contract) => contract.staff_department).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  }, [contracts])

  const filteredContracts = useMemo(() => {
    return contracts.filter((contract) => {
      if (filter !== 'all' && contract.status !== filter) return false
      if (departmentFilter !== 'all' && contract.staff_department !== departmentFilter) return false
      return true
    })
  }, [contracts, departmentFilter, filter])

  const awaitingCount = contracts.filter((contract) => contract.status === 'awaiting_staff_signature').length
  const completedCount = contracts.filter((contract) => contract.status === 'completed').length
  const voidedCount = contracts.filter((contract) => contract.status === 'voided').length
  const overdueCount = contracts.filter((contract) => {
    if (contract.status !== 'awaiting_staff_signature' || !contract.issued_at) return false
    return (Date.now() - new Date(contract.issued_at).getTime()) / 86400000 >= 3
  }).length

  const resendReminder = async (contract) => {
    setBusyContractId(contract.id)
    setError('')
    setMessage('')
    try {
      await sendManagedNotification({
        userEmail: contract.staff_email,
        userName: contract.staff_name || contract.staff_email,
        category: 'hr',
        type: 'warning',
        title: 'Contract signature reminder',
        message: `${contract.template_name || 'Your contract'} is still waiting for your digital signature in onboarding.`,
        link: '/hr/onboarding',
        emailSubject: `${contract.subject || contract.template_name || 'DH Portal contract'} — signature reminder`,
        emailHtml: `
          <p>Hi ${(contract.staff_name || contract.staff_email || 'there').split(' ')[0] || 'there'},</p>
          <p>This is a reminder that your ${contract.template_name || contract.contract_type || 'contract'} is still waiting for your digital signature in DH Portal.</p>
          <p><a href="https://staff.dhwebsiteservices.co.uk/hr/onboarding" style="display:inline-block;background:#1d1d1f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;">Open onboarding</a></p>
        `,
        sentBy: user?.name || user?.email || 'Department manager',
        fromEmail: 'DH Website Services <noreply@dhwebsiteservices.co.uk>',
        forceImportant: true,
      })
      setMessage(`Reminder sent to ${contract.staff_name || contract.staff_email}.`)
    } catch (err) {
      console.error('Contract queue reminder failed:', err)
      setError(err.message || 'Could not resend the contract reminder.')
    } finally {
      setBusyContractId('')
    }
  }

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div>
          <h1>Contract Queue</h1>
          <p style={{ fontSize:'14px', color:'var(--color-text-secondary)', marginTop:'4px' }}>Track issued contracts, staff signatures, and final signed PDFs.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <Button variant="secondary" onClick={() => navigate('/contract-templates')}>Manage templates</Button>
          <Button variant="secondary" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        <div style={{ ...DS_CARD, padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-text-primary)' }}>{contracts.length}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Visible contracts</div>
        </div>
        <div style={{ ...DS_CARD, padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-amber-500)' }}>{awaitingCount}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Awaiting staff signature</div>
        </div>
        <div style={{ ...DS_CARD, padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-green-500)' }}>{completedCount}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Completed</div>
        </div>
        <div style={{ ...DS_CARD, padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-red-500)' }}>{voidedCount}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Voided</div>
        </div>
        <div style={{ ...DS_CARD, padding:20 }}>
          <div style={{ fontSize:24, fontWeight:600, color:'var(--color-amber-500)' }}>{overdueCount}</div>
          <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Overdue 3+ days</div>
        </div>
      </div>

      <div style={{ ...DS_CARD, padding:20, marginBottom:18, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
        <FormField>
          <FormLabel>Status</FormLabel>
          <FormSelect value={filter} onChange={(e) => setFilter(e.target.value)}>
            {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </FormSelect>
        </FormField>
        <FormField>
          <FormLabel>Department</FormLabel>
          <FormSelect value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
            <option value="all">All visible departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </FormSelect>
        </FormField>
      </div>

      {error ? (
        <div style={{ ...DS_CARD, padding:20, color:'var(--color-red-500)' }}>{error}</div>
      ) : null}
      {message ? (
        <div style={{ ...DS_CARD, padding:20, color:'var(--color-green-500)', marginBottom:18 }}>{message}</div>
      ) : null}

      {loading ? (
        <div style={{ ...DS_CARD, padding:20 }}>Loading contract queue...</div>
      ) : filteredContracts.length ? (
        <div style={{ ...DS_CARD, overflow:'hidden' }}>
          <table className="ds-table">
            <thead>
              <tr>
                <th>Staff member</th>
                <th>Department</th>
                <th>Template</th>
                <th>Issued</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredContracts.map((contract) => {
                const [statusLabel, statusTone] = getContractStatusLabel(contract.status)
                const waitingDays = contract.issued_at ? Math.floor((Date.now() - new Date(contract.issued_at).getTime()) / 86400000) : null
                const overdue = contract.status === 'awaiting_staff_signature' && waitingDays !== null && waitingDays >= 3
                return (
                  <tr key={contract.id}>
                    <td>
                      <div>{contract.staff_name || contract.staff_email || 'Unknown staff'}</div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--color-text-tertiary)', marginTop:4 }}>{contract.staff_email || 'No email recorded'}</div>
                    </td>
                    <td>{contract.staff_department || 'Unassigned'}</td>
                    <td>
                      <div style={{ fontWeight:500, color:'var(--color-text-primary)' }}>{contract.template_name || contract.contract_type || 'Contract'}</div>
                      <div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Manager: {contract.manager_signature?.name || contract.manager_name || 'Pending'}</div>
                      {overdue ? <div style={{ fontSize:11.5, color:'var(--color-amber-500)', marginTop:6 }}>Overdue by {waitingDays} day{waitingDays === 1 ? '' : 's'}</div> : null}
                    </td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{formatStamp(contract.issued_at || contract.created_at)}</td>
                    <td><StatusBadge variant={TONE_TO_VARIANT[statusTone] || 'info'}>{statusLabel}</StatusBadge></td>
                    <td>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
                        {contract.final_document_url ? (
                          <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => window.open(contract.final_document_url, '_blank', 'noreferrer')}>Open PDF</Button>
                        ) : null}
                        {contract.status === 'awaiting_staff_signature' ? (
                          <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => resendReminder(contract)} disabled={busyContractId === contract.id}>
                            {busyContractId === contract.id ? 'Sending...' : 'Resend reminder'}
                          </Button>
                        ) : null}
                        <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => navigate(`/my-staff/${encodeURIComponent(contract.staff_email)}?tab=contracts`)}>
                          Open staff contract
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ ...DS_CARD, padding:20, maxWidth:620 }}>
          <div style={{ fontSize:24, color:'var(--color-text-primary)' }}>No contracts in this view</div>
          <div style={{ marginTop:8, fontSize:14, color:'var(--color-text-secondary)', lineHeight:1.7 }}>
            Issued staff contracts will appear here once they have been sent from a staff profile. Use the contract queue to monitor which contracts still need a staff signature.
          </div>
        </div>
      )}
    </div>
  )
}
