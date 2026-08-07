/**
 * Design System Form Field Components
 */

export function FormField({ children, className = '' }) {
  return (
    <div className={`ds-form-field ${className}`}>
      {children}
    </div>
  )
}

export function FormLabel({ children, htmlFor, required = false }) {
  return (
    <label className="ds-form-label" htmlFor={htmlFor}>
      {children}
      {required && <span style={{ color: 'var(--color-red-500)', marginLeft: '4px' }}>*</span>}
    </label>
  )
}

export function FormInput({
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  name,
  id,
  ...props
}) {
  return (
    <input
      type={type}
      className="ds-form-input"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      name={name}
      id={id}
      {...props}
    />
  )
}

export function FormSelect({
  value,
  onChange,
  children,
  disabled = false,
  name,
  id,
  ...props
}) {
  return (
    <select
      className="ds-form-select"
      value={value}
      onChange={onChange}
      disabled={disabled}
      name={name}
      id={id}
      {...props}
    >
      {children}
    </select>
  )
}

export function FormHint({ children }) {
  return (
    <div style={{
      fontSize: 'var(--font-size-small)',
      color: 'var(--color-text-secondary)'
    }}>
      {children}
    </div>
  )
}
