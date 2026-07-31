import { Component } from 'react'

export default class MobileErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Mobile App Error:', error, errorInfo)

    // TODO: Send to crash reporting service (Firebase Crashlytics)
    // logErrorToService(error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          background: '#f5f5f5',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '64px',
            marginBottom: '24px'
          }}>⚠️</div>

          <h1 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#1a1a1a',
            marginBottom: '12px'
          }}>
            Something went wrong
          </h1>

          <p style={{
            fontSize: '16px',
            color: '#666',
            marginBottom: '32px',
            lineHeight: '1.5'
          }}>
            The app encountered an unexpected error.
            Please try restarting the app.
          </p>

          {this.props.showError && this.state.error && (
            <pre style={{
              fontSize: '12px',
              padding: '16px',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: '8px',
              overflow: 'auto',
              maxWidth: '100%',
              textAlign: 'left',
              color: '#c53030'
            }}>
              {this.state.error.toString()}
            </pre>
          )}

          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '24px',
              padding: '14px 28px',
              background: '#0066cc',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Restart App
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
