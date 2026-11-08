/**
 * The first screen while the app signs in and loads your profile. Styles are
 * inline so it never shows as bare text before the app's CSS is in place.
 */
export default function MobileLoader({ message = 'Getting things ready' }) {
  return (
    <div className="dh-boot" role="status" aria-live="polite">
      <img src="/dh-logo-icon.png" alt="" className="dh-boot__mark" />
      <div className="dh-boot__title">DH Staff Portal</div>
      <div className="dh-boot__track"><div className="dh-boot__bar" /></div>
      <div className="dh-boot__msg">{message}</div>
      <style>{`
        .dh-boot {
          position: fixed; inset: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 14px; padding: env(safe-area-inset-top) 24px env(safe-area-inset-bottom);
          background: #f4f6f8; color: #45464a;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .dh-boot__mark { width: 72px; height: 72px; border-radius: 18px; animation: dh-boot-pulse 1.6s ease-in-out infinite; }
        .dh-boot__title { font-size: 19px; font-weight: 700; letter-spacing: -0.2px; }
        .dh-boot__track { width: 140px; height: 4px; border-radius: 4px; background: rgba(69, 70, 74, 0.12); overflow: hidden; }
        .dh-boot__bar { width: 40%; height: 100%; border-radius: 4px; background: #44b5f9; animation: dh-boot-slide 1.1s ease-in-out infinite; }
        .dh-boot__msg { font-size: 13px; color: #7a7c82; }
        @keyframes dh-boot-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
        @keyframes dh-boot-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(0.94); } }
        @media (prefers-color-scheme: dark) {
          .dh-boot { background: #0f1419; color: #f1f2f4; }
          .dh-boot__track { background: rgba(255, 255, 255, 0.12); }
          .dh-boot__msg { color: #9a9ca3; }
        }
      `}</style>
    </div>
  )
}
