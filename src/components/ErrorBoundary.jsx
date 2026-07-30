import React from 'react'
import Icon from '../mobile/components/Icon'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App crashed:', error, errorInfo)

    // Log to crash reporter
    try {
      if (window.Sentry) {
        window.Sentry.captureException(error, { extra: errorInfo })
      }
    } catch (e) {
      console.error('Failed to log to crash reporter:', e)
    }

    this.setState({ errorInfo })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-screen">
          <div className="error-content">
            <div className="error-icon">
              <Icon name="alertTriangle" size={64} color="#ff3b30" />
            </div>

            <h1>Something went wrong</h1>

            <p className="error-message">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>

            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="error-details">
                <summary>Error Details (Development Only)</summary>
                <pre>{this.state.errorInfo.componentStack}</pre>
              </details>
            )}

            <div className="error-actions">
              <button className="btn-primary" onClick={this.handleReload}>
                <Icon name="refresh" size={20} color="white" />
                Reload App
              </button>

              <button className="btn-secondary" onClick={this.handleGoHome}>
                <Icon name="home" size={20} color="#0066cc" />
                Go to Home
              </button>
            </div>

            <p className="error-support">
              If this problem persists, please contact support at{' '}
              <a href="mailto:david@dhwebsiteservices.co.uk">
                david@dhwebsiteservices.co.uk
              </a>
            </p>
          </div>

          <style>{`
            .error-screen {
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
              background: linear-gradient(135deg, #f5f5f7 0%, #e8e8ed 100%);
            }

            .error-content {
              max-width: 500px;
              width: 100%;
              background: white;
              border-radius: 16px;
              padding: 40px;
              box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
              text-align: center;
            }

            .error-icon {
              margin-bottom: 24px;
              animation: shake 0.5s ease;
            }

            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              25% { transform: translateX(-10px); }
              75% { transform: translateX(10px); }
            }

            .error-content h1 {
              font-size: 24px;
              font-weight: 700;
              color: #1a1a1a;
              margin: 0 0 12px 0;
            }

            .error-message {
              font-size: 15px;
              color: #6b6158;
              margin: 0 0 24px 0;
              line-height: 1.5;
            }

            .error-details {
              background: #f5f5f7;
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 24px;
              text-align: left;
            }

            .error-details summary {
              cursor: pointer;
              font-weight: 600;
              color: #6b6158;
              font-size: 13px;
            }

            .error-details pre {
              margin-top: 12px;
              font-size: 11px;
              color: #ff3b30;
              overflow-x: auto;
              white-space: pre-wrap;
              word-wrap: break-word;
            }

            .error-actions {
              display: flex;
              flex-direction: column;
              gap: 12px;
              margin-bottom: 24px;
            }

            .error-actions button {
              width: 100%;
              padding: 14px;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 600;
              border: none;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
              transition: all 0.2s;
            }

            .btn-primary {
              background: #0066cc;
              color: white;
            }

            .btn-primary:hover {
              background: #0055aa;
            }

            .btn-primary:active {
              transform: scale(0.98);
            }

            .btn-secondary {
              background: white;
              color: #0066cc;
              border: 2px solid #0066cc;
            }

            .btn-secondary:hover {
              background: #f0f8ff;
            }

            .btn-secondary:active {
              transform: scale(0.98);
            }

            .error-support {
              font-size: 13px;
              color: #a8a096;
              margin: 0;
            }

            .error-support a {
              color: #0066cc;
              text-decoration: none;
            }

            .error-support a:hover {
              text-decoration: underline;
            }
          `}</style>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
