/**
 * Design System Status Badge Component
 * Variants: active, warning, error, info, neutral
 *
 * Spreads extra props (title, style, ...) onto the span - several callers
 * pass a `title` tooltip, and without this it was silently dropped.
 */

export default function StatusBadge({ children, variant = 'info', className = '', ...props }) {
  const variantClass = `ds-status-${variant}`

  return (
    <span className={`ds-status-badge ${variantClass} ${className}`} {...props}>
      {children}
    </span>
  )
}
