import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import './styles/athletic.css'
import { captureAuthRedirect } from './cloud/account/authRedirect'
import { accountsEnabled } from './cloud/config'

// Optional accounts: keep sign-in tokens from the URL before the router rewrites it.
if (accountsEnabled) captureAuthRedirect()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
