import Icon from './Icon'

export default function ErrorAlert({ error, onRetry, onDismiss }) {
  if (!error) return null

  return (
    <div className="error-alert">
      <div className="error-alert-content">
        <Icon name="alertTriangle" size={20} color="#ff3b30" />
        <div className="error-alert-text">
          <strong>Error</strong>
          <p>{error}</p>
        </div>
        {onDismiss && (
          <button className="error-alert-close" onClick={onDismiss}>
            <Icon name="x" size={16} color="#6b6158" />
          </button>
        )}
      </div>

      {onRetry && (
        <button className="error-alert-retry" onClick={onRetry}>
          Retry
        </button>
      )}

      <style>{`
        .error-alert {
          margin: 16px 20px;
          background: #fff3f3;
          border: 1px solid #ff3b30;
          border-radius: 8px;
          overflow: hidden;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .error-alert-content {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
        }

        .error-alert-text {
          flex: 1;
        }

        .error-alert-text strong {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #ff3b30;
          margin-bottom: 4px;
        }

        .error-alert-text p {
          font-size: 13px;
          color: #6b6158;
          margin: 0;
          line-height: 1.4;
        }

        .error-alert-close {
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .error-alert-close:hover {
          opacity: 1;
        }

        .error-alert-retry {
          width: 100%;
          padding: 12px;
          background: #ff3b30;
          color: white;
          border: none;
          border-top: 1px solid rgba(0, 0, 0, 0.1);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .error-alert-retry:hover {
          background: #e63027;
        }

        .error-alert-retry:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  )
}
