/**
 * Design System Table Component
 * Clean table with hover states, no borders between cells
 *
 * Every part spreads extra props onto its underlying element. Without this
 * the wrappers silently swallowed anything beyond children/className -
 * `style`, `colSpan`, and `onClick` were all being dropped, so column widths
 * never applied and per-cell click handlers (e.g. stopPropagation on an
 * actions cell inside a clickable row) never ran.
 */

export function Table({ children, className = '', ...props }) {
  return (
    <div className={`ds-table-container ${className}`} {...props}>
      <table className="ds-table">
        {children}
      </table>
    </div>
  )
}

export function TableHeader({ children, ...props }) {
  return <thead {...props}>{children}</thead>
}

export function TableBody({ children, ...props }) {
  return <tbody {...props}>{children}</tbody>
}

export function TableRow({ children, onClick, className = '', style, ...props }) {
  return (
    <tr
      className={className}
      onClick={onClick}
      style={{ ...(onClick ? { cursor: 'pointer' } : null), ...style }}
      {...props}
    >
      {children}
    </tr>
  )
}

export function TableHead({ children, className = '', ...props }) {
  return <th className={className} {...props}>{children}</th>
}

export function TableCell({ children, className = '', ...props }) {
  return <td className={className} {...props}>{children}</td>
}
