/**
 * Design System Table Component
 * Clean table with hover states, no borders between cells
 */

export function Table({ children, className = '' }) {
  return (
    <div className={`ds-table-container ${className}`}>
      <table className="ds-table">
        {children}
      </table>
    </div>
  )
}

export function TableHeader({ children }) {
  return <thead>{children}</thead>
}

export function TableBody({ children }) {
  return <tbody>{children}</tbody>
}

export function TableRow({ children, onClick, className = '' }) {
  return (
    <tr
      className={className}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {children}
    </tr>
  )
}

export function TableHead({ children, className = '' }) {
  return <th className={className}>{children}</th>
}

export function TableCell({ children, className = '' }) {
  return <td className={className}>{children}</td>
}
