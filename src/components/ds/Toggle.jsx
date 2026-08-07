/**
 * Design System Toggle Switch Component
 */

export default function Toggle({
  enabled = false,
  onChange,
  label,
  description,
  className = ''
}) {
  return (
    <div
      className={className}
      onClick={() => onChange(!enabled)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: 'var(--space-md)',
        background: 'var(--color-gray-50)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--border-radius-lg)',
        cursor: 'pointer',
        transition: 'background var(--transition-normal)'
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-gray-100)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-gray-50)'}
    >
      <div style={{
        width: '44px',
        height: '24px',
        background: enabled ? 'var(--color-primary)' : 'var(--color-gray-200)',
        borderRadius: '12px',
        position: 'relative',
        transition: 'background var(--transition-slow)',
        flexShrink: 0
      }}>
        <div style={{
          position: 'absolute',
          top: '2px',
          left: enabled ? '22px' : '2px',
          width: '20px',
          height: '20px',
          background: '#FFFFFF',
          borderRadius: '50%',
          transition: 'left var(--transition-slow)',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }} />
      </div>
      {(label || description) && (
        <div style={{ flex: 1 }}>
          {label && (
            <div style={{
              fontSize: 'var(--font-size-body)',
              fontWeight: 'var(--font-weight-medium)',
              marginBottom: description ? '2px' : 0
            }}>
              {label}
            </div>
          )}
          {description && (
            <div style={{
              fontSize: 'var(--font-size-small)',
              color: 'var(--color-text-secondary)'
            }}>
              {description}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
