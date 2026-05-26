// Push + local-notification helpers for LifeOS.
//
// Real push (scheduled reminders fired by the Vercel cron) requires:
//   1. VITE_VAPID_PUBLIC_KEY in the client build env
//   2. /api/subscribe deployed (server-side stores the subscription)
//   3. SW push event handler (see public/sw.js)
//
// Local in-app cues (PR notifications, rest-timer done) don't need any of
// the above — they just use the granted permission to fire a notification
// while the app is open.

export type NotificationState =
  | { kind: 'unsupported' }
  | { kind: 'needs-permission' }
  | { kind: 'denied' }
  | { kind: 'no-subscription' }
  | { kind: 'subscribed'; endpoint: string }

const VAPID_PUBLIC_KEY = (
  import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''
).trim()

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export async function getNotificationState(): Promise<NotificationState> {
  if (!isPushSupported()) return { kind: 'unsupported' }
  if (Notification.permission === 'denied') return { kind: 'denied' }
  if (Notification.permission === 'default') return { kind: 'needs-permission' }

  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { kind: 'no-subscription' }
  return { kind: 'subscribed', endpoint: sub.endpoint }
}

export async function enableNotifications(): Promise<void> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser.')
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error(
      'Missing VITE_VAPID_PUBLIC_KEY. Set it in your Vercel env vars and redeploy.',
    )
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  })
  if (!res.ok) {
    throw new Error(`/api/subscribe failed: ${res.status}`)
  }
}

export async function disableNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (sub) {
    // Tell the server to forget the endpoint, then unsubscribe locally.
    try {
      await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'unsubscribe' }),
      })
    } catch {
      /* still unsubscribe locally even if the server call fails */
    }
    await sub.unsubscribe()
  }
}

// Fire a notification right now (no push server involved). Used for in-app
// cues like "PR set!" or "rest timer done." Requires Notification permission
// already granted — silently does nothing otherwise.
export function fireLocalNotification(title: string, body: string): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  // Prefer the SW path so the notification behaves identically to a real
  // push (consistent styling, click handler routing).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification(title, {
          body,
          icon: '/favicon.svg',
          badge: '/favicon.svg',
          tag: 'lifeos-local',
        }),
      )
      .catch(() => {
        try {
          new Notification(title, { body, icon: '/favicon.svg' })
        } catch {
          /* noop */
        }
      })
    return
  }

  try {
    new Notification(title, { body, icon: '/favicon.svg' })
  } catch {
    /* noop */
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const arr = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i)
  return arr
}
