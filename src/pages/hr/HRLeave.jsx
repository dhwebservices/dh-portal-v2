import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { sendEmail } from '../../utils/email'
import { useAuth } from '../../contexts/AuthContext'
import { Modal } from '../../components/Modal'
import { StaffPicker } from '../../components/StaffPicker'

const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'
const TYPES  = ['Annual Leave','Sick Leave','Compassionate','Unpaid','Other']
const EMPTY  = { leave_type:'Annual Leave', start_date:'', end_date:'', reason:'', on_behalf_of_email:'', on_behalf_of_name:'' }

async function notify(user_email, title, message, link, type='info') {
  try { await supabase.from('notifications').insert([{ user_email, title, message, type, link, read: false, created_at: new Date().toISOString() }]) } catch(e) {}
}

function leaveEmailHtml(title, intro, rows) {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;padding:32px">' +
    '<h2 style="color:#1A1612;margin-bottom:4px">' + title + '</h2>' +
    '<p style="color:#6b7280;margin-bottom:20px">' + intro + '</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:16px 0">' +
    rows.map(([l,v]) => '<tr><td style="padding:9px 12px;background:#F9FAFB;border:1px solid #E5E7EB;font-weight:600;width:110px;font-size:13px">' + l + '</td><td style="padding:9px 12px;border:1px solid #E5E7EB;font-size:13px">' + (v||'—') + '</td></tr>').join('') +
    '</table>' +
    '<a href="' + PORTAL_URL + '/hr/leave" style="display:inline-block;background:#1A1612;color:#fff;padding:10px 22px;border-radius:7px;text-decoration:none;font-size:13px;margin-top:8px">View Leave →</a>' +
    '</div>'
}

