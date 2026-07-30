import { Haptics, ImpactStyle } from '@capacitor/haptics'

export default function MobileCard({ children, onPress, small, highlight, className = '' }) {
  const handlePress = async () => {
    if (onPress) {
      await Haptics.impact({ style: ImpactStyle.Light })
      onPress()
    }
  }

  const classes = [
    'mobile-card',
    small && 'mobile-card-small',
    highlight && 'mobile-card-highlight',
    onPress && 'mobile-card-pressable',
    className
  ].filter(Boolean).join(' ')

  return (
    <>
      <div className={classes} onClick={handlePress}>
        {children}
      </div>

      <style>{`
        .mobile-card {
          background: var(--mobile-card);
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          transition: all 0.2s ease;
        }

        .mobile-card-small {
          padding: 16px;
        }

        .mobile-card-highlight {
          border: 2px solid var(--mobile-accent);
          background: linear-gradient(135deg, var(--mobile-card) 0%, rgba(184, 150, 12, 0.05) 100%);
        }

        .mobile-card-pressable {
          cursor: pointer;
        }

        .mobile-card-pressable:active {
          transform: scale(0.98);
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </>
  )
}
