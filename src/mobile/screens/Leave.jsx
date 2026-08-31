import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import MobileCard from '../components/MobileCard'
import Icon from '../components/Icon'
import ErrorAlert from '../components/ErrorAlert'
import SearchBar, { useSearch } from '../components/SearchBar'
import { usePullToRefresh } from '../../hooks/usePullToRefresh'
import PullToRefresh from '../components/PullToRefresh'
import { SkeletonList } from '../components/SkeletonLoader'
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
      <div className="mobile-screen">
        <div className="mobile-screen-header">
          <button className="mobile-back-btn" onClick={() => setShowAddForm(false)}>
            <Icon name="chevronLeft" size={24} color="var(--mobile-accent)" />
          </button>
          <h1>{editingRequest ? 'Edit Leave' : 'Request Leave'}</h1>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ padding: '20px' }}>
          {!editingRequest && isAdmin && (
            <div className="admin-hint">
              As an admin you can book leave on behalf of a staff member.
            </div>
          )}

          {!editingRequest && isAdmin && (
            <div className="form-group">
              <label className="form-label">On behalf of (leave blank for yourself)</label>
              <select
                className="form-input"
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
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Leave Type</label>
            <select
              className="form-input"
              value={form.leave_type}
              onChange={(e) => setForm({ ...form, leave_type: e.target.value })}
            >
              {LEAVE_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input
              type="date"
              className="form-input"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">End Date</label>
            <input
              type="date"
              className="form-input"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Reason (optional)</label>
            <textarea
              className="form-input"
              rows={4}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g., Family holiday"
            />
          </div>

          {editingRequest && isAdmin && (
            <div className="form-group">
              <label className="form-label">Manager Notes (internal, not shown to staff)</label>
              <textarea
                className="form-input"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          )}

          <button className="btn-primary" onClick={handleSubmit}>
            {editingRequest ? 'Update Request' : 'Submit Request'}
          </button>
        </div>

        <style>{`

          .admin-hint {
            padding: 12px 14px;
            background: rgba(0,102,204,0.1);
            border: 1px solid var(--mobile-accent);
            border-radius: 8px;
            font-size: 13px;
            color: var(--mobile-accent);
            margin-bottom: 16px;
          }

          .form-group {
            margin-bottom: 20px;
          }

          .form-label {
            display: block;
            font-size: 14px;
            font-weight: 600;
            color: var(--mobile-text);
            margin-bottom: 8px;
          }

          .form-input {
            width: 100%;
            padding: 12px;
            font-size: 16px;
            border: 1px solid var(--mobile-border);
            border-radius: 8px;
            background: var(--mobile-bg);
            color: var(--mobile-text);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          }

          .form-input:focus {
            outline: none;
            border-color: var(--mobile-accent);
          }

          .btn-primary {
            width: 100%;
            padding: 14px;
            background: var(--mobile-accent);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
          }

          .btn-primary:active {
            opacity: 0.8;
          }
        `}</style>
      </div>
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

      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="var(--mobile-accent)" />
        </button>
        <h1>Leave Requests</h1>
        <div style={{ width: 60 }} />
      </div>

      <ErrorAlert error={error} onRetry={loadRequests} onDismiss={() => setError('')} />

      {/* Search */}
      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search by name, type, or reason..."
      />

      {/* Stats */}
      <div style={{ padding: '20px', background: 'var(--mobile-bg)' }}>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#ff9500' }}>{stats.pending}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#34c759' }}>{stats.approved}</div>
            <div className="stat-label">Approved</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: '#ff3b30' }}>{stats.rejected}</div>
            <div className="stat-label">Rejected</div>
          </div>
        </div>
      </div>

      {/* Filter Chips */}
      <div style={{ padding: '0 20px 12px', background: 'var(--mobile-bg)' }}>
        <div className="filter-chips">
          {['all', 'pending', 'approved', 'rejected'].map(f => (
            <button
              key={f}
              className={`filter-chip ${filter === f ? 'active' : ''}`}
              onClick={async () => {
                await Haptics.impact({ style: ImpactStyle.Light })
                setFilter(f)
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Request List */}
      <div style={{ padding: '20px', paddingBottom: '100px' }}>
        {loading ? (
          <SkeletonList count={5} lines={4} />
        ) : filteredRequests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Icon name="calendar" size={48} color="var(--mobile-border)" />
            <p style={{ marginTop: 16, fontSize: 15, color: 'var(--mobile-text-secondary)' }}>
              No {filter !== 'all' ? filter : ''} leave requests
            </p>
          </div>
        ) : (
          <div className="request-list">
            {filteredRequests.map(request => (
              <MobileCard key={request.id} onPress={() => isAdmin && handleEditPress(request)}>
                <div className="request-card">
                  <div className="request-header">
                    <div>
                      <div className="request-type">{request.leave_type}</div>
                      {isAdmin && (
                        <div className="request-user">{request.user_name}</div>
                      )}
                    </div>
                    <div
                      className="status-badge"
                      style={{ background: `${getStatusColor(request.status)}20`, color: getStatusColor(request.status) }}
                    >
                      {request.status}
                    </div>
                  </div>

                  <div className="request-dates">
                    <Icon name="calendar" size={16} color="var(--mobile-text-secondary)" />
                    <span>{request.start_date} to {request.end_date}</span>
                    <span className="request-days">({request.days} {request.days === 1 ? 'day' : 'days'})</span>
                  </div>

                  {request.reason && (
                    <div className="request-reason">{request.reason}</div>
                  )}

                  {request.approved_by && (
                    <div className="request-decided-by">
                      {request.status === 'approved' ? 'Approved' : 'Rejected'} by {request.approved_by}
                    </div>
                  )}

                  {isAdmin && (
                    <div className="request-actions">
                      {request.status === 'pending' && (
                        <>
                          <button
                            className="action-btn approve"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleApprove(request)
                            }}
                          >
                            <Icon name="check" size={18} color="#34c759" />
                            Approve
                          </button>
                          <button
                            className="action-btn reject"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleReject(request)
                            }}
                          >
                            <Icon name="x" size={18} color="#ff3b30" />
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        className="action-btn delete"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(request)
                        }}
                      >
                        <Icon name="trash" size={18} color="#ff3b30" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </MobileCard>
            ))}
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      <button className="floating-add-btn" onClick={handleAddPress}>
        <Icon name="plus" size={24} color="white" />
      </button>

      <style>{`
        /* Presentation only — every handler, query and status value is
           unchanged. The four-across stat grid, the chips and the request
           cards are what dated this screen. */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        .stat-card {
          background: var(--mobile-card);
          border-radius: 12px;
          padding: 12px 6px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
        }

        .stat-value {
          font-size: 20px;
          font-weight: 700;
          color: var(--mobile-text);
          font-variant-numeric: tabular-nums;
          line-height: 1.2;
        }

        .stat-label {
          margin-top: 2px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.03em;
          color: var(--mobile-text-secondary);
        }

        .filter-chips {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 2px;
          -webkit-overflow-scrolling: touch;
        }

        .filter-chip {
          flex: 0 0 auto;
          padding: 8px 16px;
          border-radius: 999px;
          border: 1px solid var(--mobile-border);
          background: var(--mobile-card);
          font-size: 13.5px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          cursor: pointer;
          white-space: nowrap;
        }

        .filter-chip.active {
          background: var(--mobile-accent);
          border-color: var(--mobile-accent);
          color: var(--mobile-on-accent);
        }

        .request-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .request-card { display: block; }

        .request-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .request-type {
          font-size: 16px;
          font-weight: 700;
          color: var(--mobile-text);
          text-transform: capitalize;
        }

        .request-user {
          margin-top: 1px;
          font-size: 13.5px;
          color: var(--mobile-text-secondary);
        }

        .status-badge {
          flex: 0 0 auto;
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: capitalize;
          padding: 4px 10px;
          border-radius: 999px;
        }

        .request-dates {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: 10px;
          font-size: 13.5px;
          color: var(--mobile-text-secondary);
          font-variant-numeric: tabular-nums;
        }

        .request-days { margin-left: auto; }

        .request-reason {
          margin-top: 8px;
          font-size: 13.5px;
          line-height: 1.45;
          color: var(--mobile-text-secondary);
          font-style: italic;
        }

        .request-decided-by {
          margin-top: 8px;
          font-size: 12.5px;
          color: var(--mobile-text-secondary);
          opacity: 0.85;
        }

        .request-actions {
          display: flex;
          gap: 8px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--mobile-border);
        }

        .action-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px;
          border-radius: 10px;
          border: 1px solid var(--mobile-border);
          background: var(--mobile-card);
          font-size: 13.5px;
          font-weight: 600;
          color: var(--mobile-text);
          cursor: pointer;
        }

        .action-btn.approve { border-color: rgba(52, 199, 89, 0.4); color: #1f7a4d; }
        .action-btn.reject  { border-color: rgba(255, 59, 48, 0.35); color: #c0392b; }
        .action-btn.delete  { border-color: rgba(255, 59, 48, 0.3); color: #c0392b; }


        .floating-add-btn {
          position: fixed;
          bottom: 80px;
          right: 20px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: var(--mobile-accent);
          border: none;
          box-shadow: 0 4px 12px rgba(0, 102, 204, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 100;
        }

        .floating-add-btn:active {
          transform: scale(0.95);
        }

        @supports (padding: max(0px)) {
          .floating-add-btn {
            bottom: max(80px, calc(80px + env(safe-area-inset-bottom)));
          }
        }
      `}</style>
    </div>
  )
}
