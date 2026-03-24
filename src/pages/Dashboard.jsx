import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PhoneCall, Users, HeadphonesIcon, CheckSquare, TrendingUp, ArrowRight } from 'lucide-react'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'

const WORKER = 'https://dh-email-worker.aged-silence-66a7.workers.dev'

function StatCard({ icon: Icon, label, value, accent, link, loading }) {
  const nav = useNavigate()
  return (
    <div onClick={() => link && nav(link)} className="stat-card" style={{ cursor: link ? 'pointer' : 'default' }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Icon size={18} color={accent} />
      </div>
      {loading ? (
        <div className="skeleton" style={{ height: 36, width: 60, marginBottom: 6, borderRadius: 4 }} />
      ) : (
        <div className="stat-val">{value}</div>
      )}
      <div className="stat-lbl">{label}</div>
    </div>
  )
}

function ActiveBanners() {
  const [banners, setBanners] = useState([])
  const [dismissed, setDismissed] = useState([])
  useEffect(() => {
    supabase.from('banners').select('*').eq('active', true).eq('target', 'staff').then(({ data }) => setBanners(data || []))
  }, [])
  const visible = banners.filter(b => !dismissed.includes(b.id) && (!b.ends_at || new Date(b.ends_at) > new Date()))
  if (!visible.length) return null
  const typeStyle = { info:{ bg:'var(--blue-bg)', border:'var(--blue)', color:'var(--blue)', icon:'ℹ️' }, success:{ bg:'var(--green-bg)', border:'var(--green)', color:'var(--green)', icon:'✅' }, warning:{ bg:'var(--amber-bg)', border:'var(--amber)', color:'var(--amber)', icon:'⚠️' }, urgent:{ bg:'var(--red-bg)', border:'var(--red)', color:'var(--red)', icon:'🚨' } }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
      {visible.map(b => { const s = typeStyle[b.type] || typeStyle.info; return (
        <div key={b.id} style={{ padding:'12px 16px', background:s.bg, border:`1px solid ${s.border}`, borderRadius:8, display:'flex', alignItems:'flex-start', gap:10 }}>
          <span style={{ flexShrink:0 }}>{s.icon}</span>
          <div style={{ flex:1 }}>
            {b.title && <div style={{ fontWeight:600, fontSize:13, color:s.color, marginBottom:2 }}>{b.title}</div>}
            <div style={{ fontSize:13, color:'var(--text)', lineHeight:1.5 }}>{b.message}</div>
          </div>
          {b.dismissible && <button onClick={() => setDismissed(p => [...p, b.id])} style={{ background:'none', border:'none', color:'var(--faint)', cursor:'pointer', fontSize:18, lineHeight:1, flexShrink:0 }}>×</button>}
        </div>
      )})}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({ outreach: 0, clients: 0, tickets: 0, tasks: 0, revenue: 0 })
  const [recentActivity, setRecentActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [aiTip, setAiTip] = useState('')
  const [tipLoading, setTipLoading] = useState(false)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.name?.split(' ')[0] || 'there'
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  useEffect(() => {
    async function load() {
      const results = await Promise.allSettled([
        supabase.from('outreach').select('*', { count: 'exact', head: true }),
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).neq('status', 'done'),
        supabase.from('commissions').select('commission_amount,status'),
        supabase.from('audit_log').select('user_name,action,entity,created_at').order('created_at', { ascending: false }).limit(8),
      ])
      const get = (i) => results[i].status === 'fulfilled' ? results[i].value : { data: null, count: 0 }
      const outreach = get(0).count || 0
      const clients  = get(1).count || 0
      const tickets  = get(2).count || 0
      const tasks    = get(3).count || 0
      const commissions = get(4).data || []
      const activity    = get(5).data || []
      const revenue = commissions.filter(c => c.status === 'paid').reduce((s, c) => s + Number(c.commission_amount || 0), 0)
      setStats({ outreach, clients, tickets, tasks, revenue })
      setRecentActivity(activity)
      setLoading(false)
    }
    load()
  }, [])

  const getAiTip = async () => {
    setTipLoading(true)
    try {
      const res = await fetch(WORKER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ai_tip', data: { stats } }),
      })
      const d = await res.json()
      setAiTip(d.tip || 'Focus on converting your most engaged outreach leads today.')
    } catch {
      setAiTip('Follow up with interested contacts within 48 hours for the best conversion rate.')
    }
    setTipLoading(false)
  }

  return (
    <div className="fade-in">
      <ActiveBanners/>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px,3vw,42px)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {greeting}, <em style={{ color: 'var(--sub)', fontStyle: 'italic' }}>{firstName}</em>
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', marginTop: 8 }}>{dateStr}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon={PhoneCall}       label="Total Outreach"   value={stats.outreach} accent="var(--blue)"  link="/outreach"  loading={loading} />
        <StatCard icon={Users}           label="Active Clients"   value={stats.clients}  accent="var(--green)" link="/clients"   loading={loading} />
        <StatCard icon={HeadphonesIcon}  label="Open Tickets"     value={stats.tickets}  accent="var(--red)"   link="/support"   loading={loading} />
        <StatCard icon={CheckSquare}     label="Pending Tasks"    value={stats.tasks}    accent="var(--amber)"  link="/my-tasks"  loading={loading} />
        <StatCard icon={TrendingUp}      label="Commission Paid"  value={`£${stats.revenue.toLocaleString()}`} accent="var(--accent)" loading={loading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Recent activity */}
        <div className="card">
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)' }}>Recent Activity</div>
          </div>
          <div>
            {recentActivity.length === 0 ? (
              <div className="empty"><p>No recent activity</p></div>
            ) : recentActivity.map((a, i) => (
              <div key={i} style={{ padding: '10px 18px', borderBottom: i < recentActivity.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{a.user_name}</span>
                  <span style={{ fontSize: 13, color: 'var(--sub)' }}> — {a.action?.replace(/_/g, ' ')}</span>
                  {a.target && <span style={{ fontSize: 12, color: 'var(--faint)' }}> ({a.target})</span>}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', flexShrink: 0 }}>
                  {new Date(a.created_at).toLocaleDateString('en-GB')}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Tip */}
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)' }}>AI Daily Insight</div>
          <div style={{ flex: 1, fontSize: 14, color: 'var(--sub)', lineHeight: 1.7 }}>
            {aiTip || 'Get a personalised insight based on your current portal data.'}
          </div>
          <button onClick={getAiTip} disabled={tipLoading} className="btn btn-outline btn-sm" style={{ alignSelf: 'flex-start' }}>
            {tipLoading ? <><div className="spin" style={{ width: 12, height: 12, borderWidth: 1.5 }} />Generating…</> : '✨ Generate insight'}
          </button>
        </div>
      </div>
    </div>
  )
}