export default function HRLeave() {
  const { user, isAdmin: isManager } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { load() }, [user?.email])

  const load = async () => {
    setLoading(true)
    const query = isManager
      ? supabase.from('hr_leave').select('*').order('created_at', { ascending: false })
      : supabase.from('hr_leave').select('*').ilike('user_email', user.email).order('created_at', { ascending: false })
    const { data } = await query
    setRequests(data || [])
    setLoading(false)
  }

  const openAdd = () => { setEditing(null); setForm(EMPTY); setModal(true) }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      leave_type: r.leave_type,
      start_date: r.start_date,
      end_date: r.end_date,
      reason: r.reason || '',
      on_behalf_of_email: r.on_behalf_of_email || '',
      on_behalf_of_name: r.on_behalf_of_name || '',
      status: r.status,
      notes: r.notes || '',
    })
    setModal(true)
  }

  const submit = async () => {
    setSaving(true)
    const start = new Date(form.start_date), end = new Date(form.end_date)
    const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1)

    if (editing) {
      // ── UPDATE existing request ──────────────────────────────────
      const prevStatus = editing.status
      const newStatus  = form.status || editing.status
      const { error } = await supabase.from('hr_leave').update({
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date:   form.end_date,
        days,
        reason:     form.reason,
        notes:      form.notes,
        status:     newStatus,
        approved_by: newStatus === 'approved' ? user.name : editing.approved_by,
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id)

      if (error) { console.error('Leave update error:', error); setSaving(false); return }

      const targetEmail = editing.user_email
      const targetName  = editing.user_name

      // Notify + email if status changed
      if (newStatus !== prevStatus) {
        const statusLabel = newStatus === 'approved' ? '✅ Leave Approved' : newStatus === 'rejected' ? '❌ Leave Rejected' : '📅 Leave Updated'
        await notify(targetEmail, statusLabel, form.start_date + ' to ' + form.end_date + ' · Updated by ' + user.name, '/hr/leave', newStatus === 'approved' ? 'success' : newStatus === 'rejected' ? 'warning' : 'info')
        sendEmail('send_email', {
          to: targetEmail,
          to_name: targetName,
          subject: statusLabel + ' — ' + form.start_date + ' to ' + form.end_date,
          html: leaveEmailHtml(statusLabel, 'Hi ' + targetName + ', your leave request has been updated by ' + user.name + '.',
            [['Type', form.leave_type], ['From', form.start_date], ['To', form.end_date], ['Days', days], ['Status', newStatus], ['Reason', form.reason], ['Notes', form.notes]]
          ),
          sent_by: user?.name || user?.email,
          portal_url: PORTAL_URL,
        }).catch(() => {})
      } else {
        // Dates/details changed
        await notify(targetEmail, '📅 Leave request updated', 'Updated by ' + user.name + ' · ' + form.start_date + ' to ' + form.end_date, '/hr/leave', 'info')
        sendEmail('send_email', {
          to: targetEmail,
          to_name: targetName,
          subject: '📅 Leave Request Updated — ' + form.start_date + ' to ' + form.end_date,
          html: leaveEmailHtml('Leave Request Updated', 'Hi ' + targetName + ', your leave request has been updated by ' + user.name + '.',
            [['Type', form.leave_type], ['From', form.start_date], ['To', form.end_date], ['Days', days], ['Status', newStatus], ['Reason', form.reason], ['Notes', form.notes]]
          ),
          sent_by: user?.name || user?.email,
          portal_url: PORTAL_URL,
        }).catch(() => {})
      }

    } else {
      // ── INSERT new request ──────────────────────────────────────
      const reqEmail = form.on_behalf_of_email || user.email
      const reqName  = form.on_behalf_of_name  || user.name
      const status   = form.on_behalf_of_email && isManager ? 'approved' : 'pending'

      const { error } = await supabase.from('hr_leave').insert([{
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date:   form.end_date,
        reason:     form.reason,
        user_email: reqEmail,
        user_name:  reqName,
        days,
        status,
        approved_by: status === 'approved' ? user.name : null,
        created_at: new Date().toISOString(),
      }])

      if (error) { console.error('Leave save error:', error); setSaving(false); return }

      const statusLabel = status === 'approved' ? '✅ Leave Approved' : '📅 Leave Request Submitted'
      await notify(reqEmail, statusLabel,
        (status === 'approved' ? 'Approved by ' + user.name + ' · ' : 'Pending approval · ') + form.start_date + ' to ' + form.end_date,
        '/hr/leave', status === 'approved' ? 'success' : 'info'
      )
      sendEmail('send_email', {
        to: reqEmail,
        to_name: reqName,
        subject: statusLabel + ' — ' + form.start_date + ' to ' + form.end_date,
        html: leaveEmailHtml(statusLabel, 'Hi ' + reqName + ', ' + (status === 'approved' ? 'your leave has been approved by ' + user.name + '.' : 'your leave request has been submitted and is pending approval.'),
          [['Type', form.leave_type], ['From', form.start_date], ['To', form.end_date], ['Days', days], ['Reason', form.reason || '—'], ['Status', status]]
        ),
        sent_by: user?.name || user?.email,
        portal_url: PORTAL_URL,
      }).catch(() => {})
    }

    setSaving(false); setModal(false); setEditing(null); setForm(EMPTY); load()
  }

  const deleteLeave = async (r) => {
    if (!confirm('Delete this leave request for ' + r.user_name + '? An email will be sent to notify them.')) return
    await supabase.from('hr_leave').delete().eq('id', r.id)
    await notify(r.user_email, '🗑 Leave request deleted', r.start_date + ' to ' + r.end_date + ' deleted by ' + user.name, '/hr/leave', 'warning')
    sendEmail('send_email', {
      to: r.user_email,
      to_name: r.user_name,
      subject: '🗑 Leave Request Deleted — ' + r.start_date + ' to ' + r.end_date,
      html: leaveEmailHtml('Leave Request Deleted', 'Hi ' + r.user_name + ', your leave request has been deleted by ' + user.name + '. Please contact your manager if you have any questions.',
        [['Type', r.leave_type], ['From', r.start_date], ['To', r.end_date], ['Days', r.days], ['Reason', r.reason], ['Deleted by', user.name]]
      ),
      sent_by: user?.name || user?.email,
      portal_url: PORTAL_URL,
    }).catch(() => {})
    load()
  }

  const decide = async (r, status) => {
    await supabase.from('hr_leave').update({ status, approved_by: user.name, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', r.id)
    const label = status === 'approved' ? '✅ Leave Approved' : '❌ Leave Rejected'
    await notify(r.user_email, label, r.start_date + ' to ' + r.end_date + ' · by ' + user.name, '/hr/leave', status === 'approved' ? 'success' : 'warning')
    sendEmail('send_email', {
      to: r.user_email,
      to_name: r.user_name,
      subject: label + ' — ' + r.start_date + ' to ' + r.end_date,
      html: leaveEmailHtml(label, 'Hi ' + r.user_name + ', your leave request has been ' + status + ' by ' + user.name + '.',
        [['Type', r.leave_type], ['From', r.start_date], ['To', r.end_date], ['Days', r.days], ['Status', status], ['By', user.name]]
      ),
      sent_by: user?.name || user?.email,
      portal_url: PORTAL_URL,
    }).catch(() => {})
    load()
  }

  const statusBadge = (s) => {
    const map = { approved: 'green', rejected: 'red', pending: 'amber' }
    return <span className={'badge badge-' + (map[s] || 'grey')}>{s}</span>
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div><h1 className="page-title">Leave Requests</h1></div>
        <button className="btn btn-primary" onClick={openAdd}>+ Request Leave</button>
      </div>

      {!isManager && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24, maxWidth:400 }}>
          <div className="stat-card"><div className="stat-val" style={{ color:'var(--green)' }}>25</div><div className="stat-lbl">Annual Days Left</div></div>
          <div className="stat-card"><div className="stat-val" style={{ color:'var(--amber)' }}>10</div><div className="stat-lbl">Sick Days Left</div></div>
        </div>
      )}

      <div className="card" style={{ overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> :
         requests.length === 0 ? <div className="empty"><p>No leave requests</p></div> : (
          <table className="tbl">
            <thead>
              <tr>
                {isManager && <th>Staff Member</th>}
                <th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th>
                {isManager && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id}>
                  {isManager && (
                    <td className="t-main">
                      <div style={{ fontWeight:500 }}>{r.user_name}</div>
                      <div style={{ fontSize:11, color:'var(--faint)' }}>{r.user_email}</div>
                    </td>
                  )}
                  <td>{r.leave_type}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{r.start_date}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{r.end_date}</td>
                  <td>{r.days}</td>
                  <td>
                    {statusBadge(r.status)}
                    {r.approved_by && <div style={{ fontSize:11, color:'var(--faint)', marginTop:2 }}>by {r.approved_by}</div>}
                  </td>
                  {isManager && (
                    <td>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                        {r.status === 'pending' && <>
                          <button className="btn btn-sm" style={{ background:'var(--green,#22c55e)', color:'#fff', border:'none' }} onClick={() => decide(r, 'approved')}>Approve</button>
                          <button className="btn btn-danger btn-sm" onClick={() => decide(r, 'rejected')}>Reject</button>
                        </>}
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteLeave(r)}>Delete</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <Modal
          title={editing ? 'Edit Leave Request' : (isManager ? 'Request / Book Leave' : 'Request Leave')}
          onClose={() => { setModal(false); setEditing(null) }}
          footer={
            <><button className="btn btn-outline" onClick={() => { setModal(false); setEditing(null) }}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !form.start_date || !form.end_date}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Submit Request'}
            </button></>
          }>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {!editing && isManager && (
              <div style={{ padding:'10px 14px', background:'var(--blue-bg)', border:'1px solid var(--blue)', borderRadius:7, fontSize:13, color:'var(--blue)' }}>
                As a manager you can book leave on behalf of a staff member.
              </div>
            )}
            {!editing && isManager && (
              <StaffPicker label="On behalf of (leave blank for yourself)" value={form.on_behalf_of_email}
                onChange={({ email, name }) => { sf('on_behalf_of_email', email); sf('on_behalf_of_name', name) }}
                placeholder="Select staff member or leave blank..."/>
            )}
            {editing && isManager && (
              <div>
                <label className="lbl">Status</label>
                <select className="inp" value={form.status} onChange={e => sf('status', e.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            )}
            <div>
              <label className="lbl">Leave Type</label>
              <select className="inp" value={form.leave_type} onChange={e => sf('leave_type', e.target.value)}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="fg">
              <div><label className="lbl">From</label><input className="inp" type="date" value={form.start_date} onChange={e => sf('start_date', e.target.value)}/></div>
              <div><label className="lbl">To</label><input className="inp" type="date" value={form.end_date} onChange={e => sf('end_date', e.target.value)}/></div>
            </div>
            <div><label className="lbl">Reason (optional)</label><textarea className="inp" rows={3} value={form.reason} onChange={e => sf('reason', e.target.value)} style={{ resize:'vertical' }}/></div>
            {editing && isManager && (
              <div><label className="lbl">Manager Notes</label><textarea className="inp" rows={2} value={form.notes||''} onChange={e => sf('notes', e.target.value)} style={{ resize:'vertical' }} placeholder="Internal notes (not shown to staff)..."/></div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
