import { db, getSetting, setSetting, deleteSetting } from '../db'

export interface GoogleUser {
  email: string
  name: string
  picture: string
  sub: string
}

export interface GoogleAuth {
  accessToken: string
  expiresAt: number
  scopes: string[]
  user: GoogleUser
}

export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
]

const SETTINGS_KEY = 'google_auth'

export async function getAuth(): Promise<GoogleAuth | null> {
  const auth = await getSetting<GoogleAuth>(SETTINGS_KEY)
  if (!auth) return null
  return auth
}

export async function setAuth(auth: GoogleAuth): Promise<void> {
  await setSetting(SETTINGS_KEY, auth)
}

export async function clearAuth(): Promise<void> {
  await deleteSetting(SETTINGS_KEY)
}

export function isExpired(auth: GoogleAuth | null | undefined, skewMs = 60_000): boolean {
  if (!auth) return true
  return Date.now() >= auth.expiresAt - skewMs
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUser> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`)
  const data = await res.json()
  return {
    email: data.email,
    name: data.name,
    picture: data.picture,
    sub: data.sub,
  }
}

export async function revokeAndClear(): Promise<void> {
  const auth = await getAuth()
  if (auth?.accessToken) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(auth.accessToken)}`,
        { method: 'POST' },
      )
    } catch {
      // best-effort revoke
    }
  }
  await clearAuth()
}

// Helper: read auth from Dexie and run a fetch with the bearer token attached.
// Throws if there's no valid auth — caller should prompt sign-in.
export async function authedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const auth = await getAuth()
  if (!auth || isExpired(auth)) {
    throw new Error('not_authenticated')
  }
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${auth.accessToken}`)
  return fetch(input, { ...init, headers })
}

// Re-export the db so callers can subscribe via useLiveQuery if they prefer.
export { db }
