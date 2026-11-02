import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import './styles/athletic.css'
import { captureAuthRedirect } from './cloud/account/authRedirect'
import { accountsEnabled } from './cloud/config'
import { cleanUpGuestVisit } from './onboarding/guestMode'
import { captureInstallPrompt } from './pwa/install'
import { registerServiceWorker } from './pwa/serviceWorker'
import { applyLiteMode } from './settings/liteMode'

// Optional accounts: keep sign-in tokens from the URL before the router rewrites it.
if (accountsEnabled) captureAuthRedirect()

// Keep the browser's install offer for the Home page's Install button (it can fire before React mounts).
captureInstallPrompt()

// Lite mode cuts animations through a data attribute on <html>.
applyLiteMode()

// Guest mode keeps nothing between visits: remove the last visit's data before the app reads it.
void cleanUpGuestVisit().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

// Offline support and installability. A no-op in development; see pwa.config.ts.
registerServiceWorker()
