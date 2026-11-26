import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Chip } from '../components/DH'
import { Screen, HeaderButton, Field, Pills, Pill, Btn, Empty, Loading } from '../components/UI'
import Icon from '../components/Icon'
import ErrorAlert from '../components/ErrorAlert'
import { useSearch } from '../components/SearchBar'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import PullToRefresh from '../components/PullToRefresh'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import { loadActivePortalStaffAudience } from '../../utils/staffAudience'

// Shares the same `hr_leave` table as the web HR Leave page (src/pages/hr/
// HRLeave.jsx) - this used to be a separate `leave_requests` table that only
// the mobile app wrote to, so a leave request submitted on one platform was
// invisible on the other, and the "new request" admin notification could
// never fire for anything submitted via web. Keep the field names and
// on_behalf_of semantics identical to HRLeave.jsx so both surfaces stay in
// sync.
const LEAVE_TYPES = ['Annual Leave', 'Sick Leave', 'Compassionate', 'Unpaid', 'Other']
const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'

export default function MobileLeave({ goBack, user, isAdmin, navigate }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all') // all, pending, approved, rejected
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingRequest, setEditingRequest] = useState(null)
  const [searchTerm, setSearchTerm, debouncedSearch] = useSearch()
  const [staffList, setStaffList] = useState([])
  const [form, setForm] = useState({
    leave_type: 'Annual Leave',
    start_date: '',
    end_date: '',
    reason: '',
    notes: '',
    on_behalf_of_email: '',
    on_behalf_of_name: '',
  })

  const loadStaffList = async () => {
    try {
      // Current staff only. Reading `hr_profiles` directly included people who
      // have left, so leave could be booked on behalf of a leaver. Same shared
      // definition the rota and the message sender use.
      const audience = await loadActivePortalStaffAudience()
      setStaffList(audience.map(person => ({
        user_email: person.email,
        full_name: person.name,
      })))
    } catch (err) {
      console.error('Failed to load staff list:', err)
    }
  }

  const loadRequests = async () => {
    setLoading(true)
    setError('')
    try {
      let query = supabase
        .from('hr_leave')
        .select('*')
        .order('created_at', { ascending: false })

      // If not admin, only show own requests
      if (!isAdmin) {
        query = query.ilike('user_email', user.email)
      }

      const { data, error } = await query
      if (error) throw error
      setRequests(data || [])
    } catch (err) {
      console.error('Failed to load leave requests:', err)
      setError(err.message || 'Failed to load leave requests. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const { scrollRef, isRefreshing, pullDistance, handlers } = usePullToRefresh(loadRequests)

  useEffect(() => {
    loadRequests()
    if (isAdmin) loadStaffList()
  }, [user?.email, isAdmin])

  const handleAddPress = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })
    setEditingRequest(null)
    setForm({
      leave_type: 'Annual Leave',
      start_date: '',
      end_date: '',
      reason: '',
      notes: '',
      on_behalf_of_email: '',
      on_behalf_of_name: '',
    })
    setShowAddForm(true)
  }

  const handleEditPress = async (request) => {
    if (!isAdmin) return
    await Haptics.impact({ style: ImpactStyle.Medium })
    setEditingRequest(request)
    setForm({
      leave_type: request.leave_type,
      start_date: request.start_date,
      end_date: request.end_date,
      reason: request.reason || '',
      notes: request.notes || '',
      on_behalf_of_email: '',
      on_behalf_of_name: '',
    })
    setShowAddForm(true)
  }

  const handleSubmit = async () => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    if (!form.start_date || !form.end_date) {
      alert('Please select start and end dates')
      return
    }

    const start = new Date(form.start_date)
    const end = new Date(form.end_date)
    const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1)

    try {
      if (editingRequest) {
        const { error } = await supabase
          .from('hr_leave')
          .update({
            leave_type: form.leave_type,
            start_date: form.start_date,
            end_date: form.end_date,
            days,
            reason: form.reason,
            notes: form.notes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingRequest.id)

        if (error) throw error

      } else {
        // Admin booking leave on behalf of someone else is auto-approved
        // (the booking action itself is the approval) - matches HRLeave.jsx
        const requestForEmail = (isAdmin && form.on_behalf_of_email) || user.email
        const requestForName = (isAdmin && form.on_behalf_of_name) || user.name
        const status = isAdmin && form.on_behalf_of_email ? 'approved' : 'pending'

        const optimisticRequest = {
          id: 'temp-' + Date.now(),
          leave_type: form.leave_type,
          start_date: form.start_date,
          end_date: form.end_date,
          reason: form.reason,
          user_email: requestForEmail,
          user_name: requestForName,
          days,
          status,
          approved_by: status === 'approved' ? user.name : null,
          created_at: new Date().toISOString(),
        }

        setRequests([optimisticRequest, ...requests])
        setShowAddForm(false)

        try {
          const { data, error } = await supabase
            .from('hr_leave')
            .insert([{
              leave_type: form.leave_type,
              start_date: form.start_date,
              end_date: form.end_date,
              reason: form.reason,
              user_email: requestForEmail,
              user_name: requestForName,
              days,
              status,
              approved_by: status === 'approved' ? user.name : null,
              created_at: new Date().toISOString(),
            }])
            .select()
            .single()

          if (error) throw error

          setRequests(reqs =>
            reqs.map(r => r.id === optimisticRequest.id ? data : r)
          )
        } catch (error) {
          setRequests(reqs =>
            reqs.filter(r => r.id !== optimisticRequest.id)
          )
          throw error
        }
        // Admins/managers with a pending request awaiting review are
        // notified server-side (DB trigger on hr_leave), so both web and
        // mobile submissions reach them the same way - no client call here.
      }

      setShowAddForm(false)
      setEditingRequest(null)
      loadRequests()
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } catch (error) {
      console.error('Failed to save leave request:', error)
      alert('Failed to save leave request. Please try again.')
    }
  }

  /**
   * Tells somebody what was decided about their leave.
   *
   * Never allowed to fail the decision itself — the request has already been
   * updated by the time this runs, and an approval that rolls back because an
   * email bounced would be worse than a missed notification.
   */
  const notifyDecision = async (request, decision) => {
    const approved = decision === 'approved'
    try {
      await sendManagedNotification({
        event: 'leave_approved',
        userEmail: request.user_email,
        userName: request.user_name,
        title: approved ? 'Leave approved' : 'Leave declined',
        message: `${request.start_date} to ${request.end_date} — ${decision} by ${user.name}`,
        link: '/hr/leave',
        type: approved ? 'success' : 'warning',
        category: 'hr',
      })
    } catch (error) {
      console.warn('Leave decision notification failed:', error?.message)
    }
  }

  const handleApprove = async (request) => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    if (!confirm(`Approve leave for ${request.user_name}?`)) return

    try {
      const { error } = await supabase
        .from('hr_leave')
        .update({
          status: 'approved',
          approved_by: user.name,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) throw error

      // Told directly from here. This used to carry a comment claiming a
      // server-side trigger on hr_leave did it — there is no such trigger, so
      // leave approved from a phone notified nobody while the same decision
      // made on the web did.
      await notifyDecision(request, 'approved')

      loadRequests()
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } catch (error) {
      console.error('Failed to approve leave:', error)
      alert('Failed to approve leave. Please try again.')
    }
  }

  const handleReject = async (request) => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    if (!confirm(`Reject leave for ${request.user_name}?`)) return

    try {
      const { error } = await supabase
        .from('hr_leave')
        .update({
          status: 'rejected',
          approved_by: user.name,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', request.id)

      if (error) throw error

      await notifyDecision(request, 'rejected')

      loadRequests()
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } catch (error) {
      console.error('Failed to reject leave:', error)
      alert('Failed to reject leave. Please try again.')
    }
  }

  const handleDelete = async (request) => {
    await Haptics.impact({ style: ImpactStyle.Medium })

    if (!confirm('Delete this leave request? An email will be sent to notify them.')) return

    try {
      const { error } = await supabase
        .from('hr_leave')
        .delete()
        .eq('id', request.id)

      if (error) throw error

      // No DB trigger fires on delete (nothing to compare status against),
      // so this one stays a direct client-side notification - matches
      // HRLeave.jsx's deleteLeave().
      await sendManagedNotification({
        event: 'leave_approved',
        userEmail: request.user_email,
        userName: request.user_name,
        title: '🗑 Leave request deleted',
        message: `${request.start_date} to ${request.end_date} deleted by ${user.name}`,
        link: '/hr/leave',
        type: 'warning',
        category: 'hr',
        emailSubject: `Leave Request Deleted - ${request.start_date} to ${request.end_date}`,
        emailHtml: `<p>Your leave request has been deleted by ${user.name}.</p>`,
        sentBy: user?.name || user?.email,
        portalUrl: PORTAL_URL,
      }).catch(() => {})

      loadRequests()
      await Haptics.impact({ style: ImpactStyle.Heavy })
    } catch (error) {
      console.error('Failed to delete leave:', error)
      alert('Failed to delete leave. Please try again.')
    }
  }

  const stats = {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return '#34c759'
      case 'rejected': return '#ff3b30'
      case 'pending': return '#ff9500'
      default: return 'var(--mobile-text-secondary)'
    }
  }

  if (showAddForm) {
    return (
      <Screen title={editingRequest ? 'Edit leave' : 'Book time off'} onBack={() => setShowAddForm(false)}>
        {!editingRequest && isAdmin && (
          <span className="dh-sub">As an admin you can book leave on behalf of a staff member.</span>
        )}

        <div className="dh-card">
          <Field label="Type" htmlFor="lv-type">
            <select id="lv-type" value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })}>
              {LEAVE_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </Field>
          <div className="lv-two">
            <Field label="From" htmlFor="lv-from">
              <input id="lv-from" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </Field>
            <Field label="To" htmlFor="lv-to">
              <input id="lv-to" type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Field>
          </div>
          <Field label="Reason" htmlFor="lv-reason">
            <textarea id="lv-reason" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional, e.g. family holiday" />
          </Field>
          {!editingRequest && isAdmin && (
            <Field label="On behalf of" htmlFor="lv-who">
              <select
                id="lv-who"
                value={form.on_behalf_of_email}
                onChange={(e) => {
                  const person = staffList.find(s => s.user_email === e.target.value)
                  setForm({
                    ...form,
                    on_behalf_of_email: e.target.value,
                    on_behalf_of_name: person?.full_name || '',
                  })
                }}
              >
                <option value="">Myself ({user.name})</option>
                {staffList.filter(s => s.user_email !== user.email).map(s => (
                  <option key={s.user_email} value={s.user_email}>{s.full_name || s.user_email}</option>
                ))}
              </select>
            </Field>
          )}
          {editingRequest && isAdmin && (
            <Field label="Manager notes" htmlFor="lv-notes" hint="Internal, not shown to staff.">
              <textarea id="lv-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          )}
        </div>

        <Btn onPress={handleSubmit}>{editingRequest ? 'Update request' : 'Request leave'}</Btn>
        <style>{LV_CSS}</style>
      </Screen>
    )
  }


  // Filter and search
  const filteredRequests = requests.filter(r => {
    const matchesFilter = filter === 'all' || r.status === filter
    const matchesSearch = !debouncedSearch ||
      r.user_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      r.leave_type?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      r.reason?.toLowerCase().includes(debouncedSearch.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="mobile-screen" ref={scrollRef} {...handlers}>
      <PullToRefresh isRefreshing={isRefreshing} pullDistance={pullDistance} />
      <Screen
        title="Leave"
        onBack={goBack}
        action={<HeaderButton onPress={handleAddPress} label="Book time off"><Icon name="plus" size={20} /></HeaderButton>}
      >
        <ErrorAlert error={error} onRetry={loadRequests} onDismiss={() => setError('')} />

        <div className="dh-tiles t3">
          <div className="dh-tile"><span className="dh-num" style={{ color: stats.pending ? '#8A4A00' : undefined }}>{stats.pending}</span><span className="dh-sub">Pending</span></div>
          <div className="dh-tile"><span className="dh-num">{stats.approved}</span><span className="dh-sub">Approved</span></div>
          <div className="dh-tile"><span className="dh-num">{stats.rejected}</span><span className="dh-sub">Rejected</span></div>
        </div>

        <div className="dh-search">
          <Icon name="search" size={18} />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by name, type or reason" aria-label="Search leave" />
        </div>

        <Pills>
          {['all', 'pending', 'approved', 'rejected'].map(f => (
            <Pill key={f} on={filter === f} onPress={() => setFilter(f)}>
              {f === 'all' ? `All ${stats.total}` : f.charAt(0).toUpperCase() + f.slice(1)}
            </Pill>
          ))}
        </Pills>

        {loading ? <Loading /> : filteredRequests.length === 0 ? (
          <Empty icon="calendar" title={`No ${filter !== 'all' ? filter : ''} leave requests`} sub="Tap + to book time off." />
        ) : (
          <div className="dh-card">
            {filteredRequests.map(request => (
              <div key={request.id} className="lv-item">
                <button type="button" className="dh-row top" onClick={() => isAdmin && handleEditPress(request)} disabled={!isAdmin} style={{ opacity: 1 }}>
                  <span className="dh-ic"><Icon name="plane" size={18} /></span>
                  <span className="dh-g">
                    <span className="dh-t">{isAdmin ? `${request.user_name} · ${request.leave_type}` : request.leave_type}</span>
                    <span className="dh-sub">{request.start_date} to {request.end_date} · {request.days} {request.days === 1 ? 'day' : 'days'}</span>
                    {request.reason && <span className="dh-sub">{request.reason}</span>}
                    {request.approved_by && (
                      <span className="dh-sub">{request.status === 'approved' ? 'Approved' : 'Rejected'} by {request.approved_by}</span>
                    )}
                  </span>
                  <Chip tone={request.status === 'approved' ? 'green' : request.status === 'pending' ? 'amber' : request.status === 'rejected' ? 'red' : 'neutral'}>
                    {request.status ? request.status[0].toUpperCase() + request.status.slice(1) : ''}
                  </Chip>
                </button>
                {isAdmin && (
                  <div className="lv-actions">
                    {request.status === 'pending' && (
                      <>
                        <Pill onPress={() => handleApprove(request)}>Approve</Pill>
                        <Pill onPress={() => handleReject(request)}>Reject</Pill>
                      </>
                    )}
                    <Pill tone="danger" onPress={() => handleDelete(request)}>Delete</Pill>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <Btn onPress={handleAddPress}>Book time off</Btn>
      </Screen>
      <style>{LV_CSS}</style>
    </div>
  )
}

const LV_CSS = `
  .lv-two { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid var(--mobile-border); }
  .lv-two .dh-fld { border-bottom: 0; }
  .lv-two .dh-fld + .dh-fld { border-left: 1px solid var(--mobile-border); }
  .lv-item { border-bottom: 1px solid var(--mobile-border); }
  .lv-item:last-child { border-bottom: 0; }
  .lv-item .dh-row { border-bottom: 0; }
  .lv-actions { display: flex; gap: 8px; padding: 0 16px 14px 62px; flex-wrap: wrap; }
`
