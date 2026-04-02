const TYPE_META = {
  info: {
    color: 'var(--blue)',
    border: 'var(--blue)',
    subtleBg: 'var(--card)',
    dotBg: 'var(--blue)',
  },
  success: {
    color: 'var(--green)',
    border: 'var(--green)',
    subtleBg: 'var(--card)',
    dotBg: 'var(--green)',
  },
  warning: {
    color: 'var(--amber)',
    border: 'var(--amber)',
    subtleBg: 'var(--card)',
    dotBg: 'var(--amber)',
  },
  urgent: {
    color: 'var(--red)',
    border: 'var(--red)',
    subtleBg: 'var(--card)',
    dotBg: 'var(--red)',
  },
}

export default function SystemBannerCard({
  title,
  statusText,
  subtitle,
  tone = 'info',
  dismissible = false,
  onDismiss,
  meta = [],
  compact = false,
}) {
  const style = TYPE_META[tone] || TYPE_META.info

  return (
    <div
      style={{
        padding: compact ? '14px 16px' : '18px 20px',
        borderRadius: 14,
        background: style.subtleBg,
        border: `2px solid ${style.border}`,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 14,
        boxShadow: `0 0 0 1px color-mix(in srgb, ${style.border} 10%, transparent), 0 8px 24px rgba(0,0,0,0.03)`,
      }}
    >
      <div
        style={{
          width: compact ? 12 : 14,
          height: compact ? 12 : 14,
          borderRadius: '50%',
          background: style.dotBg,
          flexShrink: 0,
          marginTop: 4,
          boxShadow: `0 0 10px ${style.dotBg}`,
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'baseline', marginBottom: 3 }}>
          <div style={{ fontWeight: 700, fontSize: compact ? 15 : 16, color: 'var(--text)' }}>{title}</div>
          {statusText ? (
            <div style={{ fontWeight: 700, fontSize: compact ? 15 : 16, color: style.color }}>
              {statusText}
            </div>
          ) : null}
        </div>
        {subtitle ? (
          <div style={{ fontSize: compact ? 12 : 13, color: 'var(--faint)', lineHeight: 1.6 }}>
            {subtitle}
          </div>
        ) : null}
        {meta.length ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {meta.map((item) => (
              <span key={item} className="badge badge-grey">{item}</span>
            ))}
          </div>
        ) : null}
      </div>

      {dismissible ? (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--faint)',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
