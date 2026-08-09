import { useState, useEffect } from 'react'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Modal } from '../../components/Modal'
import { StaffPicker } from '../../components/StaffPicker'
import { Button, FormField, FormLabel, FormInput, FormSelect, StatusBadge, Alert } from '../../components/ds'
import { sendManagedNotification } from '../../utils/notificationPreferences'

const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'
const TYPES  = ['Annual Leave','Sick Leave','Compassionate','Unpaid','Other']
const EMPTY  = { leave_type:'Annual Leave', start_date:'', end_date:'', reason:'', on_behalf_of_email:'', on_behalf_of_name:'' }

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
        await sendManagedNotification({
          userEmail: targetEmail,
          userName: targetName,
          title: statusLabel,
          message: form.start_date + ' to ' + form.end_date + ' · Updated by ' + user.name,
          link: '/hr/leave',
          type: newStatus === 'approved' ? 'success' : newStatus === 'rejected' ? 'warning' : 'info',
          category: 'hr',
          emailSubject: statusLabel + ' — ' + form.start_date + ' to ' + form.end_date,
          emailHtml: leaveEmailHtml(statusLabel, 'Hi ' + targetName + ', your leave request has been updated by ' + user.name + '.',
            [['Type', form.leave_type], ['From', form.start_date], ['To', form.end_date], ['Days', days], ['Status', newStatus], ['Reason', form.reason], ['Notes', form.notes]]
          ),
          sentBy: user?.name || user?.email,
          portalUrl: PORTAL_URL,
        }).catch(() => {})
      } else {
        // Dates/details changed
        await sendManagedNotification({
          userEmail: targetEmail,
          userName: targetName,
          title: '📅 Leave request updated',
          message: 'Updated by ' + user.name + ' · ' + form.start_date + ' to ' + form.end_date,
          link: '/hr/leave',
          type: 'info',
          category: 'hr',
          emailSubject: '📅 Leave Request Updated — ' + form.start_date + ' to ' + form.end_date,
          emailHtml: leaveEmailHtml('Leave Request Updated', 'Hi ' + targetName + ', your leave request has been updated by ' + user.name + '.',
            [['Type', form.leave_type], ['From', form.start_date], ['To', form.end_date], ['Days', days], ['Status', newStatus], ['Reason', form.reason], ['Notes', form.notes]]
          ),
          sentBy: user?.name || user?.email,
          portalUrl: PORTAL_URL,
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
      await sendManagedNotification({
        userEmail: reqEmail,
        userName: reqName,
        title: statusLabel,
        message: (status === 'approved' ? 'Approved by ' + user.name + ' · ' : 'Pending approval · ') + form.start_date + ' to ' + form.end_date,
        link: '/hr/leave',
        type: status === 'approved' ? 'success' : 'info',
        category: 'hr',
        emailSubject: statusLabel + ' — ' + form.start_date + ' to ' + form.end_date,
        emailHtml: leaveEmailHtml(statusLabel, 'Hi ' + reqName + ', ' + (status === 'approved' ? 'your leave has been approved by ' + user.name + '.' : 'your leave request has been submitted and is pending approval.'),
          [['Type', form.leave_type], ['From', form.start_date], ['To', form.end_date], ['Days', days], ['Reason', form.reason || '—'], ['Status', status]]
        ),
        sentBy: user?.name || user?.email,
        portalUrl: PORTAL_URL,
      }).catch(() => {})
    }

    setSaving(false); setModal(false); setEditing(null); setForm(EMPTY); load()
  }

  const deleteLeave = async (r) => {
    if (!confirm('Delete this leave request for ' + r.user_name + '? An email will be sent to notify them.')) return
    await supabase.from('hr_leave').delete().eq('id', r.id)
    await sendManagedNotification({
      userEmail: r.user_email,
      userName: r.user_name,
      title: '🗑 Leave request deleted',
      message: r.start_date + ' to ' + r.end_date + ' deleted by ' + user.name,
      link: '/hr/leave',
      type: 'warning',
      category: 'hr',
      emailSubject: '🗑 Leave Request Deleted — ' + r.start_date + ' to ' + r.end_date,
      emailHtml: leaveEmailHtml('Leave Request Deleted', 'Hi ' + r.user_name + ', your leave request has been deleted by ' + user.name + '. Please contact your manager if you have any questions.',
        [['Type', r.leave_type], ['From', r.start_date], ['To', r.end_date], ['Days', r.days], ['Reason', r.reason], ['Deleted by', user.name]]
      ),
      sentBy: user?.name || user?.email,
      portalUrl: PORTAL_URL,
    }).catch(() => {})
    load()
  }

  const decide = async (r, status) => {
    await supabase.from('hr_leave').update({ status, approved_by: user.name, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', r.id)
    const label = status === 'approved' ? '✅ Leave Approved' : '❌ Leave Rejected'
    await sendManagedNotification({
      userEmail: r.user_email,
      userName: r.user_name,
      title: label,
      message: r.start_date + ' to ' + r.end_date + ' · by ' + user.name,
      link: '/hr/leave',
      type: status === 'approved' ? 'success' : 'warning',
      category: 'hr',
      emailSubject: label + ' — ' + r.start_date + ' to ' + r.end_date,
      emailHtml: leaveEmailHtml(label, 'Hi ' + r.user_name + ', your leave request has been ' + status + ' by ' + user.name + '.',
        [['Type', r.leave_type], ['From', r.start_date], ['To', r.end_date], ['Days', r.days], ['Status', status], ['By', user.name]]
      ),
      sentBy: user?.name || user?.email,
      portalUrl: PORTAL_URL,
    }).catch(() => {})
    load()
  }

  const statusVariant = (s) => ({ approved: 'active', rejected: 'error', pending: 'warning' }[s] || 'info')

  return (
    <div className="ds-content">
      <div className="ds-page-header">
        <div><h1>Leave Requests</h1></div>
        <Button variant="primary" onClick={openAdd}>+ Request Leave</Button>
      </div>

      {!isManager && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24, maxWidth:400 }}>
          <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-green-500)' }}>25</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Annual Days Left</div></div>
          <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', padding:20 }}><div style={{ fontSize:24, fontWeight:600, color:'var(--color-amber-500)' }}>10</div><div style={{ fontSize:12, color:'var(--color-text-secondary)', marginTop:4 }}>Sick Days Left</div></div>
        </div>
      )}

      <div style={{ background:'var(--color-bg-surface)', border:'1px solid var(--color-border)', borderRadius:'var(--border-radius-lg)', overflow:'hidden' }}>
        {loading ? <div className="spin-wrap"><div className="spin"/></div> :
         requests.length === 0 ? <div style={{ padding:'var(--space-3xl)', textAlign:'center', color:'var(--color-text-secondary)' }}>No leave requests</div> : (
          <table className="ds-table">
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
                    <td>
                      <div style={{ fontWeight:500 }}>{r.user_name}</div>
                      <div style={{ fontSize:11, color:'var(--color-text-tertiary)' }}>{r.user_email}</div>
                    </td>
                  )}
                  <td>{r.leave_type}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{r.start_date}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{r.end_date}</td>
                  <td>{r.days}</td>
                  <td>
                    <StatusBadge variant={statusVariant(r.status)}>{r.status}</StatusBadge>
                    {r.approved_by && <div style={{ fontSize:11, color:'var(--color-text-tertiary)', marginTop:2 }}>by {r.approved_by}</div>}
                  </td>
                  {isManager && (
                    <td>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                        {r.status === 'pending' && <>
                          <Button variant="primary" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => decide(r, 'approved')}>Approve</Button>
                          <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px', color:'var(--color-red-500)' }} onClick={() => decide(r, 'rejected')}>Reject</Button>
                        </>}
                        <Button variant="ghost" style={{ height:28, fontSize:12, padding:'0 8px' }} onClick={() => openEdit(r)}>Edit</Button>
                        <Button variant="secondary" style={{ height:28, fontSize:12, padding:'0 8px', color:'var(--color-red-500)' }} onClick={() => deleteLeave(r)}>Delete</Button>
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
            <><Button variant="secondary" onClick={() => { setModal(false); setEditing(null) }}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !form.start_date || !form.end_date}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Submit Request'}
            </Button></>
          }>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {!editing && isManager && (
              <Alert variant="info">As a manager you can book leave on behalf of a staff member.</Alert>
            )}
            {!editing && isManager && (
              <StaffPicker label="On behalf of (leave blank for yourself)" value={form.on_behalf_of_email}
                onChange={({ email, name }) => { sf('on_behalf_of_email', email); sf('on_behalf_of_name', name) }}
                placeholder="Select staff member or leave blank..."/>
            )}
            {editing && isManager && (
              <FormField>
                <FormLabel>Status</FormLabel>
                <FormSelect value={form.status} onChange={e => sf('status', e.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </FormSelect>
              </FormField>
            )}
            <FormField>
              <FormLabel>Leave Type</FormLabel>
              <FormSelect value={form.leave_type} onChange={e => sf('leave_type', e.target.value)}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </FormSelect>
            </FormField>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0,1fr))', gap:16 }}>
              <FormField><FormLabel>From</FormLabel><FormInput type="date" value={form.start_date} onChange={e => sf('start_date', e.target.value)}/></FormField>
              <FormField><FormLabel>To</FormLabel><FormInput type="date" value={form.end_date} onChange={e => sf('end_date', e.target.value)}/></FormField>
            </div>
            <FormField><FormLabel>Reason (optional)</FormLabel><textarea className="ds-form-input" rows={3} value={form.reason} onChange={e => sf('reason', e.target.value)} style={{ resize:'vertical', padding:'8px 12px' }}/></FormField>
            {editing && isManager && (
              <FormField><FormLabel>Manager Notes</FormLabel><textarea className="ds-form-input" rows={2} value={form.notes||''} onChange={e => sf('notes', e.target.value)} style={{ resize:'vertical', padding:'8px 12px' }} placeholder="Internal notes (not shown to staff)..."/></FormField>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
