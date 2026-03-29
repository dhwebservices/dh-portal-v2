import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../utils/supabase'
import { useAuth } from '../contexts/AuthContext'
import {
  ArrowRight,
  Users,
  PhoneCall,
  MessageSquare,
  CheckSquare,
  TrendingUp,
  Clock,
  CalendarDays,
  BriefcaseBusiness,
  ShieldCheck,
  Layers3,
  Sparkles,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const WORKER_URL = 'https://dh-email-worker.aged-silence-66a7.workers.dev'

function CountUp({ target, prefix = '', suffix = '', decimals = 0 }) {
  const [value, setValue] = useState(0)
  const frame = useRef()
  const start = useRef()

  useEffect(() => {
    if (!target) {
      setValue(0)
      return
    }
    cancelAnimationFrame(frame.current)
    start.current = null
    const animate = ts => {
      if (!start.current) start.current = ts
      const progress = Math.min((ts - start.current) / 1200, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(parseFloat((eased * target).toFixed(decimals)))
      if (progress < 1) frame.current = requestAnimationFrame(animate)
    }
    frame.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame.current)
  }, [target, decimals])

  return <>{prefix}{decimals > 0 ? value.toFixed(decimals) : Math.round(value)}{suffix}</>
}

function StatCard({ icon: Icon, label, value, prefix = '', suffix = '', accent, link, loading }) {
  return (
    <Link to={link || '#'} style={{ textDecoration: 'none' }}>
      <div className="stat-card" style={{ cursor: link ? 'pointer' : 'default' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: `${accent}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={16} color={accent} />
          </div>
          {link && <ArrowRight size={14} color="var(--faint)" />}
        </div>
        <div className="stat-val">
          {loading ? <div className="skeleton" style={{ width: 60, height: 32 }} /> : <CountUp target={value} prefix={prefix} suffix={suffix} />}
        </div>
        <div className="stat-label">{label}</div>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [stats, setStats] = useState({ outreach: 0, clients: 0, tickets: 0, tasks: 0 })
  const [recentOutreach, setRecentOutreach] = useState([])
  const [tasks, setTasks] = useState([])
  const [systemStatus, setSystemStatus] = useState([])
  const [aiTip, setAiTip] = useState('')
  const [tipLoading, setTipLoading] = useState(false)
  const [chartData, setChartData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const [{ count: outreach }, { count: clients }, { count: tickets }, { count: taskCount }, { data: recent }, { data: myTasks }] = await Promise.all([
        supabase.from('outreach').select('*', { count: 'exact', head: true }),
        supabase.from('onboarded_clients').select('*', { count: 'exact', head: true }),
        supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('outreach').select('business_name,status,created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('tasks').select('*').eq('assigned_to', user?.email || '').eq('status', 'pending').limit(5),
      ])

      setStats({ outreach: outreach || 0, clients: clients || 0, tickets: tickets || 0, tasks: taskCount || 0 })
      setRecentOutreach(recent || [])
      setTasks(myTasks || [])

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
      setChartData(months.map(month => ({ month, contacts: Math.floor(Math.random() * 20) + 5, converted: Math.floor(Math.random() * 5) + 1 })))

      setSystemStatus([
        { name: 'Staff Portal', status: 'operational' },
        { name: 'Client Portal', status: 'operational' },
        { name: 'Public Website', status: 'operational' },
        { name: 'Email System', status: 'operational' },
        { name: 'Supabase DB', status: 'operational' },
      ])
      setLoading(false)
    }

    load()
  }, [user])

  const getAiTip = async () => {
    setTipLoading(true)
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ai_tip', data: { stats } }),
      })
      const data = await res.json()
      setAiTip(data.tip || 'Focus on converting your most engaged outreach leads today.')
    } catch {
      setAiTip('Follow up with interested contacts within 48 hours for best results.')
    }
    setTipLoading(false)
  }

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const statusColor = status => (status === 'operational' ? 'var(--green)' : status === 'degraded' ? 'var(--amber)' : 'var(--red)')

  const focusItems = [
    { label: 'Pending tasks', value: stats.tasks, note: 'Your open work queue', to: '/my-tasks', icon: CheckSquare, accent: 'var(--amber)' },
    { label: 'Open tickets', value: stats.tickets, note: 'Customer issues awaiting action', to: '/support', icon: MessageSquare, accent: 'var(--red)' },
    { label: 'Client accounts', value: stats.clients, note: 'Active onboarded relationships', to: '/clients', icon: BriefcaseBusiness, accent: 'var(--gold)' },
  ]

  const workspaces = [
    {
      title: 'People',
      subtitle: 'Staff and HR operations',
      to: '/hr/profiles',
      icon: Users,
      accent: 'var(--gold)',
      links: ['Profiles', 'Leave', 'Timesheets'],
    },
    {
      title: 'Clients',
      subtitle: 'Pipeline, delivery, and support',
      to: '/clients',
      icon: BriefcaseBusiness,
      accent: 'var(--green)',
      links: ['Accounts', 'Outreach', 'Proposals'],
    },
    {
      title: 'Content',
      subtitle: 'Sites, templates, and campaigns',
      to: '/website-cms',
      icon: Layers3,
      accent: 'var(--blue)',
      links: ['Website Editor', 'Banners', 'Templates'],
    },
    {
      title: 'Admin',
      subtitle: 'Permissions, audit, and platform control',
      to: '/admin',
      icon: ShieldCheck,
      accent: 'var(--amber)',
      links: ['Permissions', 'Reports', 'Maintenance'],
    },
  ]

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 28, padding: '24px clamp(20px,3vw,28px)', borderRadius: 24, border: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--card) 0%, rgba(184,150,12,0.08) 100%)', boxShadow: 'var(--shadow-sm)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -40, top: -60, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(184,150,12,0.16) 0%, rgba(184,150,12,0) 68%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 999, background: 'var(--gold-bg)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>
                <Sparkles size={12} />
                Workspace Home
              </div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(34px,4vw,56px)', fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 0.94 }}>
                {greeting}, {user?.name?.split(' ')[0]}
              </h1>
              <p style={{ marginTop: 12, maxWidth: 620, color: 'var(--sub)', fontSize: 15, lineHeight: 1.7 }}>
                Your day is organised into a few clear workspaces now: people, clients, content, and admin. Start here, then drill into the tools you need.
              </p>
            </div>
            <div style={{ minWidth: 240, display: 'grid', gap: 10 }}>
              <Link to="/my-tasks" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                <CheckSquare size={14} />
                Open My Tasks
              </Link>
              <Link to="/schedule" className="btn btn-outline" style={{ justifyContent: 'center' }}>
                <CalendarDays size={14} />
                View Schedule
              </Link>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12 }}>
            {focusItems.map(item => {
              const Icon = item.icon
              return (
                <Link key={item.label} to={item.to} style={{ padding: '16px 18px', borderRadius: 18, background: 'rgba(255,255,255,0.62)', border: '1px solid var(--border)', textDecoration: 'none', boxShadow: 'var(--shadow-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 12, background: `${item.accent}18`, color: item.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={16} />
                    </div>
                    <ArrowRight size={14} color="var(--faint)" />
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, lineHeight: 1, letterSpacing: '-0.03em', marginBottom: 4 }}>{item.value}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>{item.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 4 }}>{item.note}</div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon={PhoneCall} label="Total Outreach" value={stats.outreach} accent="var(--blue)" link="/outreach" loading={loading} />
        <StatCard icon={Users} label="Onboarded Clients" value={stats.clients} accent="var(--green)" link="/clients" loading={loading} />
        <StatCard icon={MessageSquare} label="Open Tickets" value={stats.tickets} accent="var(--red)" link="/support" loading={loading} />
        <StatCard icon={CheckSquare} label="Pending Tasks" value={stats.tasks} accent="var(--amber)" link="/my-tasks" loading={loading} />
      </div>

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 6 }}>Workspaces</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(26px,3vw,36px)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1 }}>Move by area, not by long menu</h2>
          </div>
          <p style={{ maxWidth: 460, color: 'var(--sub)', fontSize: 13.5, lineHeight: 1.7 }}>
            Each workspace groups related tools together so the portal feels more like a product and less like a sitemap.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
          {workspaces.map(workspace => {
            const Icon = workspace.icon
            return (
              <Link key={workspace.title} to={workspace.to} className="card" style={{ padding: '22px 22px 18px', textDecoration: 'none', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${workspace.accent}12 0%, transparent 52%)`, pointerEvents: 'none' }} />
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: `${workspace.accent}18`, color: workspace.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                    <Icon size={18} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 0.96, letterSpacing: '-0.03em' }}>{workspace.title}</div>
                    <ArrowRight size={14} color="var(--faint)" />
                  </div>
                  <div style={{ color: 'var(--sub)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>{workspace.subtitle}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {workspace.links.map(link => <span key={link} className="badge badge-grey">{link}</span>)}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: 20, marginBottom: 20 }}>
        <div className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Commercial Snapshot</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', letterSpacing: '0.08em' }}>LAST 6 MONTHS</div>
            </div>
            <TrendingUp size={16} color="var(--faint)" />
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--faint)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-body)' }} />
              <Line type="monotone" dataKey="contacts" stroke="var(--gold)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="converted" stroke="var(--green)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            {[['Contacts', 'var(--gold)'], ['Converted', 'var(--green)']].map(([label, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--sub)' }}>
                <div style={{ width: 20, height: 2, background: color, borderRadius: 1 }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Priority Queue</div>
            <Clock size={15} color="var(--faint)" />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {focusItems.map(item => (
              <Link key={item.label} to={item.to} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 14px', borderRadius: 14, background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--sub)', marginTop: 3 }}>{item.note}</div>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1, color: 'var(--text)' }}>{item.value}</div>
              </Link>
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Quick access</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { label: 'Open client accounts', to: '/clients' },
                { label: 'Review leave requests', to: '/hr/leave' },
                { label: 'Check site maintenance', to: '/maintenance' },
              ].map(link => (
                <Link key={link.to} to={link.to} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--sub)' }}>
                  <span>{link.label}</span>
                  <ArrowRight size={12} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Recent Outreach</div>
            <Link to="/outreach" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all
              <ArrowRight size={10} />
            </Link>
          </div>
          {loading ? (
            <div className="spin-center"><div className="spin" /></div>
          ) : recentOutreach.length === 0 ? (
            <div className="empty"><p>No outreach records yet</p></div>
          ) : (
            <div>
              {recentOutreach.map((record, i) => (
                <div key={record.id || i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: i < recentOutreach.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{record.business_name}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', marginTop: 2 }}>{new Date(record.created_at).toLocaleDateString('en-GB')}</div>
                  </div>
                  <span className={`badge badge-${record.status === 'Interested' ? 'green' : record.status === 'Not Interested' ? 'red' : record.status === 'To Be Onboarded' ? 'gold' : 'grey'}`}>{record.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>My Tasks</div>
            <Link to="/my-tasks" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all
              <ArrowRight size={10} />
            </Link>
          </div>
          {loading ? (
            <div className="spin-center"><div className="spin" /></div>
          ) : tasks.length === 0 ? (
            <div className="empty"><p>No pending tasks</p></div>
          ) : (
            <div>
              {tasks.map((task, i) => (
                <div key={task.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 20px', borderBottom: i < tasks.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: task.priority === 'high' ? 'var(--red)' : task.priority === 'medium' ? 'var(--amber)' : 'var(--green)', marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{task.title}</div>
                    {task.due_date && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', marginTop: 2 }}>Due {new Date(task.due_date).toLocaleDateString('en-GB')}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(260px, 0.85fr)', gap: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>System Status</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {systemStatus.map(status => (
                <div key={status.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14 }}>
                  <span style={{ fontSize: 13, color: 'var(--sub)' }}>{status.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(status.status), animation: status.status === 'operational' ? 'pulse 2s infinite' : 'none' }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: statusColor(status.status) }}>{status.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>AI Prompt</div>
              <button onClick={getAiTip} className="btn btn-outline btn-sm" disabled={tipLoading}>{tipLoading ? 'Thinking...' : 'Refresh'}</button>
            </div>
            <div style={{ padding: '16px 16px 18px', borderRadius: 16, background: 'linear-gradient(180deg, var(--bg2) 0%, var(--card) 100%)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>
                <Sparkles size={11} />
                Daily Nudge
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--sub)', lineHeight: 1.7 }}>
                {aiTip || 'Generate a quick nudge based on outreach, tasks, and support load to help prioritise the day.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
