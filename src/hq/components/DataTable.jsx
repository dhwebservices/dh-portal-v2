import { Link, useNavigate } from 'react-router-dom'

// A plain table inside a panel. Rows can open a page.
//   columns: [{ key, label, render(row), className, hideOnPhone, link }]
//     link: true makes that cell's content the row's real link (for keyboards
//     and screen readers); the rest of the row is clickable with a mouse too.
//   rowTo(row): where a row goes when clicked. Leave out for rows that don't open.
//   empty: what to say when there are no rows.
export default function DataTable({ columns, rows, rowKey = (row) => row.id, rowTo, empty = 'Nothing here yet.', caption }) {
  const navigate = useNavigate()

  if (!rows.length) {
    return <p className="hq-panel-empty">{empty}</p>
  }

  return (
    <table className="hq-table">
      {caption ? <caption className="hq-visually-hidden">{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} scope="col" className={[col.className, col.hideOnPhone ? 'hq-hide-phone' : ''].filter(Boolean).join(' ') || undefined}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const to = rowTo ? rowTo(row) : null
          return (
            <tr
              key={rowKey(row)}
              className={to ? 'is-link' : undefined}
              onClick={to ? (event) => {
                if (event.target.closest('a, button')) return
                navigate(to)
              } : undefined}
            >
              {columns.map((col) => {
                const content = col.render ? col.render(row) : row[col.key]
                return (
                  <td key={col.key} className={[col.className, col.hideOnPhone ? 'hq-hide-phone' : ''].filter(Boolean).join(' ') || undefined}>
                    {col.link && to ? <Link to={to} className="hq-table-link">{content}</Link> : content}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
