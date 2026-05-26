import { useEffect, useRef, useState } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import {
  GOOGLE_SCOPES,
  fetchUserInfo,
  isExpired,
  revokeAndClear,
  setAuth,
  type GoogleAuth,
} from '../lib/google'

// Renew 5 minutes before the access token expires, so requests in flight
// don't 401 in the gap.
const RENEW_BUFFER_MS = 5 * 60_000

export function GoogleAuthButton() {
  const setting = useLiveQuery(() => db.settings.get('google_auth'))
  const auth = (setting?.value ?? null) as GoogleAuth | null
  const authed = !!auth && !isExpired(auth)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pending, setPending] = useState(false)
  // True while a silent (no-UI) token refresh is in flight. Suppresses the
  // "Sign in" button so a brief refresh moment doesn't flash a stale UI.
  const [silentAttempting, setSilentAttempting] = useState(false)

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: GOOGLE_SCOPES.join(' '),
    onSuccess: async (tr) => {
      try {
        const user = await fetchUserInfo(tr.access_token)
        await setAuth({
          accessToken: tr.access_token,
          expiresAt: Date.now() + (tr.expires_in - 30) * 1000,
          scopes: (tr.scope ?? '').split(' ').filter(Boolean),
          user,
        })
      } catch (err) {
        console.error('sign-in user lookup failed', err)
      } finally {
        setPending(false)
      }
    },
    onError: (err) => {
      console.error('google sign-in failed', err)
      setPending(false)
    },
  })

  // Silent renewal — same scopes, prompt:'none' means "if my Google session
  // is still alive, give me a new token without showing UI." Fires:
  //   - on mount if the saved token is past or near expiry
  //   - on a timer set to fire 5 min before the live token's expiry
  // If silent fails (signed out of Google, iOS wiped cookies, etc.), the
  // existing token is left alone and the user eventually sees the manual
  // sign-in button after it expires.
  const loginSilent = useGoogleLogin({
    flow: 'implicit',
    scope: GOOGLE_SCOPES.join(' '),
    // 'none' means STRICTLY silent — Google must NOT show any UI; if it
    // can't refresh silently (signed out, missing consent, iOS cookies
    // wiped) it returns an error and we leave the existing token alone.
    prompt: 'none',
    onSuccess: async (tr) => {
      try {
        // Reuse cached user identity — silent renewal doesn't change who
        // you are, and skipping the fetch saves a round trip + avoids a
        // failure mode where the fetch dies mid-renewal.
        const user = auth?.user ?? (await fetchUserInfo(tr.access_token))
        await setAuth({
          accessToken: tr.access_token,
          expiresAt: Date.now() + (tr.expires_in - 30) * 1000,
          scopes: (tr.scope ?? '').split(' ').filter(Boolean),
          user,
        })
      } catch (err) {
        console.error('silent renewal write failed', err)
      } finally {
        setSilentAttempting(false)
      }
    },
    onError: () => {
      // Silent renewal failed — leave the existing token alone, let the UI
      // surface the sign-in button when the user manually needs it.
      setSilentAttempting(false)
    },
  })

  // Keep loginSilent reachable from the effect without re-firing it every
  // render (the function identity from useGoogleLogin can shift).
  const loginSilentRef = useRef(loginSilent)
  loginSilentRef.current = loginSilent

  useEffect(() => {
    if (!auth) return
    const msUntilExpiry = auth.expiresAt - Date.now()

    if (msUntilExpiry <= RENEW_BUFFER_MS) {
      // Already expired or close — refresh now.
      setSilentAttempting(true)
      loginSilentRef.current()
      return
    }

    // Schedule a one-shot refresh 5 minutes before expiry.
    const handle = window.setTimeout(() => {
      setSilentAttempting(true)
      loginSilentRef.current()
    }, msUntilExpiry - RENEW_BUFFER_MS)
    return () => window.clearTimeout(handle)
  }, [auth])

  if (!authed && !silentAttempting) {
    return (
      <button
        onClick={() => {
          setPending(true)
          login()
        }}
        disabled={pending}
        className="absolute right-14 top-3 z-10 grid h-8 place-items-center rounded-full border border-border bg-surface/70 px-3 text-xs font-medium text-fg backdrop-blur hover:border-border-strong disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    )
  }

  const initial = auth?.user?.name?.[0]?.toUpperCase() ?? '?'
  return (
    <>
      <button
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Account"
        className="absolute right-14 top-3 z-10 grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-border bg-surface text-xs font-medium text-fg hover:border-border-strong"
      >
        {auth?.user?.picture ? (
          <img
            src={auth.user.picture}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initial
        )}
      </button>
      {menuOpen && (
        <div className="absolute right-3 top-14 z-20 w-60 rounded-[12px] border border-border bg-surface p-3 shadow-card">
          <div className="text-xs text-muted">Signed in as</div>
          <div className="truncate text-sm text-fg">{auth?.user?.email}</div>
          <button
            onClick={async () => {
              await revokeAndClear()
              setMenuOpen(false)
            }}
            className="mt-3 w-full rounded-[8px] border border-border px-2 py-1.5 text-sm text-fg hover:border-border-strong"
          >
            Sign out
          </button>
        </div>
      )}
    </>
  )
}
