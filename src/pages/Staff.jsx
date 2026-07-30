import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CreditCard, Plus, Settings, XCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import {
  createManualCommission,
  decideCommissionPayoutRequest,
  formatCommissionCurrency,
  getCommissionStatusLabel,
  legacyClientName,
  loadCommissionAdminData,
  upsertCommissionSetting,
} from '../utils/commissions'

const EMPTY_SETTING = {
  staff_email: '',
  staff_name: '',
  commission_rate: 10,
  enabled: true,
  manager_email: '',
  manager_name: '',
  notes: '',
}

const EMPTY_MANUAL = {
  staff_email: '',
  client_name: '',
  sale_amount: '',
  commission_rate: '',
  description: '',
}

function sumByStatus(rows, statuses) {
  const allowed = new Set(statuses)
  return rows
    .filter((row) => allowed.has(String(row.status || 'available')))
    .reduce((total, row) => total + Number(row.commission_amount || 0), 0)
}

export default function Staff() {
  const { user } = useAuth()
  const [tab, setTab] = useState('requests')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [staff, setStaff] = useState([])
  const [profiles, setProfiles] = useState([])
  const [settings, setSettings] = useState([])
  const [commissions, setCommissions] = useState([])
  const [requests, setRequests] = useState([])
  const [settingModal, setSettingModal] = useState(false)
  const [manualModal, setManualModal] = useState(false)
  const [activeRequest, setActiveRequest] = useState(null)
  const [managerNotes, setManagerNotes] = useState('')
  const [settingForm, setSettingForm] = useState(EMPTY_SETTING)
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await loadCommissionAdminData()
      setStaff(data.staff)
      setProfiles(data.profiles)
      setSettings(data.settings)
      setCommissions(data.commissions)
      setRequests(data.requests)
      if (data.errors.length) setError(data.errors[0].message || 'Some commission data could not be loaded.')
    } catch (err) {
      setError(err.message || 'Commission data could not be loaded. Check the commission SQL migration has been run.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const staffOptions = useMemo(() => {
    const byEmail = new Map()
    profiles.forEach((profile) => {
      const email = String(profile.user_email || '').toLowerCase()
      if (email) byEmail.set(email, {
        email,
        name: profile.full_name || email,
        manager_email: profile.manager_email || '',
        manager_name: profile.manager_name || '',
      })
    })
    staff.forEach((member) => {
      const email = String(member.email || '').toLowerCase()
      if (email && !byEmail.has(email)) byEmail.set(email, { email, name: member.name || email, manager_email: '', manager_name: '' })
    })
    return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [profiles, staff])

  const summary = {
    available: sumByStatus(commissions, ['available', 'pending']),
    requested: sumByStatus(commissions, ['requested']),
    approved: sumByStatus(commissions, ['approved']),
    paid: sumByStatus(commissions, ['paid']),
    pendingRequests: requests.filter((request) => request.status === 'requested').length,
  }

  const openSetting = (setting = null) => {
    if (setting) {
      setSettingForm({ ...EMPTY_SETTING, ...setting })
    } else {
      setSettingForm(EMPTY_SETTING)
    }
    setSettingModal(true)
  }

  const selectSettingStaff = (email) => {
    const member = staffOptions.find((item) => item.email === email)
    const existing = settings.find((item) => String(item.staff_email || '').toLowerCase() === email)
    setSettingForm({
      ...EMPTY_SETTING,
      ...(existing || {}),
      staff_email: email,
      staff_name: existing?.staff_name || member?.name || email,
      manager_email: existing?.manager_email || member?.manager_email || '',
      manager_name: existing?.manager_name || member?.manager_name || '',
    })
  }

  const saveSetting = async () => {
    setSaving(true)
    setError('')
    try {
      await upsertCommissionSetting({
        staffEmail: settingForm.staff_email,
        staffName: settingForm.staff_name,
        commissionRate: settingForm.commission_rate,
        enabled: settingForm.enabled,
        managerEmail: settingForm.manager_email,
        managerName: settingForm.manager_name,
        notes: settingForm.notes,
        user,
      })
      setSettingModal(false)
      await load()
    } catch (err) {
      setError(err.message || 'Could not save commission setting.')
    } finally {
      setSaving(false)
    }
  }

  const selectManualStaff = (email) => {
    const setting = settings.find((item) => String(item.staff_email || '').toLowerCase() === email)
    setManualForm((current) => ({ ...current, staff_email: email, commission_rate: setting?.commission_rate || current.commission_rate || '' }))
  }

  const saveManualCommission = async () => {
    setSaving(true)
    setError('')
    try {
      const selectedStaff = staffOptions.find((item) => item.email === manualForm.staff_email)
      await createManualCommission({
        staffEmail: manualForm.staff_email,
        staffName: selectedStaff?.name || manualForm.staff_email,
        clientName: manualForm.client_name,
        saleAmount: manualForm.sale_amount,
        commissionRate: manualForm.commission_rate,
        description: manualForm.description,
        user,
      })
      setManualModal(false)
      setManualForm(EMPTY_MANUAL)
      await load()
    } catch (err) {
      setError(err.message || 'Could not add manual commission.')
    } finally {
      setSaving(false)
    }
  }

  const decideRequest = async (status) => {
    if (!activeRequest) return
    setSaving(true)
    setError('')
    try {
      await decideCommissionPayoutRequest({ request: activeRequest, status, managerNotes, user })
      setActiveRequest(null)
      setManagerNotes('')
      await load()
    } catch (err) {
      setError(err.message || 'Could not update payout request.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Staff & Commissions</h1>
          <p className="page-sub">Commission settings, earned sales, payout requests, and paid statements.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-outline" onClick={() => openSetting()}><Settings size={14}/>Commission setting</button>
          <button className="btn btn-primary" onClick={() => setManualModal(true)}><Plus size={14}/>Manual commission</button>
        </div>
      </div>

      {error ? <div className="alert alert-red" style={{ marginBottom:16 }}>{error}</div> : null}

      <div className="dashboard-stat-grid" style={{ display:'grid', gridTemplateColumns:'repeat(5, minmax(0,1fr))', gap:14, marginBottom:20 }}>
        <div className="stat-card"><div className="stat-val">{formatCommissionCurrency(summary.available)}</div><div className="stat-lbl">Available</div></div>
        <div className="stat-card"><div className="stat-val">{formatCommissionCurrency(summary.requested)}</div><div className="stat-lbl">Requested</div></div>
        <div className="stat-card"><div className="stat-val">{formatCommissionCurrency(summary.approved)}</div><div className="stat-lbl">Approved</div></div>
        <div className="stat-card"><div className="stat-val">{formatCommissionCurrency(summary.paid)}</div><div className="stat-lbl">Paid</div></div>
        <div className="stat-card"><div className="stat-val">{summary.pendingRequests}</div><div className="stat-lbl">Payout queue</div></div>
      </div>

      <div className="tabs">
        {[['requests','Payout Requests'],['commissions','Commission Log'],['settings','Staff Rates']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`tab${tab === key ? ' on' : ''}`}>{label}</button>
        ))}
      </div>

      {loading ? <div className="spin-wrap"><div className="spin"/></div> : null}

      {!loading && tab === 'requests' ? (
        <div className="card" style={{ overflow:'hidden' }}>
          {requests.length === 0 ? <div className="empty"><p>No commission payout requests yet.</p></div> : (
            <table className="tbl">
              <thead><tr><th>Staff</th><th>Amount</th><th>Requested pay date</th><th>Status</th><th>Requested</th><th></th></tr></thead>
              <tbody>
                {requests.map((request) => {
                  const [label, tone] = getCommissionStatusLabel(request.status)
                  return (
                    <tr key={request.id}>
                      <td className="t-main">{request.staff_name || request.staff_email}</td>
                      <td>{formatCommissionCurrency(request.requested_amount)}</td>
                      <td>{request.requested_pay_date || '—'}</td>
                      <td><span className={`badge badge-${tone}`}>{label}</span></td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{request.requested_at ? new Date(request.requested_at).toLocaleString('en-GB') : '—'}</td>
                      <td><button className="btn btn-outline btn-sm" onClick={() => setActiveRequest(request)}>Review</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {!loading && tab === 'commissions' ? (
        <div className="card" style={{ overflow:'hidden' }}>
          {commissions.length === 0 ? <div className="empty"><p>No commission records yet.</p></div> : (
            <table className="tbl">
              <thead><tr><th>Staff</th><th>Client</th><th>Sale</th><th>Rate</th><th>Commission</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {commissions.map((commission) => {
                  const [label, tone] = getCommissionStatusLabel(commission.status)
                  return (
                    <tr key={commission.id}>
                      <td className="t-main">{commission.staff_name || commission.staff_email}</td>
                      <td>{legacyClientName(commission)}</td>
                      <td>{formatCommissionCurrency(commission.sale_value)}</td>
                      <td>{Number(commission.commission_rate || 0)}%</td>
                      <td>{formatCommissionCurrency(commission.commission_amount)}</td>
                      <td><span className={`badge badge-${tone}`}>{label}</span></td>
                      <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{commission.date || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {!loading && tab === 'settings' ? (
        <div className="card" style={{ overflow:'hidden' }}>
          {settings.length === 0 ? <div className="empty"><p>No commission rates configured yet.</p></div> : (
            <table className="tbl">
              <thead><tr><th>Staff</th><th>Rate</th><th>Manager</th><th>Status</th><th>Updated</th><th></th></tr></thead>
              <tbody>
                {settings.map((setting) => (
                  <tr key={setting.id || setting.staff_email}>
                    <td className="t-main">{setting.staff_name || setting.staff_email}</td>
                    <td>{Number(setting.commission_rate || 0)}%</td>
                    <td>{setting.manager_name || setting.manager_email || '—'}</td>
                    <td><span className={`badge badge-${setting.enabled === false ? 'grey' : 'green'}`}>{setting.enabled === false ? 'Disabled' : 'Enabled'}</span></td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{setting.updated_at ? new Date(setting.updated_at).toLocaleString('en-GB') : '—'}</td>
                    <td><button className="btn btn-outline btn-sm" onClick={() => openSetting(setting)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {settingModal ? (
        <Modal title="Commission setting" onClose={() => setSettingModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setSettingModal(false)}>Cancel</button><button className="btn btn-primary" onClick={saveSetting} disabled={saving}>{saving ? 'Saving...' : 'Save setting'}</button></>}>
          <div style={{ display:'grid', gap:14 }}>
            <div><label className="lbl">Staff member</label>
              <select className="inp" value={settingForm.staff_email} onChange={(event) => selectSettingStaff(event.target.value)}>
                <option value="">Select staff...</option>
                {staffOptions.map((member) => <option key={member.email} value={member.email}>{member.name}</option>)}
              </select>
            </div>
            <div className="fg">
              <div><label className="lbl">Commission rate (%)</label><input className="inp" type="number" min="0" step="0.1" value={settingForm.commission_rate} onChange={(event) => setSettingForm((current) => ({ ...current, commission_rate: event.target.value }))}/></div>
              <div><label className="lbl">Manager email</label><input className="inp" value={settingForm.manager_email || ''} onChange={(event) => setSettingForm((current) => ({ ...current, manager_email: event.target.value }))}/></div>
            </div>
            <label style={{ display:'flex', gap:8, alignItems:'center', fontSize:13 }}>
              <input type="checkbox" checked={settingForm.enabled !== false} onChange={(event) => setSettingForm((current) => ({ ...current, enabled: event.target.checked }))}/>
              Commission enabled for this staff member
            </label>
            <div><label className="lbl">Notes</label><textarea className="inp" rows={3} value={settingForm.notes || ''} onChange={(event) => setSettingForm((current) => ({ ...current, notes: event.target.value }))}/></div>
          </div>
        </Modal>
      ) : null}

      {manualModal ? (
        <Modal title="Add manual commission" onClose={() => setManualModal(false)}
          footer={<><button className="btn btn-outline" onClick={() => setManualModal(false)}>Cancel</button><button className="btn btn-primary" onClick={saveManualCommission} disabled={saving}>{saving ? 'Saving...' : 'Add commission'}</button></>}>
          <div style={{ display:'grid', gap:14 }}>
            <div><label className="lbl">Staff member</label>
              <select className="inp" value={manualForm.staff_email} onChange={(event) => selectManualStaff(event.target.value)}>
                <option value="">Select staff...</option>
                {staffOptions.map((member) => <option key={member.email} value={member.email}>{member.name}</option>)}
              </select>
            </div>
            <div className="fg">
              <div><label className="lbl">Client / sale</label><input className="inp" value={manualForm.client_name} onChange={(event) => setManualForm((current) => ({ ...current, client_name: event.target.value }))}/></div>
              <div><label className="lbl">Sale amount (£)</label><input className="inp" type="number" min="0" value={manualForm.sale_amount} onChange={(event) => setManualForm((current) => ({ ...current, sale_amount: event.target.value }))}/></div>
              <div><label className="lbl">Rate override (%)</label><input className="inp" type="number" min="0" step="0.1" value={manualForm.commission_rate} onChange={(event) => setManualForm((current) => ({ ...current, commission_rate: event.target.value }))}/></div>
            </div>
            <div><label className="lbl">Reason / notes</label><textarea className="inp" rows={3} value={manualForm.description} onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))} placeholder="Required for corrections, special cases, or imported sales."/></div>
          </div>
        </Modal>
      ) : null}

      {activeRequest ? (
        <Modal title="Review payout request" onClose={() => setActiveRequest(null)}
          footer={<>
            <button className="btn btn-outline" onClick={() => setActiveRequest(null)}>Close</button>
            <button className="btn btn-outline" style={{ color:'var(--red)' }} onClick={() => decideRequest('rejected')} disabled={saving}><XCircle size={14}/>Reject</button>
            <button className="btn btn-outline" onClick={() => decideRequest('approved')} disabled={saving}><CheckCircle2 size={14}/>Approve</button>
            <button className="btn btn-primary" onClick={() => decideRequest('paid')} disabled={saving}><CreditCard size={14}/>Mark paid</button>
          </>}>
          <div style={{ display:'grid', gap:14 }}>
            <div className="card card-pad" style={{ background:'var(--bg2)' }}>
              <div style={{ fontSize:18, fontWeight:600 }}>{activeRequest.staff_name || activeRequest.staff_email}</div>
              <div style={{ marginTop:8, color:'var(--sub)' }}>{formatCommissionCurrency(activeRequest.requested_amount)} requested for {activeRequest.requested_pay_date || 'no chosen date'}</div>
              {activeRequest.notes ? <div style={{ marginTop:10, fontSize:13, color:'var(--sub)' }}>{activeRequest.notes}</div> : null}
            </div>
            <div><label className="lbl">Manager notes</label><textarea className="inp" rows={3} value={managerNotes} onChange={(event) => setManagerNotes(event.target.value)}/></div>
            {activeRequest.statement_file_url ? <a className="btn btn-outline" href={activeRequest.statement_file_url} target="_blank" rel="noreferrer">Open statement PDF</a> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
