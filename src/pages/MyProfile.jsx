import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Eye, EyeOff, FileText, Download } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'

const INP = {
  width: '100%', padding: '10px 14px', borderRadius: '6px', fontSize: '14px',
  background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text)',
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
}
const LBL = {
  display: 'block', fontFamily: 'var(--font-mono)', fontSize: '10px',
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: '6px',
}

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px', marginBottom: '16px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid var(--border)' }}>{title}</h2>
      {children}
  )
}

export default function MyProfile() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [payslips, setPayslips] = useState([])
  const [policies, setPolicies] = useState([])
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showBank, setShowBank] = useState(false)
  const [form, setForm] = useState({ phone: '', personal_email: '', address: '' })
  const u = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!user?.email) return
    const load = async () => {
      const email = user.email.toLowerCase()
      const { data: allProfiles } = await supabase.from('hr_profiles').select('*')
      const p = (allProfiles || []).find(r => r.user_email?.toLowerCase() === email)
      setProfile(p || null)
      if (p) setForm({ phone: p.phone || '', personal_email: p.personal_email || '', address: p.address || '' })

      const { data: allPayslips } = await supabase.from('payslips').select('*')
      setPayslips((allPayslips || []).filter(r => r.user_email?.toLowerCase() === email).sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)))

      const { data: allPolicies } = await supabase.from('hr_policies').select('*')
      setPolicies(allPolicies || [])

      setLoading(false)
    }
    load()
  }, [user])

  const save = async () => {
    setSaving(true)
    if (profile?.id) {
      await supabase.from('hr_profiles').update({ phone: form.phone, personal_email: form.personal_email, address: form.address, updated_at: new Date().toISOString() }).eq('id', profile.id)
      setProfile(p => ({ ...p, ...form }))
    }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const acknowledgePolicy = async (policyId) => {
    await supabase.from('policy_acknowledgements').insert([{
      policy_id: policyId, user_email: user.email.toLowerCase(),
      user_name: user.name, acknowledged_at: new Date().toISOString(),
    }])
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
      <div style={{ width: 28, height: 28, border: '2px solid var(--border2)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div className="fade-in" style={{ maxWidth: '900px' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <button onClick={() => navigate(-1)} style={{ width: 34, height: 34, borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--sub)', transition: 'all 0.15s' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)' }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--sub)' }}
        ><ArrowLeft size={15} /></button>

        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--gold-light)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--gold)' }}>
          {user?.name?.[0]?.toUpperCase() || 'U'}
        </div>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 600, letterSpacing: '-0.01em' }}>{user?.name}</h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--faint)', letterSpacing: '0.06em' }}>{profile?.role || 'Staff'} {profile?.department ? `· ${profile.department}` : ''}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div>
          {/* My Details — editable */}
          <Section title="My Details">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={LBL}>Full Name</label>
                <div style={{ ...INP, background: 'var(--bg3)', color: 'var(--sub)', cursor: 'not-allowed' }}>{profile?.full_name || user?.name || '—'}</div>
              </div>
              <div>
                <label style={LBL}>Work Email</label>
                <div style={{ ...INP, background: 'var(--bg3)', color: 'var(--sub)', cursor: 'not-allowed', fontSize: '13px' }}>{user?.email}</div>
              </div>
              <div>
                <label style={LBL}>Phone</label>
                <input value={form.phone} onChange={e => u('phone', e.target.value)} style={INP} placeholder="Your phone number"
                  onFocus={e => e.target.style.borderColor = 'var(--gold)'} onBlur={e => e.target.style.borderColor = 'var(--border2)'} />
              </div>
              <div>
                <label style={LBL}>Personal Email</label>
                <input value={form.personal_email} onChange={e => u('personal_email', e.target.value)} style={INP} placeholder="personal@email.com"
                  onFocus={e => e.target.style.borderColor = 'var(--gold)'} onBlur={e => e.target.style.borderColor = 'var(--border2)'} />
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={LBL}>Address</label>
              <textarea value={form.address} onChange={e => u('address', e.target.value)} rows={2} style={{ ...INP, resize: 'vertical' }} placeholder="Your home address"
                onFocus={e => e.target.style.borderColor = 'var(--gold)'} onBlur={e => e.target.style.borderColor = 'var(--border2)'} />
            </div>

            {/* Read-only employment fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '14px', background: 'var(--bg2)', borderRadius: '8px', marginBottom: '16px' }}>
              {[
                { label: 'Start Date', val: profile?.start_date ? new Date(profile.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                { label: 'Contract Type', val: profile?.contract_type || '—' },
                { label: 'Manager', val: profile?.manager_name || '—' },
                { label: 'Department', val: profile?.department || '—' },
              ].map(f => (
                <div key={f.label}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: '3px' }}>{f.label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{f.val}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
              {saved && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--green)', letterSpacing: '0.04em' }}>Saved</span>}
              <button onClick={save} disabled={saving} style={{
                padding: '9px 20px', borderRadius: '6px', border: 'none', fontSize: '13.5px', fontWeight: 600,
                background: 'var(--charcoal)', color: '#FAF8F4', cursor: saving ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '7px', transition: 'all 0.2s', opacity: saving ? 0.7 : 1,
              }}
                onMouseOver={e => { if (!saving) { e.currentTarget.style.background = 'var(--gold)'; e.currentTarget.style.color = '#1A1612' } }}
                onMouseOut={e => { e.currentTarget.style.background = 'var(--charcoal)'; e.currentTarget.style.color = '#FAF8F4' }}
              ><Save size={13} />{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </Section>

          {/* Bank details — view only */}
          <Section title="Bank Details">
            <div style={{ padding: '12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '13px', color: 'var(--sub)', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>These details can only be updated by your manager</span>
              <button onClick={() => setShowBank(b => !b)} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600 }}>
                {showBank ? <><EyeOff size={12} /> Hide</> : <><Eye size={12} /> Reveal</>}
              </button>
            </div>
            {showBank ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {[
                  { label: 'Bank Name', val: profile?.bank_name || '—' },
                  { label: 'Account Name', val: profile?.account_name || '—' },
                  { label: 'Sort Code', val: profile?.sort_code || '—' },
                  { label: 'Account Number', val: profile?.account_number ? '••••' + profile.account_number.slice(-4) : '—' },
                ].map(f => (
                  <div key={f.label} style={{ padding: '10px 14px', background: 'var(--bg2)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: '4px' }}>{f.label}</div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{f.val}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--faint)', fontSize: '13px' }}>Click reveal to view bank details</div>
            )}
          </Section>
        </div>

        <div>
          {/* Payslips */}
          <Section title="My Payslips">
            {payslips.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--faint)', fontSize: '13px' }}>No payslips uploaded yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {payslips.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '7px' }}>
                    <FileText size={15} color="var(--gold)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{p.period}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--faint)', letterSpacing: '0.04em' }}>{new Date(p.uploaded_at).toLocaleDateString('en-GB')}</div>
                    </div>
                    <a href={p.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: 'var(--gold)', transition: 'color 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.color = 'var(--text)'}
                      onMouseOut={e => e.currentTarget.style.color = 'var(--gold)'}
                    ><Download size={12} /> View</a>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Policies */}
          <Section title="Company Policies">
            {policies.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--faint)', fontSize: '13px' }}>No policies uploaded yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {policies.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '7px' }}>
                    <FileText size={15} color="var(--sub)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 600 }}>{p.title}</div>
                      {p.description && <div style={{ fontSize: '12px', color: 'var(--sub)', marginTop: '2px' }}>{p.description}</div>}
                    </div>
                    <a href={p.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: 'var(--sub)', transition: 'color 0.15s', marginRight: '6px' }}>View</a>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Contract */}
          {profile?.contract_url && (
            <Section title="My Contract">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '7px' }}>
                <FileText size={16} color="var(--gold)" />
                <span style={{ flex: 1, fontSize: '13.5px', fontWeight: 600 }}>Employment Contract</span>
                <a href={profile.contract_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 600, color: 'var(--gold)' }}>
                  <Download size={13} /> View Contract
                </a>
              </div>
              <div style={{ marginTop: '10px', padding: '10px 14px', background: 'var(--bg3)', borderRadius: '6px', fontSize: '12.5px', color: 'var(--faint)' }}>
                Contract documents can only be updated by your manager
              </div>
            </Section>
          )}
        </div>
      </div>
  )
}
