export default function SubNav({ items }) {
  return (
    <div style={{
      marginBottom: 'var(--space-lg)',
      display: 'flex',
      gap: 'var(--space-lg)',
      flexWrap: 'wrap',
      borderBottom: '1px solid var(--color-border)',
    }}>
      {items.filter(Boolean).map((item) => (
        <div
          key={item.label}
          onClick={item.onClick}
          style={{
            padding: 'var(--space-sm) 0',
            fontSize: 'var(--font-size-body)',
            color: item.active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            borderBottom: item.active ? '2px solid var(--color-text-primary)' : '2px solid transparent',
            marginBottom: '-1px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  )
}
