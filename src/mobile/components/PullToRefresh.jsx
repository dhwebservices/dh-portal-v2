import Icon from './Icon'

export default function PullToRefresh({ isRefreshing, pullDistance }) {
  const THRESHOLD = 80
  const progress = Math.min((pullDistance / THRESHOLD) * 100, 100)
  const rotation = (progress / 100) * 360

  if (!isRefreshing && pullDistance === 0) return null

  return (
    <div className="pull-to-refresh" style={{ height: pullDistance || 60 }}>
      <div className="pull-to-refresh-content">
        {isRefreshing ? (
          <>
            <div className="spinner" />
            <span>Refreshing...</span>
          </>
        ) : (
          <>
            <div
              className="pull-icon"
              style={{
                transform: `rotate(${rotation}deg)`,
                opacity: progress / 100
              }}
            >
              <Icon name="refresh" size={24} color="#0066cc" />
            </div>
            <span style={{ opacity: progress / 100 }}>
              {progress >= 100 ? 'Release to refresh' : 'Pull to refresh'}
            </span>
          </>
        )}
      </div>

      <style>{`
        .pull-to-refresh {
          display: flex;
          align-items: center;
          justify-content: center;
          transition: height 0.2s ease;
        }

        .pull-to-refresh-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .pull-to-refresh-content span {
          font-size: 13px;
          color: #0066cc;
          font-weight: 600;
        }

        .pull-icon {
          transition: transform 0.2s ease, opacity 0.2s ease;
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 3px solid var(--mobile-border);
          border-top-color: #0066cc;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
