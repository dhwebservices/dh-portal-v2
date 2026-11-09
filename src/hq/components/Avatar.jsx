// Round initials badge for a person. tone: 'ink' (default), 'blue', 'brown'.
export function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({ name, initials, tone = 'ink', title }) {
  const label = title || name
  return (
    <span
      className={`hq-avatar hq-avatar-${tone}`}
      title={label}
      aria-label={label || undefined}
      role={label ? 'img' : undefined}
    >
      <span aria-hidden="true">{initials || initialsFor(name)}</span>
    </span>
  )
}
