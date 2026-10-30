import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import './styles/athletic.css'
import { captureAuthRedirect } from './cloud/account/authRedirect'
import { accountsEnabled } from './cloud/config'
import { registerServiceWorker } from './pwa/serviceWorker'
import { applyLiteMode } from './settings/liteMode'

// Optional accounts: keep sign-in tokens from the URL before the router rewrites it.
if (accountsEnabled) captureAuthRedirect()

// Lite mode cuts animations through a data attribute on <html>.
applyLiteMode()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support and installability. A no-op in development; see pwa.config.ts.
registerServiceWorker()
