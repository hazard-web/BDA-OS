import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import AntdProvider from './components/AntdProvider'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './theme/pulse-tokens.css'
import './theme/pulse-dark.css'
import './theme/pulse-close.css'

// Automatically unregister any active service worker from previous PWA installations.
// This prevents old cached service workers from intercepting new portal routes.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister())
  })
}
if ('caches' in window) {
  caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ThemeProvider>
          <AntdProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </AntdProvider>
        </ThemeProvider>
        <Toaster
          position="top-center"
          gutter={12}
          containerStyle={{ top: 20 }}
          toastOptions={{
            duration: 3500,
            className: 'pos-toast-default',
            style: {
              fontFamily: "'Nunito Sans', 'Segoe UI', system-ui, sans-serif",
              fontSize: '15px',
              fontWeight: 600,
              color: '#111',
              background: '#fff',
              border: '1px solid #e8eaed',
              borderRadius: '12px',
              boxShadow: '0 14px 36px rgba(15, 23, 42, 0.14)',
              padding: '14px 18px',
              minWidth: '280px',
              maxWidth: '420px',
            },
            success: {
              iconTheme: { primary: '#15bc83', secondary: '#ffffff' },
            },
            error: {
              iconTheme: { primary: '#e42527', secondary: '#ffffff' },
            },
          }}
        />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
