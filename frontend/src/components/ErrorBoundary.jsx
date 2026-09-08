import { Component } from 'react'
import '../pages/pulse-error.css'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch() {}

  handleReset = () => {
    this.setState({ error: null })
  }

  handleReload = () => {
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister())
      })
    }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="pulse-crash">
        <div className="pulse-crash-card">
          <h1>Couldn’t load</h1>
          <div className="pulse-crash-actions">
            <button type="button" className="pulse-crash-retry" onClick={this.handleReset}>
              Retry
            </button>
            <button type="button" className="pulse-crash-reload" onClick={this.handleReload}>
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
