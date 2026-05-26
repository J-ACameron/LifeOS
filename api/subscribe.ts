// POST /api/subscribe
//
// Stores the push subscription in Vercel KV so the cron job (api/push) can
// send notifications to this device.
//
// Body:
//   { subscription: PushSubscriptionJSON }    — save / update
//   { action: 'unsubscribe' }                 — clear stored subscription

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

const KEY = 'push:subscription'

export const config = { runtime: 'nodejs' }

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  let body: { subscription?: unknown; action?: string }
  if (typeof req.body === 'string') {
    try {
      body = JSON.parse(req.body)
    } catch {
      res.status(400).json({ error: 'bad_json' })
      return
    }
  } else if (req.body && typeof req.body === 'object') {
    body = req.body as typeof body
  } else {
    res.status(400).json({ error: 'bad_json' })
    return
  }

  if (body.action === 'unsubscribe') {
    await kv.del(KEY)
    res.status(200).json({ ok: true })
    return
  }

  if (!body.subscription) {
    res.status(400).json({ error: 'missing_subscription' })
    return
  }

  await kv.set(KEY, body.subscription)
  res.status(200).json({ ok: true })
}
