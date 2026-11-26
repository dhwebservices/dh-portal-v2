import { useState, useEffect } from 'react'
import { Haptics, NotificationType } from '@capacitor/haptics'
import Icon from '../components/Icon'
import { Screen, HeaderButton, Sec, Field, ToggleRow, Btn, Loading } from '../components/UI'
import { supabase } from '../../utils/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { sendManagedNotification } from '../../utils/notificationPreferences'
import { STARTER_PERMISSION_DEFAULTS } from '../../utils/permissionCatalog'

const PORTAL_URL = 'https://staff.dhwebsiteservices.co.uk'

export default function MobileEditStaffProfile({ goBack, navigate, staffEmail }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState({})
  const [onboardingMode, setOnboardingMode] = useState(false)
  const [initialOnboardingMode, setInitialOnboardingMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [departments, setDepartments] = useState([])
  const [managers, setManagers] = useState([])

  useEffect(() => {
    loadProfile()
    loadDepartments()
    loadManagers()
  }, [staffEmail])

  const loadProfile = async () => {
    try {
      const [{ data, error }, { data: permRow }] = await Promise.all([
        supabase.from('hr_profiles').select('*').eq('user_email', staffEmail).single(),
        supabase.from('user_permissions').select('onboarding').ilike('user_email', staffEmail).maybeSingle(),
      ])

      if (error) throw error
      setProfile(data || {})
      setOnboardingMode(!!permRow?.onboarding)
      setInitialOnboardingMode(!!permRow?.onboarding)
    } catch (error) {
      console.error('Failed to load profile:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadDepartments = async () => {
    try {
      const { data } = await supabase
        .from('hr_profiles')
        .select('department')

      const depts = [...new Set(data.map(d => d.department).filter(Boolean))]
      setDepartments(depts.sort())
    } catch (error) {
      console.error('Failed to load departments:', error)
    }
  }

  const loadManagers = async () => {
    try {
      const { data } = await supabase
        .from('hr_profiles')
        .select('user_email, full_name')
        .order('full_name')

      setManagers(data || [])
    } catch (error) {
      console.error('Failed to load managers:', error)
    }
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      // Update HR profile - explicit whitelist, not a spread of the whole
      // form state: this form also collects payment_type/hourly_rate/
      // commission_rate for the separate `staff` table below, and those
      // aren't real columns on hr_profiles, so spreading the raw object in
      // would make PostgREST reject the whole upsert with an unknown-column
      // error the moment a user touched the Payment Settings section.
      const hrProfilePayload = {
        id: profile.id,
        user_email: profile.user_email,
        full_name: profile.full_name,
        phone: profile.phone,
        personal_email: profile.personal_email,
        address: profile.address,
        department: profile.department,
        role: profile.role,
        contract_type: profile.contract_type,
        start_date: profile.start_date,
        manager_email: profile.manager_email,
        manager_name: profile.manager_name,
        bank_name: profile.bank_name,
        account_name: profile.account_name,
        sort_code: profile.sort_code,
        account_number: profile.account_number,
        updated_at: new Date().toISOString(),
      }

      const { error: hrError } = await supabase
        .from('hr_profiles')
        .upsert(hrProfilePayload)

      if (hrError) throw hrError

      // Update staff table with payment settings
      const { error: staffError } = await supabase
        .from('staff')
        .upsert({
          email: profile.user_email,
          name: profile.full_name || profile.user_name,
          role: profile.role,
          hourly_rate: profile.hourly_rate || 0,
          payment_type: profile.payment_type || 'commission_only',
          commission_rate: profile.commission_rate || 10,
        }, {
          onConflict: 'email'
        })

      if (staffError) throw staffError

      // Onboarding mode toggle. When onboarding is newly switched on, also
      // grant the same base starter permissions web grants at creation time
      // (STARTER_PERMISSION_DEFAULTS) - without this, once their submission
      // is approved and the onboarding gate lifts, they'd be left with zero
      // permissions and see a completely empty app.
      const permPayload = {
        user_email: staffEmail.toLowerCase().trim(),
        onboarding: onboardingMode,
        updated_by: user?.email || null,
        updated_at: new Date().toISOString(),
      }
      if (onboardingMode && !initialOnboardingMode) {
        permPayload.permissions = { ...STARTER_PERMISSION_DEFAULTS }
      }

      const { error: permError } = await supabase
        .from('user_permissions')
        .upsert(permPayload, { onConflict: 'user_email' })

      if (permError) throw permError

      if (onboardingMode && !initialOnboardingMode) {
        await sendManagedNotification({
          userEmail: staffEmail,
          userName: profile.full_name || staffEmail,
          title: '👋 Complete your onboarding',
          message: 'Your onboarding has been started. Please complete your details, right-to-work document, and contract in the app.',
          link: '/onboarding',
          type: 'info',
          category: 'hr',
          emailSubject: 'Please complete your onboarding — DH Website Services',
          emailHtml: `<p>Hi ${(profile.full_name || staffEmail).split(' ')[0]},</p><p>Your onboarding has been started. Please open the app and complete your details, right-to-work document, and contract.</p>`,
          sentBy: user?.name || user?.email,
          portalUrl: PORTAL_URL,
        }).catch(() => {})
      }

      await Haptics.notification({ type: NotificationType.Success })
      goBack()

    } catch (error) {
      console.error('Failed to save profile:', error)
      await Haptics.notification({ type: NotificationType.Error })
      alert('Failed to save profile: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const updateField = (field, value) => {
    setProfile({ ...profile, [field]: value })
  }

  if (loading) {
    return <Screen title="Edit profile" onBack={goBack}><Loading /></Screen>
  }

  return (
    <Screen
      title="Edit profile"
      onBack={goBack}
      action={<HeaderButton onPress={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</HeaderButton>}
    >
        <Sec>Personal info</Sec>
        <div className="dh-card">

          <Field label="Full name">
            <input
              value={profile.full_name || ''}
              onChange={(e) => updateField('full_name', e.target.value)}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={profile.user_email || ''}
              onChange={(e) => updateField('user_email', e.target.value)}
            />
          </Field>

          <Field label="Phone">
            <input
              type="tel"
              value={profile.phone || ''}
              onChange={(e) => updateField('phone', e.target.value)}
            />
          </Field>

          <Field label="Personal email">
            <input
              type="email"
              value={profile.personal_email || ''}
              onChange={(e) => updateField('personal_email', e.target.value)}
            />
          </Field>

          <Field label="Address">
            <textarea
              rows={3}
              value={profile.address || ''}
              onChange={(e) => updateField('address', e.target.value)}
            />
          </Field>
        </div>

        {/* Employment */}
        <Sec>Employment</Sec>
        <div className="dh-card">

          <Field label="Department">
            <select
              value={profile.department || ''}
              onChange={(e) => updateField('department', e.target.value)}
            >
              <option value="">Select department...</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
              <option value="__new__">+ Add New Department</option>
            </select>
          </Field>

          <Field label="Role">
            <input
              value={profile.role || ''}
              onChange={(e) => updateField('role', e.target.value)}
            />
          </Field>

          <Field label="Contract type">
            <select
              value={profile.contract_type || ''}
              onChange={(e) => updateField('contract_type', e.target.value)}
            >
              <option value="">Select...</option>
              <option value="Full-time">Full-time</option>
              <option value="Part-time">Part-time</option>
              <option value="Contract">Contract</option>
              <option value="Freelance">Freelance</option>
            </select>
          </Field>

          <Field label="Start date">
            <input
              type="date"
              value={profile.start_date || ''}
              onChange={(e) => updateField('start_date', e.target.value)}
            />
          </Field>

          <Field label="Manager">
            <select
              value={profile.manager_email || ''}
              onChange={(e) => {
                const manager = managers.find(m => m.user_email === e.target.value)
                updateField('manager_email', e.target.value)
                updateField('manager_name', manager?.full_name || '')
              }}
            >
              <option value="">Select manager...</option>
              {managers.map(mgr => (
                <option key={mgr.user_email} value={mgr.user_email}>
                  {mgr.full_name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Onboarding */}
        <Sec>Onboarding</Sec>
        <div className="dh-card">
          <ToggleRow
            title="Ask them to onboard"
            sub={onboardingMode
              ? 'This staff member will see the onboarding form when they open the app.'
              : 'Turn on to have this staff member complete onboarding in the app.'}
            on={onboardingMode}
            onChange={() => setOnboardingMode(!onboardingMode)}
          />
          {profile.contract_url && (
            <a className="dh-row" href={profile.contract_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <span className="dh-ic"><Icon name="file" size={18} /></span>
              <span className="dh-g"><span className="dh-t">View issued contract</span></span>
            </a>
          )}
        </div>

        {/* Payment Settings */}
        <Sec>Pay</Sec>
        <div className="dh-card">

          <Field label="Payment type">
            <select
              value={profile.payment_type || 'commission_only'}
              onChange={(e) => updateField('payment_type', e.target.value)}
            >
              <option value="commission_only">Commission Only</option>
              <option value="hourly">Hourly Pay</option>
              <option value="both">Hourly + Commission</option>
            </select>
          </Field>

          {/* Always shown, not only for hourly payment types.
              The rate now drives what the rota says a day costs and what a
              shift is estimated to pay, and those are useful for somebody on
              commission too. Hiding it behind the payment type is why every
              rate was 0 and the cost summary read £0.00. */}
          <Field label="Hourly rate (£/hour)" hint="Used for rota costs and the estimated pay shown against each shift.">
            <input
              type="number"
              step="0.01"
              min="0"
              value={profile.hourly_rate || ''}
              onChange={(e) => updateField('hourly_rate', parseFloat(e.target.value) || 0)}
              placeholder="0.00"
            />
          </Field>

          <Field label="Commission rate (%)">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={profile.commission_rate || 10}
              onChange={(e) => updateField('commission_rate', parseFloat(e.target.value) || 10)}
            />
          </Field>
        </div>

        {/* Banking */}
        <Sec>Banking</Sec>
        <div className="dh-card">

          <Field label="Bank name">
            <input
              value={profile.bank_name || ''}
              onChange={(e) => updateField('bank_name', e.target.value)}
            />
          </Field>

          <Field label="Account name">
            <input
              value={profile.account_name || ''}
              onChange={(e) => updateField('account_name', e.target.value)}
            />
          </Field>

          <Field label="Sort code">
            <input
              value={profile.sort_code || ''}
              onChange={(e) => updateField('sort_code', e.target.value)}
              placeholder="12-34-56"
            />
          </Field>

          <Field label="Account number">
            <input
              value={profile.account_number || ''}
              onChange={(e) => updateField('account_number', e.target.value)}
              placeholder="12345678"
            />
          </Field>
        </div>

        {/* Save Button */}
        <Btn onPress={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Btn>
    </Screen>
  )
}
