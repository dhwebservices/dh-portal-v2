import { Haptics, ImpactStyle } from '@capacitor/haptics'
import Icon from './Icon'

/**
 * A card that states one fact: an icon in a tinted disc, a line of text, and
 * optionally a second line and a chevron.
 *
 * This is the shape the dashboard is built from — "No one is on leave today",
 * "Who's in", "0 pending requests". It carries the empty state as a first-class
 * case rather than an afterthought, because on a small team most of these cards
 * are empty most days, and a dashboard full of blanks is what makes an app feel
 * unfinished.
 *
 * `tone` tints the disc: neutral for information, accent for something that
 * belongs to you, warn for something waiting on you.
 */
export default function InfoRow({
  icon,
  title,
  subtitle,
  tone = 'neutral',
  value,
  onPress,
  children,
}) {
  const handlePress = async () => {
    if (!onPress) return
    await Haptics.impact({ style: ImpactStyle.Light })
    onPress()
  }

  return (
    <>
      <div
        className={`info-row info-row-${tone}${onPress ? ' info-row-pressable' : ''}`}
        onClick={handlePress}
      >
        <div className="info-row-main">
          <span className="info-row-disc">
            <Icon name={icon} size={20} />
          </span>

          <div className="info-row-text">
            <p className="info-row-title">{title}</p>
            {subtitle && <p className="info-row-subtitle">{subtitle}</p>}
          </div>

          {value && <span className="info-row-value">{value}</span>}
          {onPress && (
            <span className="info-row-chevron">
              <Icon name="chevron-right" size={18} />
            </span>
          )}
        </div>

        {children && <div className="info-row-body">{children}</div>}
      </div>

      <style>{`
        .info-row {
          background: var(--mobile-card);
          border-radius: 14px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.07);
        }

        .info-row-pressable { cursor: pointer; }
        .info-row-pressable:active { transform: scale(0.995); }

        .info-row-main {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px;
        }

        .info-row-disc {
          flex: 0 0 auto;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          /* Tinted by tone, set below. */
          background: var(--disc-bg);
          color: var(--disc-fg);
        }

        .info-row-neutral {
          --disc-bg: rgba(120, 130, 145, 0.13);
          --disc-fg: var(--mobile-text-secondary);
        }

        .info-row-accent {
          --disc-bg: var(--mobile-accent-soft);
          --disc-fg: var(--mobile-accent);
        }

        .info-row-warn {
          --disc-bg: rgba(214, 122, 20, 0.16);
          --disc-fg: #b8690c;
        }

        .info-row-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .info-row-title {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: var(--mobile-text);
          line-height: 1.3;
        }

        .info-row-subtitle {
          margin: 0;
          font-size: 13.5px;
          color: var(--mobile-text-secondary);
          line-height: 1.35;
          /* One line, clipped — these are summaries, not paragraphs. */
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .info-row-value {
          font-size: 16px;
          font-weight: 700;
          color: var(--mobile-text);
          font-variant-numeric: tabular-nums;
        }

        .info-row-chevron {
          flex: 0 0 auto;
          color: var(--mobile-text-secondary);
          opacity: 0.55;
          display: grid;
          place-items: center;
        }

        .info-row-body {
          padding: 0 16px 14px;
        }
      `}</style>
    </>
  )
}
