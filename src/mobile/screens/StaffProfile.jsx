import { useState, useEffect } from 'react'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Browser } from '@capacitor/browser'
import { Chip } from '../components/DH'
import { Screen, Card, Sec, KV, Btn, Btns, Note, Empty, Loading } from '../components/UI'
import Icon from '../components/Icon'
import { supabase } from '../../utils/supabase'

export default function MobileStaffProfile({ goBack, navigate, user, isAdmin, staffEmail }) {
  const [profile, setProfile] = useState(null)
  const [payment, setPayment] = useState(null)
  const [onboarding, setOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [staffEmail])

  const loadProfile = async () => {
    try {
      const [{ data, error }, { data: permRow }, { data: staffRow }] = await Promise.all([
        supabase.from('hr_profiles').select('*').eq('user_email', staffEmail).single(),
        supabase.from('user_permissions').select('onboarding').ilike('user_email', staffEmail).maybeSingle(),
        isAdmin
          ? supabase.from('staff').select('hourly_rate, payment_type, commission_rate').eq('email', staffEmail).maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      if (error) throw error
      setProfile(data)
      setOnboarding(!!permRow?.onboarding)
      setPayment(staffRow)
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }


  if (loading) {
    return <Screen title="Staff" onBack={goBack}><Loading /></Screen>
  }

  if (!profile) {
    return <Screen title="Staff" onBack={goBack}><Empty icon="user" title="Profile not found" /></Screen>
  }

  const initials = (profile.full_name || profile.user_email || '?').split(/[ @.]/).filter(Boolean).map(x => x[0]).join('').slice(0, 2).toUpperCase()
  const date = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
  const paymentTypeLabel = { commission_only: 'Commission only', hourly: 'Hourly pay', both: 'Hourly + commission' }

  return (
    <Screen title={profile.full_name || 'Staff'} onBack={goBack}>
      <Card pad className="sp-head">
        <span className="dh-av round sp-av">{initials}</span>
        <span className="dh-h2" style={{ fontSize: 20 }}>{profile.full_name}</span>
        <span className="dh-sub">
          {profile.role || 'Staff member'}
          {profile.department ? ` · ${profile.department}` : ''}
          {profile.manager_name ? ` · reports to ${profile.manager_name}` : ''}
        </span>
        <Btns>
          <Btn small variant="outline" className="sp-btn" onPress={() => navigate('edit-staff', { staffEmail })}>Edit profile</Btn>
          <Btn small variant="outline" className="sp-btn" onPress={() => navigate('edit-permissions', { staffEmail: profile.user_email })}>Permissions</Btn>
        </Btns>
      </Card>

      <Sec>Employment</Sec>
      <div className="dh-card">
        <KV k="Email" v={profile.user_email} />
        <KV k="Role" v={profile.role} />
        <KV k="Department" v={profile.department} />
        <KV k="Manager" v={profile.manager_name} sub={profile.manager_email} />
        <KV k="Contract" v={profile.contract_type} />
        <KV k="Start date" v={date(profile.start_date)} />
        {isAdmin && payment && (
          <>
            <KV k="Payment" v={paymentTypeLabel[payment.payment_type] || '—'} />
            {(payment.payment_type === 'hourly' || payment.payment_type === 'both') && (
              <KV k="Hourly rate" v={payment.hourly_rate ? `£${Number(payment.hourly_rate).toFixed(2)}` : '—'} />
            )}
            <KV k="Commission rate" v={payment.commission_rate != null ? `${payment.commission_rate}%` : '—'} />
          </>
        )}
      </div>
      {isAdmin && payment && <span className="dh-sub">To change payment details, edit this staff member's profile.</span>}

      <Sec>Personal details</Sec>
      <div className="dh-card">
        <KV k="Phone" v={profile.phone} />
        <KV k="Personal email" v={profile.personal_email} />
        <KV k="Address" v={profile.address} />
      </div>

      <BankDetails profile={profile} />

      <DocumentsTab profile={profile} isAdmin={isAdmin} staffEmail={staffEmail} adminUser={user} onUpdated={loadProfile} />

      {isAdmin && (
        <>
          <Sec>Onboarding</Sec>
          <div className="dh-card">
            <div className="dh-row">
              <span className="dh-g">
                <span className="dh-t">{onboarding ? 'Onboarding in progress' : 'Not in onboarding'}</span>
                <span className="dh-sub">
                  {onboarding
                    ? 'This staff member currently only sees the onboarding form when they open the app.'
                    : 'Turn on onboarding mode to have this staff member complete their details, right-to-work document, and contract sign-off in the app.'}
                </span>
              </span>
              <Chip tone={onboarding ? 'amber' : 'green'}>{onboarding ? 'Onboarding' : 'Onboarded'}</Chip>
            </div>
            <div style={{ padding: '4px 16px 16px' }}>
              <Btn variant="outline" onPress={() => navigate('edit-staff', { staffEmail })}>{onboarding ? 'Manage onboarding' : 'Start onboarding'}</Btn>
            </div>
          </div>
        </>
      )}

      <style>{`
        .sp-head { align-items: center; text-align: center; }
        .sp-av { width: 72px; height: 72px; border-radius: 36px; font-size: 24px; background: #FFE6CC; color: #8A4A00; }
        .sp-head .dh-btns { width: 100%; }
        .sp-btn { width: 100%; height: 42px; }
      `}</style>
    </Screen>
  )
}

function BankDetails({ profile }) {
  const [shown, setShown] = useState(false)
  const hasAny = profile.bank_name || profile.account_name || profile.sort_code || profile.account_number
  return (
    <>
      <Sec action={hasAny ? (shown ? 'Hide' : 'Show') : null} onAction={() => setShown(v => !v)}>Bank details</Sec>
      <div className="dh-card">
        {!shown && hasAny ? (
          <div className="dh-row"><span className="dh-g"><span className="dh-sub">Hidden until you tap Show.</span></span></div>
        ) : (
          <>
            <KV k="Bank" v={profile.bank_name} />
            <KV k="Account name" v={profile.account_name} />
            <KV k="Sort code" v={profile.sort_code} />
            <KV k="Account number" v={profile.account_number ? '****' + profile.account_number.slice(-4) : '—'} />
          </>
        )}
      </div>
    </>
  )
}

function DocumentsTab({ profile, isAdmin, staffEmail, adminUser, onUpdated }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')
    try {
      const path = `contracts/${staffEmail.toLowerCase()}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('hr-documents').upload(path, file)
      if (uploadError) throw uploadError

      const { data: publicData } = supabase.storage.from('hr-documents').getPublicUrl(path)

      const { error: updateError } = await supabase
        .from('hr_profiles')
        .update({
          contract_url: publicData.publicUrl,
          contract_path: path,
          updated_at: new Date().toISOString(),
        })
        .eq('user_email', staffEmail)

      if (updateError) throw updateError

      await Haptics.notification({ type: NotificationType.Success })
      onUpdated?.()
    } catch (err) {
      console.error('Failed to upload contract:', err)
      setError(err.message || 'Failed to upload contract. Please try again.')
      await Haptics.notification({ type: NotificationType.Error })
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Sec>Contract</Sec>
      <Note tone="error">{error}</Note>
      <div className="dh-card">
        {profile.contract_url ? (
          <button type="button" className="dh-row" onClick={() => Browser.open({ url: profile.contract_url })}>
            <span className="dh-ic"><Icon name="file" size={18} /></span>
            <span className="dh-g"><span className="dh-t">View contract</span></span>
            <span className="dh-chev"><Icon name="chevron-right" size={18} /></span>
          </button>
        ) : (
          <div className="dh-row"><span className="dh-g"><span className="dh-sub">No contract uploaded</span></span></div>
        )}
        {isAdmin && (
          <label className="dh-row" style={{ cursor: uploading ? 'default' : 'pointer' }}>
            <input type="file" accept="application/pdf,image/*" onChange={handleFileChange} hidden disabled={uploading} />
            <span className="dh-ic"><Icon name="download" size={18} /></span>
            <span className="dh-g"><span className="dh-t" style={{ color: 'var(--mobile-accent)' }}>{uploading ? 'Uploading…' : profile.contract_url ? 'Replace contract' : 'Issue contract'}</span><span className="dh-sub">PDF or image</span></span>
          </label>
        )}
      </div>
    </>
  )
}
