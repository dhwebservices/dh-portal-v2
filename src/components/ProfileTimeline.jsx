import { Clock3, FileText, GraduationCap, ShieldCheck, Target, UserRound } from 'lucide-react'
import { formatProfileTimelineDate } from '../utils/profileTimeline'

const CATEGORY_ICONS = {
  lifecycle: UserRound,
  performance: Target,
  training: GraduationCap,
  documents: FileText,
  contracts: ShieldCheck,
}

function toneColor(tone = 'grey') {
  if (tone === 'green') return 'var(--green)'
  if (tone === 'red') return 'var(--red)'
  if (tone === 'amber') return 'var(--amber)'
  if (tone === 'blue') return 'var(--accent)'
  return 'var(--sub)'
}

export default function ProfileTimeline({
  title = 'Timeline',
  subtitle = '',
  items = [],
  emptyMessage = 'No timeline entries yet.',
  limit = 0,
}) {
  const visibleItems = limit > 0 ? items.slice(0, limit) : items

  return (
    <div className="card card-pad">
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--faint)' }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginTop: 4 }}>{subtitle}</div> : null}
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {visibleItems.length ? visibleItems.map((item) => {
          const Icon = CATEGORY_ICONS[item.category] || Clock3
          const accent = toneColor(item.tone)

          return (
            <div key={item.id} style={{ padding: '12px 13px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg2)', display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 10, minWidth: 0, flex: 1 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: `${accent}18`, color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 5, lineHeight: 1.6 }}>{item.subtitle}</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                  <span className={`badge badge-${item.tone || 'grey'}`}>{formatProfileTimelineDate(item.date)}</span>
                  {item.category ? <span className="badge badge-grey">{item.category}</span> : null}
                </div>
              </div>
              {item.action ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <a href={item.action} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">{item.actionLabel || 'Open'}</a>
                </div>
              ) : null}
            </div>
          )
        }) : (
          <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>{emptyMessage}</div>
        )}
      </div>
    </div>
  )
}
