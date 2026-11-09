export function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({ name, initials, title }) {
  return (
    <span className="hq-avatar" title={title || name} aria-hidden={title ? undefined : 'true'}>
      {initials || initialsFor(name)}
    </span>
  )
}
