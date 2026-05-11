import { useState } from 'react'
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

export function GoogleAuthButton() {
  const setting = useLiveQuery(() => db.settings.get('google_auth'))
  const auth = (setting?.value ?? null) as GoogleAuth | null
  const authed = !!auth && !isExpired(auth)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pending, setPending] = useState(false)

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

  if (!authed) {
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
