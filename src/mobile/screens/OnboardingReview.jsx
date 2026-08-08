import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import Icon from '../components/Icon'
import MobileCard from '../components/MobileCard'
import { SkeletonList } from '../components/SkeletonLoader'

const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'

export default function MobileOnboardingReview({ goBack, navigate, isAdmin }) {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('submitted')
  const [detail, setDetail] = useState(null)
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin])

  const load = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('onboarding_submissions')
        .select('*')
        .order('submitted_at', { ascending: false })

      if (error) throw error
      setSubmissions(data || [])
    } catch (error) {
      console.error('Failed to load onboarding submissions:', error)
    } finally {
      setLoading(false)
    }
  }

  const openDetail = async (row) => {
    await Haptics.impact({ style: ImpactStyle.Light })
    setDetail(row)
    setDeclining(false)
    setDeclineReason('')
  }

  const handleApprove = async (row) => {
    if (!confirm(`Approve onboarding for ${row.user_name}?`)) return
    setBusy(true)
    await Haptics.impact({ style: ImpactStyle.Medium })

    try {
      const { error } = await supabase
        .from('onboarding_submissions')
        .update({
          status: 'approved',
          approved_by: user.name || user.email,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)

      if (error) throw error

      // Release the onboarding gate so they get normal app access
      await supabase
        .from('user_permissions')
        .upsert({
          user_email: row.user_email,
          onboarding: false,
          updated_by: user.email,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_email' })

      await sendManagedNotification({
        userEmail: row.user_email,
        userName: row.user_name,
        title: '✅ Onboarding Approved',
        message: `Your onboarding has been approved by ${user.name || user.email}. Welcome aboard!`,
        link: '/my-profile',
        type: 'success',
        category: 'hr',
        emailSubject: 'Onboarding approved — welcome to DH Website Services',
        emailHtml: `<p>Your onboarding has been approved by ${user.name || user.email}. Welcome to the team!</p>`,
        sentBy: user.name || user.email,
        portalUrl: PORTAL_URL,
      }).catch(() => {})

      await Haptics.notification({ type: NotificationType.Success })
      setDetail(null)
      load()

      if (confirm('Approved. Set up their permissions now?')) {
        navigate('edit-permissions', { staffEmail: row.user_email })
      }
    } catch (error) {
      console.error('Failed to approve onboarding:', error)
      alert('Failed to approve. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const handleDecline = async (row) => {
    if (!declineReason.trim()) {
      alert('Please enter a reason for declining.')
      return
    }
    setBusy(true)
    await Haptics.impact({ style: ImpactStyle.Medium })

    try {
      const { error } = await supabase
        .from('onboarding_submissions')
        .update({
          status: 'rejected',
          declined_by: user.name || user.email,
          declined_at: new Date().toISOString(),
          decline_reason: declineReason.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)

      if (error) throw error

      await sendManagedNotification({
        userEmail: row.user_email,
        userName: row.user_name,
        title: '❌ Onboarding Declined',
        message: `Your onboarding submission was declined by ${user.name || user.email}: ${declineReason.trim()}`,
        link: '/onboarding',
        type: 'warning',
        category: 'hr',
        emailSubject: 'Onboarding submission declined',
        emailHtml: `<p>Your onboarding submission was declined by ${user.name || user.email}.</p><p><strong>Reason:</strong> ${declineReason.trim()}</p><p>Please open the app to update your details and resubmit.</p>`,
        sentBy: user.name || user.email,
        portalUrl: PORTAL_URL,
      }).catch(() => {})

      await Haptics.notification({ type: NotificationType.Success })
      setDetail(null)
      setDeclining(false)
      load()
    } catch (error) {
      console.error('Failed to decline onboarding:', error)
      alert('Failed to decline. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="mobile-screen">
        <div className="mobile-screen-header">
          <button className="mobile-back-btn" onClick={goBack}>
            <Icon name="chevronLeft" size={24} color="#0066cc" />
          </button>
          <h1>Onboarding</h1>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--mobile-text-secondary)' }}>
          You don't have access to review onboarding.
        </div>
      </div>
    )
  }

  if (detail) {
    return (
      <div className="mobile-screen">
        <div className="mobile-screen-header">
          <button className="mobile-back-btn" onClick={() => setDetail(null)}>
            <Icon name="chevronLeft" size={24} color="#0066cc" />
          </button>
          <h1>Review</h1>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ padding: 20, paddingBottom: 100 }}>
          <MobileCard>
            <h3 className="review-name">{detail.user_name || detail.user_email}</h3>
            <div className="review-row"><span>Email</span><span>{detail.user_email}</span></div>
            <div className="review-row"><span>DOB</span><span>{detail.dob || '—'}</span></div>
            <div className="review-row"><span>Phone</span><span>{detail.phone || '—'}</span></div>
            <div className="review-row"><span>Personal Email</span><span>{detail.personal_email || '—'}</span></div>
            <div className="review-row"><span>Address</span><span>{detail.address || '—'}</span></div>
          </MobileCard>

          <MobileCard style={{ marginTop: 16 }}>
            <h3 className="review-section">Emergency Contact</h3>
            <div className="review-row"><span>Name</span><span>{detail.emergency_contact || '—'}</span></div>
            <div className="review-row"><span>Phone</span><span>{detail.emergency_phone || '—'}</span></div>
          </MobileCard>

          <MobileCard style={{ marginTop: 16 }}>
            <h3 className="review-section">Bank Details</h3>
            <div className="review-row"><span>Bank</span><span>{detail.bank_name || '—'}</span></div>
            <div className="review-row"><span>Account Name</span><span>{detail.account_name || '—'}</span></div>
            <div className="review-row"><span>Sort Code</span><span>{detail.sort_code || '—'}</span></div>
            <div className="review-row"><span>Account No.</span><span>{detail.account_number || '—'}</span></div>
          </MobileCard>

          <MobileCard style={{ marginTop: 16 }}>
            <h3 className="review-section">Right to Work</h3>
            <div className="review-row"><span>Document</span><span>{detail.rtw_type || '—'}</span></div>
            <div className="review-row"><span>Expiry</span><span>{detail.rtw_expiry || '—'}</span></div>
            {detail.rtw_doc_url ? (
              <a className="rtw-view-link" href={detail.rtw_doc_url} target="_blank" rel="noreferrer">
                📄 View uploaded document
              </a>
            ) : (
              <div className="review-row"><span>Document</span><span>Not uploaded</span></div>
            )}
          </MobileCard>

          <MobileCard style={{ marginTop: 16 }}>
            <h3 className="review-section">Contract</h3>
            <div className="review-row"><span>Acknowledged</span><span>{detail.contract_acknowledged ? 'Yes' : 'No'}</span></div>
          </MobileCard>

          {detail.status === 'submitted' && (
            <>
              {declining ? (
                <MobileCard style={{ marginTop: 16 }}>
                  <h3 className="review-section">Decline Reason</h3>
                  <textarea
                    className="decline-textarea"
                    rows={4}
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    placeholder="Explain what needs to be corrected..."
                  />
                  <div className="review-actions">
                    <button className="action-btn cancel" onClick={() => setDeclining(false)}>Cancel</button>
                    <button className="action-btn reject" disabled={busy} onClick={() => handleDecline(detail)}>
                      {busy ? 'Declining...' : 'Confirm Decline'}
                    </button>
                  </div>
                </MobileCard>
              ) : (
                <div className="review-actions" style={{ marginTop: 20 }}>
                  <button className="action-btn approve" disabled={busy} onClick={() => handleApprove(detail)}>
                    <Icon name="check" size={18} color="#34c759" />
                    Approve
                  </button>
                  <button className="action-btn reject" disabled={busy} onClick={() => setDeclining(true)}>
                    <Icon name="x" size={18} color="#ff3b30" />
                    Decline
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {reviewStyles}
      </div>
    )
  }

  const filtered = submissions.filter(s => filter === 'all' || s.status === filter)

  return (
    <div className="mobile-screen">
      <div className="mobile-screen-header">
        <button className="mobile-back-btn" onClick={goBack}>
          <Icon name="chevronLeft" size={24} color="#0066cc" />
        </button>
        <h1>Onboarding</h1>
        <div style={{ width: 60 }} />
      </div>

      <div className="filter-row">
        {['submitted', 'approved', 'rejected', 'all'].map(f => (
          <button
            key={f}
            className={`filter-chip ${filter === f ? 'active' : ''}`}
            onClick={async () => { await Haptics.impact({ style: ImpactStyle.Light }); setFilter(f) }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 20px 100px' }}>
        {loading ? (
          <SkeletonList count={4} lines={3} />
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--mobile-text-secondary)' }}>
            No {filter !== 'all' ? filter : ''} onboarding submissions
          </div>
        ) : (
          filtered.map(row => (
            <MobileCard key={row.id} onPress={() => openDetail(row)} style={{ marginBottom: 12 }}>
              <div className="list-row">
                <div>
                  <div className="list-name">{row.user_name || row.user_email}</div>
                  <div className="list-sub">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString('en-GB') : 'Draft'}</div>
                </div>
                <span className={`status-badge ${row.status}`}>{row.status}</span>
              </div>
            </MobileCard>
          ))
        )}
      </div>

      {reviewStyles}
    </div>
  )
}

const reviewStyles = (
  <style>{`
    .filter-row {
      display: flex;
      gap: 8px;
      padding: 16px 20px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .filter-chip {
      padding: 8px 16px;
      background: var(--mobile-card);
      border: 1px solid var(--mobile-border);
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      color: var(--mobile-text);
      white-space: nowrap;
      cursor: pointer;
    }

    .filter-chip.active {
      background: #0066cc;
      color: white;
      border-color: #0066cc;
    }

    .list-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .list-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--mobile-text);
    }

    .list-sub {
      font-size: 13px;
      color: var(--mobile-text-secondary);
      margin-top: 2px;
    }

    .status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: capitalize;
    }

    .status-badge.submitted { background: rgba(255,149,0,0.15); color: #ff9500; }
    .status-badge.approved { background: rgba(52,199,89,0.15); color: #34c759; }
    .status-badge.rejected { background: rgba(255,59,48,0.15); color: #ff3b30; }

    .review-name {
      font-size: 18px;
      font-weight: 700;
      color: var(--mobile-text);
      margin: 0 0 12px 0;
    }

    .review-section {
      font-size: 15px;
      font-weight: 600;
      color: var(--mobile-text);
      margin: 0 0 12px 0;
    }

    .review-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--mobile-border);
      font-size: 14px;
    }

    .review-row:last-child {
      border-bottom: none;
    }

    .review-row span:first-child {
      color: var(--mobile-text-secondary);
    }

    .review-row span:last-child {
      color: var(--mobile-text);
      font-weight: 500;
      text-align: right;
    }

    .rtw-view-link {
      display: block;
      margin-top: 8px;
      color: #0066cc;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
    }

    .decline-textarea {
      width: 100%;
      padding: 12px;
      font-size: 15px;
      border: 1px solid var(--mobile-border);
      border-radius: 8px;
      background: var(--mobile-bg);
      color: var(--mobile-text);
      font-family: inherit;
      resize: vertical;
    }

    .review-actions {
      display: flex;
      gap: 12px;
      margin-top: 12px;
    }

    .action-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 12px;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--mobile-border);
      background: var(--mobile-card);
      color: var(--mobile-text);
    }

    .action-btn.approve {
      color: #34c759;
      border-color: #34c759;
    }

    .action-btn.reject {
      color: #ff3b30;
      border-color: #ff3b30;
    }

    .action-btn:disabled {
      opacity: 0.6;
    }
  `}</style>
)
