import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.tsx'

// Apply persisted theme before React mounts (prevents flash).
if (localStorage.getItem('lifeos:theme') === 'light') {
  document.documentElement.dataset.theme = 'light'
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
if (!googleClientId) {
  console.warn(
    'VITE_GOOGLE_CLIENT_ID is not set — Google sign-in will not work. Add it to .env.local and restart `npm run dev`.',
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)

// Register the shell service worker (production only — dev uses HMR).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
