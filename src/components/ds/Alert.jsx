/**
 * Design System Alert Component
 * Variants: info, warning
 */

export default function Alert({ children, variant = 'info', icon, className = '' }) {
  const variantClass = `ds-alert-${variant}`

  const defaultIcons = {
    info: 'ℹ️',
    warning: '⚠️'
  }

  return (
    <div className={`ds-alert ${variantClass} ${className}`}>
      {icon !== false && (
        <span>{icon || defaultIcons[variant]}</span>
      )}
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  )
}
