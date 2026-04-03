import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { createStaffContract, getContractStatusLabel } from '../utils/contracts'
import { normalizeEmail } from '../utils/hrProfileSync'

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

  useEffect(() => {
    load()
  }, [user?.email, isDirector, managedDepartments.join('|')])

  const load = async () => {
    setLoading(true)
    setError('')
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

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Contract Queue</h1>
          <p className="page-sub">Track issued contracts, staff signatures, and final signed PDFs.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-outline" onClick={() => navigate('/contract-templates')}>Manage templates</button>
          <button className="btn btn-outline" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:16, marginBottom:20 }}>
        <div className="stat-card">
          <div className="stat-val">{contracts.length}</div>
          <div className="stat-lbl">Visible contracts</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{ color:'var(--amber)' }}>{awaitingCount}</div>
          <div className="stat-lbl">Awaiting staff signature</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{ color:'var(--green)' }}>{completedCount}</div>
          <div className="stat-lbl">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{ color:'var(--red)' }}>{voidedCount}</div>
          <div className="stat-lbl">Voided</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom:18, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
        <div>
          <label className="lbl">Status</label>
          <select className="inp" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {STATUS_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Department</label>
          <select className="inp" value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
            <option value="all">All visible departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </div>
      </div>

      {error ? (
        <div className="card card-pad" style={{ color:'var(--red)' }}>{error}</div>
      ) : null}

      {loading ? (
        <div className="card card-pad">Loading contract queue...</div>
      ) : filteredContracts.length ? (
        <div className="card" style={{ overflow:'hidden' }}>
          <table className="tbl">
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
                return (
                  <tr key={contract.id}>
                    <td>
                      <div className="t-main">{contract.staff_name || contract.staff_email || 'Unknown staff'}</div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--faint)', marginTop:4 }}>{contract.staff_email || 'No email recorded'}</div>
                    </td>
                    <td>{contract.staff_department || 'Unassigned'}</td>
                    <td>
                      <div style={{ fontWeight:500, color:'var(--text)' }}>{contract.template_name || contract.contract_type || 'Contract'}</div>
                      <div style={{ fontSize:12, color:'var(--sub)', marginTop:4 }}>Manager: {contract.manager_signature?.name || contract.manager_name || 'Pending'}</div>
                    </td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{formatStamp(contract.issued_at || contract.created_at)}</td>
                    <td><span className={`badge badge-${statusTone}`}>{statusLabel}</span></td>
                    <td>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
                        {contract.final_document_url ? (
                          <a className="btn btn-outline btn-sm" href={contract.final_document_url} target="_blank" rel="noreferrer">Open PDF</a>
                        ) : null}
                        <button className="btn btn-outline btn-sm" onClick={() => navigate(`/my-staff/${encodeURIComponent(contract.staff_email)}?tab=contracts`)}>
                          Open staff contract
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card card-pad" style={{ maxWidth:620 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:24, color:'var(--text)' }}>No contracts in this view</div>
          <div style={{ marginTop:8, fontSize:14, color:'var(--sub)', lineHeight:1.7 }}>
            Issued staff contracts will appear here once they have been sent from a staff profile. Use the contract queue to monitor which contracts still need a staff signature.
          </div>
        </div>
      )}
    </div>
  )
}
