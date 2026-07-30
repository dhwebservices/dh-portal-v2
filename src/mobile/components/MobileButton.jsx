import { Haptics, ImpactStyle } from '@capacitor/haptics'

export default function MobileButton({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  fullWidth = false,
  icon,
  loading = false
}) {
  const handlePress = async () => {
    if (!disabled && !loading && onPress) {
      await Haptics.impact({ style: ImpactStyle.Medium })
      onPress()
    }
  }

  const classes = [
    'mobile-btn',
    `mobile-btn-${variant}`,
    fullWidth && 'mobile-btn-full',
    disabled && 'mobile-btn-disabled',
    loading && 'mobile-btn-loading'
  ].filter(Boolean).join(' ')

  return (
    <>
      <button className={classes} onClick={handlePress} disabled={disabled || loading}>
        {loading && <span className="mobile-btn-spinner" />}
        {icon && !loading && <span className="mobile-btn-icon">{icon}</span>}
        <span className="mobile-btn-text">{children}</span>
      </button>

      <style>{`
        .mobile-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 48px;
          padding: 0 24px;
          border-radius: 12px;
          border: none;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .mobile-btn:active:not(.mobile-btn-disabled) {
          transform: scale(0.98);
        }

        .mobile-btn-full {
          width: 100%;
        }

        .mobile-btn-primary {
          background: var(--mobile-accent);
          color: white;
        }

        .mobile-btn-secondary {
          background: var(--mobile-card);
          color: var(--mobile-text);
          border: 1px solid var(--mobile-border);
        }

        .mobile-btn-danger {
          background: #ef4444;
          color: white;
        }

        .mobile-btn-success {
          background: #22c55e;
          color: white;
        }

        .mobile-btn-disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .mobile-btn-icon {
          font-size: 20px;
          display: flex;
          align-items: center;
        }

        .mobile-btn-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}
