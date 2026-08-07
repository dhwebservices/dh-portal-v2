/**
 * Design System Status Badge Component
 * Variants: active, warning, error, info
 */

export default function StatusBadge({ children, variant = 'info', className = '' }) {
  const variantClass = `ds-status-${variant}`

  return (
    <span className={`ds-status-badge ${variantClass} ${className}`}>
      {children}
    </span>
  )
}
