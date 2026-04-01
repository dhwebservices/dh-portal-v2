import { useState, useEffect } from 'react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import { mergeHrProfileWithOnboarding, syncOnboardingSubmissionToHrProfile } from '../utils/hrProfileSync'

export default function MyProfile() {
  const { user } = useAuth()
  const normalizedEmail = user?.email?.toLowerCase?.() || ''
  const [profile, setProfile]   = useState({})
  const [profileId, setProfileId] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [tab, setTab]           = useState('info')
  const [docs, setDocs]         = useState([])
  const [payslips, setPayslips] = useState([])

  // All editable fields staff can update themselves
  const [form, setForm] = useState({
    phone: '', personal_email: '', location: '', bio: '', skills: '',
  })
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!normalizedEmail) return
    Promise.all([
      supabase.from('hr_profiles').select('*').ilike('user_email', normalizedEmail).maybeSingle(),
      supabase.from('onboarding_submissions').select('*').ilike('user_email', normalizedEmail).maybeSingle(),
      supabase.from('staff_documents').select('*').ilike('staff_email', normalizedEmail).order('created_at', { ascending:false }),
      supabase.from('payslips').select('*').ilike('user_email', normalizedEmail).order('created_at', { ascending:false }),
    ]).then(([{ data: p }, { data: onboarding }, { data: d }, { data: ps }]) => {
      const mergedProfile = mergeHrProfileWithOnboarding(p || {}, onboarding)
      if (p || onboarding) {
        setProfile(mergedProfile); setProfileId(p?.id || null)
        // Load ALL fields from the hr_profile row into form
        setForm({
          phone:          mergedProfile.phone          || '',
          personal_email: mergedProfile.personal_email || '',
          location:       mergedProfile.location       || '',
          bio:            mergedProfile.bio            || '',
          skills:         mergedProfile.skills         || '',
        })
        if (onboarding) {
          syncOnboardingSubmissionToHrProfile(onboarding).catch(() => {})
        }
      }
      setDocs(d || [])
      setPayslips(ps || [])
      setLoading(false)
    })
  }, [normalizedEmail])

  const save = async () => {
    setSaving(true)
    const payload = {
      user_email:     normalizedEmail,
      user_name:      user.name,
      phone:          form.phone,
      personal_email: form.personal_email,
      location:       form.location,
      bio:            form.bio,
      skills:         form.skills,
      updated_at:     new Date().toISOString(),
    }
    if (profileId) {
      await supabase.from('hr_profiles').update(payload).eq('id', profileId)
    } else {
      const { data: existing } = await supabase.from('hr_profiles').select('id').ilike('user_email', normalizedEmail).maybeSingle()
      let inserted = existing
      if (existing?.id) {
        await supabase.from('hr_profiles').update(payload).eq('id', existing.id)
      } else {
        const insertRes = await supabase.from('hr_profiles').insert([payload]).select().maybeSingle()
        inserted = insertRes.data
      }
      if (inserted?.id) setProfileId(inserted.id)
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>

  return (
    <div className="fade-in">
      {/* Hero */}
      <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:28, padding:'24px', background:'var(--card)', borderRadius:14, border:'1px solid var(--border)' }}>
        <div style={{ width:64, height:64, borderRadius:'50%', background:'var(--accent-soft)', border:'2px solid var(--accent-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontWeight:700, fontFamily:'var(--font-display)', color:'var(--accent)', flexShrink:0 }}>
          {user?.initials}
        </div>
        <div style={{ flex:1 }}>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, fontWeight:400, letterSpacing:'-0.02em', lineHeight:1 }}>{user?.name}</h1>
          <div style={{ fontSize:13, color:'var(--sub)', marginTop:5 }}>
            {profile.role || 'Staff'}{profile.department ? ` · ${profile.department}` : ''}
            {profile.contract_type ? ` · ${profile.contract_type}` : ''}
          </div>
          <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--faint)', marginTop:3 }}>{user?.email}</div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {saved && <span style={{ fontSize:13, color:'var(--green)' }}>✓ Saved</span>}
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>

      <div className="tabs">
        {[['info','My Details'],['hr','HR Info'],['bank','Bank Details'],['docs','Documents'],['payslips','Payslips']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={'tab'+(tab===k?' on':'')}>{l}</button>
        ))}
      </div>

      {/* My Details — staff can edit these */}
      {tab === 'info' && (
        <div className="card card-pad" style={{ maxWidth:600 }}>
          <div style={{ fontSize:12, color:'var(--faint)', fontFamily:'var(--font-mono)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:16 }}>Editable by you</div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div className="fg">
              <div><label className="lbl">Phone</label><input className="inp" value={form.phone} onChange={e=>sf('phone',e.target.value)} placeholder="07700 000000"/></div>
              <div><label className="lbl">Personal Email</label><input className="inp" type="email" value={form.personal_email} onChange={e=>sf('personal_email',e.target.value)}/></div>
              <div className="fc"><label className="lbl">Location</label><input className="inp" value={form.location} onChange={e=>sf('location',e.target.value)} placeholder="Cardiff, Wales"/></div>
              <div className="fc"><label className="lbl">Skills</label><input className="inp" value={form.skills} onChange={e=>sf('skills',e.target.value)} placeholder="e.g. WordPress, SEO, Client Relations"/></div>
            </div>
            <div><label className="lbl">Bio / About Me</label><textarea className="inp" rows={3} value={form.bio} onChange={e=>sf('bio',e.target.value)} style={{ resize:'vertical' }}/></div>
          </div>
        </div>
      )}

      {/* HR Info — read only, set by admin */}
      {tab === 'hr' && (
        <div className="card card-pad" style={{ maxWidth:500 }}>
          <div style={{ padding:'10px 14px', background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:8, marginBottom:18, fontSize:13, color:'var(--accent)' }}>
            These details are managed by HR. Contact your manager to make changes.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[
              ['Full Name',       profile.full_name],
              ['Role',            profile.role],
              ['Department',      profile.department],
              ['Contract Type',   profile.contract_type],
              ['Start Date',      profile.start_date ? new Date(profile.start_date).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : null],
              ['Manager',         profile.manager_name],
              ['Address',         profile.address],
            ].map(([label, val]) => val ? (
              <div key={label}>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:9, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--faint)', marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:14, color:'var(--text)', padding:'9px 13px', background:'var(--bg2)', borderRadius:7 }}>{val}</div>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {/* Bank — read only */}
      {tab === 'bank' && (
        <div className="card card-pad" style={{ maxWidth:480 }}>
          <div style={{ padding:'10px 14px', background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:8, marginBottom:18, fontSize:13, color:'var(--amber)' }}>
            Bank details are managed by HR. Contact your manager to update them.
          </div>
          {[['Bank Name','bank_name'],['Account Name','account_name'],['Sort Code','sort_code'],['Account Number','account_number']].map(([label, key]) => (
            <div key={key} style={{ marginBottom:14 }}>
              <label className="lbl">{label}</label>
              <div style={{ padding:'9px 13px', background:'var(--bg3)', borderRadius:7, fontSize:13, color: profile[key] ? 'var(--text)' : 'var(--faint)', fontFamily: key==='sort_code'||key==='account_number' ? 'var(--font-mono)' : 'inherit' }}>
                {profile[key] || '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documents */}
      {tab === 'docs' && (
        <div className="card" style={{ overflow:'hidden' }}>
          {docs.length === 0 ? (
            <div className="empty"><p>No documents uploaded yet.<br/>Your manager will upload contracts and documents here.</p></div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Document</th><th>Type</th><th>Uploaded</th><th></th></tr></thead>
              <tbody>
                {docs.map(d => (
                  <tr key={d.id}>
                    <td className="t-main">{d.name}</td>
                    <td><span className="badge badge-grey">{d.type}</span></td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</td>
                    <td><a href={d.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Payslips */}
      {tab === 'payslips' && (
        <div className="card" style={{ overflow:'hidden' }}>
          {payslips.length === 0 ? (
            <div className="empty"><p>No payslips uploaded yet.</p></div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Period</th><th>Uploaded</th><th></th></tr></thead>
              <tbody>
                {payslips.map(p => (
                  <tr key={p.id}>
                    <td className="t-main">{p.period}</td>
                    <td style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{new Date(p.uploaded_at||p.created_at).toLocaleDateString('en-GB')}</td>
                    <td><a href={p.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Download</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
