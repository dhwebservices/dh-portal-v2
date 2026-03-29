import { useNavigate } from 'react-router-dom'
import { Globe2, Users, FileText, BarChart2, ArrowRight, MessageSquare, PhoneCall } from 'lucide-react'

export default function WebManager() {
  const navigate = useNavigate()

  const sections = [
    {
      icon: Users,
      title: 'Client Accounts',
      desc: 'Manage profiles, plans, notes, invoice state, and onboarding progress.',
      to: '/clients',
      accent: 'var(--gold)',
    },
    {
      icon: PhoneCall,
      title: 'Outreach',
      desc: 'Track commercial conversations, lead status, and who needs following up next.',
      to: '/outreach',
      accent: 'var(--green)',
    },
    {
      icon: MessageSquare,
      title: 'Support',
      desc: 'Handle incoming issues and see what is still open across client accounts.',
      to: '/support',
      accent: 'var(--red)',
    },
    {
      icon: FileText,
      title: 'Proposal Builder',
      desc: 'Create polished proposals and pricing documents for new business.',
      to: '/proposals',
      accent: 'var(--blue)',
    },
    {
      icon: Globe2,
      title: 'Website Editor',
      desc: 'Update the public website content, messaging, and structured page sections.',
      to: '/website-cms',
      accent: 'var(--purple)',
    },
    {
      icon: BarChart2,
      title: 'Reports',
      desc: 'Review outreach, conversion, and revenue trends in one place.',
      to: '/reports',
      accent: 'var(--amber)',
    },
  ]

  return (
    <div className="animate-fade" style={{ maxWidth: 1240, padding: '4px 0' }}>
      <div className="card" style={{ padding: '28px clamp(22px,3vw,34px)', marginBottom: 20, background: 'linear-gradient(135deg, var(--card-strong) 0%, rgba(48,93,210,0.08) 100%)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', right: -50, top: -60, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(48,93,210,0.14) 0%, rgba(48,93,210,0) 70%)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 12 }}>
            Clients Workspace
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(36px,4vw,58px)', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 0.92, marginBottom: 12 }}>
            Commercial work,
            <br />
            organised by outcome.
          </h1>
          <p style={{ fontSize: 15, color: 'var(--sub)', lineHeight: 1.8, maxWidth: 660 }}>
            This workspace brings together the full client journey: prospecting, proposals, onboarding, support, and website delivery. Use it as the commercial hub instead of bouncing between isolated tools.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 20 }}>
        {sections.map(section => {
          const Icon = section.icon
          return (
            <button
              key={section.title}
              onClick={() => navigate(section.to)}
              className="card"
              style={{ padding: '22px 20px 20px', textAlign: 'left', borderRadius: 22, cursor: 'pointer', position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg, rgba(255,255,255,0.46) 0%, var(--card) 100%)' }}
            >
              <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${section.accent}14 0%, transparent 52%)`, pointerEvents: 'none' }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 16, background: `${section.accent}18`, color: section.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={20} />
                  </div>
                  <ArrowRight size={15} color="var(--faint)" />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 0.96, letterSpacing: '-0.03em', marginBottom: 8 }}>
                  {section.title}
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--sub)', lineHeight: 1.7 }}>
                  {section.desc}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        {[
          { label: 'Account health', val: 'Clients', text: 'The client account area is now the main source of truth for relationship state and billing context.' },
          { label: 'Commercial pipeline', val: 'Outreach', text: 'Treat outreach and proposals as one flow rather than separate admin pages.' },
          { label: 'Delivery visibility', val: 'Support', text: 'Support and website editing sit inside the same workspace so delivery work stays connected.' },
        ].map(card => (
          <div key={card.label} className="card" style={{ padding: '20px 20px 18px' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 10 }}>{card.label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, lineHeight: 0.96, letterSpacing: '-0.03em', marginBottom: 8 }}>{card.val}</div>
            <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.7 }}>{card.text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
