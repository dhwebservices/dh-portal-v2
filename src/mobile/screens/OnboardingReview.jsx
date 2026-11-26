import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import Icon from '../components/Icon'
import { Chip } from '../components/DH'
import { Screen, Sec, KV, Field, Pills, Pill, Btn, Btns, Empty, Loading } from '../components/UI'

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
      <Screen title="Onboarding" onBack={goBack}>
        <Empty icon="lock" title="You don't have access to review onboarding." />
      </Screen>
    )
  }

  const tone = (st) => (st === 'approved' ? 'green' : st === 'rejected' ? 'red' : st === 'submitted' ? 'amber' : 'neutral')
  const label = (st) => (st === 'submitted' ? 'To review' : st ? st[0].toUpperCase() + st.slice(1) : 'Draft')
  const initials = (r) => (r.user_name || r.user_email || '?').split(/[ @.]/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase()

  if (detail) {
    return (
      <Screen title="Review onboarding" onBack={() => setDetail(null)}>
        <div className="dh-card">
          <div className="dh-row">
            <span className="dh-av round">{initials(detail)}</span>
            <span className="dh-g">
              <span className="dh-t">{detail.user_name || detail.user_email}</span>
              <span className="dh-sub">{detail.submitted_at ? `Submitted ${new Date(detail.submitted_at).toLocaleDateString('en-GB')}` : 'Draft'}</span>
            </span>
            <Chip tone={tone(detail.status)}>{label(detail.status)}</Chip>
          </div>
        </div>

        <Sec>Personal details</Sec>
        <div className="dh-card">
          <KV k="Email" v={detail.user_email} />
          <KV k="Date of birth" v={detail.dob || '—'} />
          <KV k="Phone" v={detail.phone || '—'} />
          <KV k="Personal email" v={detail.personal_email || '—'} />
          <KV k="Address" v={detail.address || '—'} />
        </div>

        <Sec>Emergency contact</Sec>
        <div className="dh-card">
          <KV k="Name" v={detail.emergency_contact || '—'} />
          <KV k="Phone" v={detail.emergency_phone || '—'} />
        </div>

        <Sec>Bank details</Sec>
        <div className="dh-card">
          <KV k="Bank" v={detail.bank_name || '—'} />
          <KV k="Account name" v={detail.account_name || '—'} />
          <KV k="Sort code" v={detail.sort_code || '—'} />
          <KV k="Account number" v={detail.account_number || '—'} />
        </div>

        <Sec>Right to work</Sec>
        <div className="dh-card">
          <KV k="Document" v={detail.rtw_type || '—'} />
          <KV k="Expiry" v={detail.rtw_expiry || '—'} />
          {detail.rtw_doc_url ? (
            <a className="dh-row" href={detail.rtw_doc_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <span className="dh-ic"><Icon name="file" size={18} /></span>
              <span className="dh-g"><span className="dh-t">View uploaded document</span></span>
              <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
            </a>
          ) : (
            <div className="dh-row"><span className="dh-g"><span className="dh-t">Upload</span></span><Chip tone="red">Not uploaded</Chip></div>
          )}
        </div>

        <Sec>Contract</Sec>
        <div className="dh-card">
          <div className="dh-row"><span className="dh-g"><span className="dh-t">Acknowledged</span></span><Chip tone={detail.contract_acknowledged ? 'green' : 'amber'}>{detail.contract_acknowledged ? 'Yes' : 'No'}</Chip></div>
        </div>

        {detail.status === 'submitted' && (
          declining ? (
            <>
              <div className="dh-card">
                <Field label="Decline reason (sent to them)" htmlFor="or-reason">
                  <textarea id="or-reason" rows={4} value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="Explain what needs to be corrected..." />
                </Field>
              </div>
              <Btns>
                <Btn variant="outline" onPress={() => setDeclining(false)}>Cancel</Btn>
                <Btn variant="danger" className="solid" disabled={busy} onPress={() => handleDecline(detail)}>{busy ? 'Declining…' : 'Confirm decline'}</Btn>
              </Btns>
            </>
          ) : (
            <Btns>
              <Btn variant="danger" disabled={busy} onPress={() => setDeclining(true)}>Decline</Btn>
              <Btn disabled={busy} onPress={() => handleApprove(detail)}>Approve</Btn>
            </Btns>
          )
        )}
      </Screen>
    )
  }

  const filtered = submissions.filter(s => filter === 'all' || s.status === filter)

  return (
    <Screen title="Onboarding" onBack={goBack}>
      <Pills>
        {['submitted', 'approved', 'rejected', 'all'].map(f => (
          <Pill key={f} on={filter === f} onPress={() => setFilter(f)}>{f === 'submitted' ? 'To review' : f.charAt(0).toUpperCase() + f.slice(1)}</Pill>
        ))}
      </Pills>

      {loading ? <Loading /> : filtered.length === 0 ? (
        <Empty icon="checkCircle" title={`No ${filter === 'submitted' ? 'forms to review' : filter !== 'all' ? `${filter} forms` : 'onboarding forms'}`} />
      ) : (
        <div className="dh-card">
          {filtered.map(row => (
            <button key={row.id} type="button" className="dh-row" onClick={() => openDetail(row)}>
              <span className="dh-av round">{initials(row)}</span>
              <span className="dh-g">
                <span className="dh-t">{row.user_name || row.user_email}</span>
                <span className="dh-sub">{row.submitted_at ? `Submitted ${new Date(row.submitted_at).toLocaleDateString('en-GB')}` : 'Draft'}</span>
              </span>
              <Chip tone={tone(row.status)}>{label(row.status)}</Chip>
            </button>
          ))}
        </div>
      )}
    </Screen>
  )
}
