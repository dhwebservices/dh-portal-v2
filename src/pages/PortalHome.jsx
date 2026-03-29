import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../utils/supabase'
import { ArrowRight, BriefcaseBusiness, Layers3, ShieldCheck, Sparkles, Users } from 'lucide-react'

export default function PortalHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [canWebManager, setCanWebManager] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const check = async () => {
      if (!user?.email) return
      const { data: allPerms } = await supabase.from('user_permissions').select('user_email, permissions')
      const myRow = (allPerms || []).find(r => r.user_email?.toLowerCase() === user.email?.toLowerCase())
      const perms = myRow?.permissions
      const isAdmin = user.roles?.includes('Administrator')
      const hasNoRestrictions = !perms || Object.keys(perms).length === 0
      const hasWebAccess = perms?.webmanager === true || perms?.admin === true
      setCanWebManager(isAdmin || hasNoRestrictions || hasWebAccess)
      setLoading(false)
    }
    check()
  }, [user])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div className="spin" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  const panels = [
    {
      title: 'People',
      subtitle: 'HR, onboarding, leave, schedules, and internal operations.',
      desc: 'Start here when the work is about staff, approvals, payroll docs, or coordination.',
      to: '/dashboard',
      icon: Users,
      accent: 'var(--gold)',
      chips: ['HR', 'Leave', 'Timesheets'],
      enabled: true,
    },
    {
      title: 'Clients',
      subtitle: 'Accounts, proposals, outreach, support, and website delivery.',
      desc: 'Start here when the work is commercial, client-facing, or tied to the public website.',
      to: '/web-manager',
      icon: BriefcaseBusiness,
      accent: 'var(--blue)',
      chips: ['Accounts', 'Support', 'Content'],
      enabled: canWebManager,
    },
  ]

  return (
    <div style={{ minHeight: '100vh', padding: 'clamp(20px,4vw,40px)', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div style={{ marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src="/dh-logo.png" alt="DH" style={{ height: 28, filter: 'var(--logo-filter)' }} />
            <div style={{ width: 1, height: 30, background: 'var(--border)' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)' }}>DH Staff Portal</div>
              <div style={{ fontSize: 13, color: 'var(--sub)' }}>{user?.name}</div>
            </div>
          </div>
          <div className="badge badge-grey">{user?.email}</div>
        </div>

        <div className="card" style={{ padding: 'clamp(24px,4vw,40px)', marginBottom: 18, background: 'linear-gradient(135deg, var(--card-strong) 0%, rgba(183,143,37,0.08) 100%)', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', right: -60, top: -80, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(183,143,37,0.16) 0%, rgba(183,143,37,0) 70%)' }} />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: 760 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 999, background: 'var(--gold-bg)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
              <Sparkles size={12} />
              Choose a workspace
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(42px,6vw,76px)', lineHeight: 0.9, letterSpacing: '-0.04em', marginBottom: 14 }}>
              One portal,
              <br />
              two clear starting points.
            </h1>
            <p style={{ fontSize: 15.5, color: 'var(--sub)', lineHeight: 1.8, maxWidth: 620 }}>
              We’ve simplified the portal around focused workspaces instead of one long menu. Pick the area that matches the job you’re doing, then move deeper from there.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: canWebManager ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 18 }}>
          {panels.filter(panel => panel.enabled).map(panel => {
            const Icon = panel.icon
            return (
              <button
                key={panel.title}
                onClick={() => navigate(panel.to)}
                className="card"
                style={{ padding: '28px', textAlign: 'left', cursor: 'pointer', position: 'relative', overflow: 'hidden', minHeight: 340, background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, var(--card) 100%)' }}
              >
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${panel.accent}18 0%, transparent 55%)`, pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 18, background: `${panel.accent}18`, color: panel.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={22} />
                    </div>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sub)' }}>
                      <ArrowRight size={15} />
                    </div>
                  </div>

                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>
                    Workspace
                  </div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px,4vw,56px)', lineHeight: 0.92, letterSpacing: '-0.04em', marginBottom: 12 }}>
                    {panel.title}
                  </h2>
                  <p style={{ fontSize: 16, color: 'var(--text)', lineHeight: 1.5, marginBottom: 10 }}>
                    {panel.subtitle}
                  </p>
                  <p style={{ fontSize: 13.5, color: 'var(--sub)', lineHeight: 1.7, maxWidth: 440 }}>
                    {panel.desc}
                  </p>

                  <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 22 }}>
                    {panel.chips.map(chip => <span key={chip} className="badge badge-grey">{chip}</span>)}
                  </div>
                </div>
              </button>
            )
          })}

          {!canWebManager && (
            <div className="card" style={{ padding: '26px 28px', background: 'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, var(--card) 100%)' }}>
              <div style={{ width: 50, height: 50, borderRadius: 18, background: 'var(--blue-bg)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <Layers3 size={22} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>Restricted</div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px,3vw,42px)', lineHeight: 0.95, letterSpacing: '-0.03em', marginBottom: 10 }}>
                Clients workspace hidden
              </h2>
              <p style={{ fontSize: 14, color: 'var(--sub)', lineHeight: 1.8 }}>
                Your account currently has People workspace access only. If you need the client and website tools, an admin can enable them from staff permissions.
              </p>
            </div>
          )}
        </div>

        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {[
            { title: 'People leads to', text: 'Dashboard, HR profiles, leave, timesheets, payslips, and schedules.', icon: Users },
            { title: 'Clients leads to', text: 'Accounts, outreach, proposals, support, and website editing.', icon: BriefcaseBusiness },
            { title: 'Admin tools stay tucked away', text: 'Reports, maintenance, audit, and settings remain available when permitted.', icon: ShieldCheck },
          ].map(item => {
            const Icon = item.icon
            return (
              <div key={item.title} className="card" style={{ padding: '18px 18px 16px' }}>
                <div style={{ width: 38, height: 38, borderRadius: 14, background: 'var(--gold-bg)', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Icon size={18} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.7 }}>{item.text}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
