/**
 * Design System Button Component
 * Variants: primary, secondary, ghost
 */

export default function Button({
  children,
  variant = 'primary',
  onClick,
  disabled = false,
  type = 'button',
  className = '',
  ...props
}) {
  const baseClass = 'ds-btn'
  const variantClass = `ds-btn-${variant}`

  return (
    <button
      type={type}
      className={`${baseClass} ${variantClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
