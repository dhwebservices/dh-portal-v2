/**
 * The quiet grey label above a group of cards — "What's happening today",
 * "At a glance".
 *
 * Deliberately not a card and not accented: its job is to let you skip a whole
 * section at a glance, which it can only do if it recedes.
 */
export default function SectionHeader({ title, action, onAction }) {
  return (
    <>
      <div className="mobile-section-header">
        <h2>{title}</h2>
        {action && (
          <button type="button" onClick={onAction}>{action}</button>
        )}
      </div>

      <style>{`
        .mobile-section-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          padding: 4px 4px 10px;
        }

        .mobile-section-header h2 {
          margin: 0;
          font-size: 17px;
          font-weight: 600;
          color: var(--mobile-text-secondary);
          letter-spacing: -0.01em;
        }

        .mobile-section-header button {
          background: none;
          border: none;
          padding: 4px;
          font-size: 14px;
          font-weight: 600;
          color: var(--mobile-accent);
          cursor: pointer;
        }
      `}</style>
    </>
  )
}
