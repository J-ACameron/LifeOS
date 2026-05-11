import { db } from '../db'

const BACKUP_VERSION = 1

// Settings that hold device-specific secrets. Excluded from exports so the
// backup is safe to paste into a note, email, or cloud doc. Preserved during
// restore so signing back in / re-pasting the API key isn't required after
// every restore.
const SENSITIVE_SETTING_KEYS = ['anthropic_api_key', 'google_auth']

export interface Backup {
  version: number
  exportedAt: string
  schemaVersion: number
  counts: Record<string, number>
  data: {
    settings: unknown[]
    tasks: unknown[]
    workouts: unknown[]
    meals: unknown[]
    transactions: unknown[]
    habits: unknown[]
    goals: unknown[]
    health_logs: unknown[]
    chat_history: unknown[]
    cached_briefs: unknown[]
    foods: unknown[]
    meal_entries: unknown[]
  }
}

export async function exportAll(): Promise<Backup> {
  const allSettings = await db.settings.toArray()
  const settings = allSettings.filter(
    (s) => !SENSITIVE_SETTING_KEYS.includes(s.key),
  )
  const [
    tasks, workouts, meals, transactions, habits, goals,
    healthLogs, chatHistory, cachedBriefs, foods, mealEntries,
  ] = await Promise.all([
    db.tasks.toArray(),
    db.workouts.toArray(),
    db.meals.toArray(),
    db.transactions.toArray(),
    db.habits.toArray(),
    db.goals.toArray(),
    db.health_logs.toArray(),
    db.chat_history.toArray(),
    db.cached_briefs.toArray(),
    db.foods.toArray(),
    db.meal_entries.toArray(),
  ])

  const data = {
    settings,
    tasks,
    workouts,
    meals,
    transactions,
    habits,
    goals,
    health_logs: healthLogs,
    chat_history: chatHistory,
    cached_briefs: cachedBriefs,
    foods,
    meal_entries: mealEntries,
  }

  const counts: Record<string, number> = {}
  for (const [k, v] of Object.entries(data)) counts[k] = v.length

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: db.verno,
    counts,
    data,
  }
}

interface ImportableTable<T> {
  clear(): Promise<void>
  bulkAdd(items: T[]): Promise<unknown>
}

export async function importAll(rawJson: string): Promise<Backup['counts']> {
  let parsed: Backup
  try {
    parsed = JSON.parse(rawJson) as Backup
  } catch {
    throw new Error('Not valid JSON.')
  }
  if (parsed.version !== BACKUP_VERSION) {
    throw new Error(
      `Backup format ${parsed.version} not supported (expected ${BACKUP_VERSION}).`,
    )
  }
  if (!parsed.data) throw new Error('Invalid backup: missing data field.')

  const d = parsed.data

  await db.transaction(
    'rw',
    [
      db.settings, db.tasks, db.workouts, db.meals, db.transactions,
      db.habits, db.goals, db.health_logs, db.chat_history,
      db.cached_briefs, db.foods, db.meal_entries,
    ],
    async () => {
      // Preserve sensitive settings — clear only non-sensitive ones.
      const allSettings = await db.settings.toArray()
      for (const s of allSettings) {
        if (!SENSITIVE_SETTING_KEYS.includes(s.key)) {
          await db.settings.delete(s.key)
        }
      }

      // Wipe every other table.
      await Promise.all([
        db.tasks.clear(),
        db.workouts.clear(),
        db.meals.clear(),
        db.transactions.clear(),
        db.habits.clear(),
        db.goals.clear(),
        db.health_logs.clear(),
        db.chat_history.clear(),
        db.cached_briefs.clear(),
        db.foods.clear(),
        db.meal_entries.clear(),
      ])

      // Restore.
      const restore = async <T,>(table: ImportableTable<T>, items: unknown) => {
        const arr = (items as T[] | undefined) ?? []
        if (arr.length) await table.bulkAdd(arr)
      }
      await restore(db.settings, d.settings)
      await restore(db.tasks, d.tasks)
      await restore(db.workouts, d.workouts)
      await restore(db.meals, d.meals)
      await restore(db.transactions, d.transactions)
      await restore(db.habits, d.habits)
      await restore(db.goals, d.goals)
      await restore(db.health_logs, d.health_logs)
      await restore(db.chat_history, d.chat_history)
      await restore(db.cached_briefs, d.cached_briefs)
      await restore(db.foods, d.foods)
      await restore(db.meal_entries, d.meal_entries)
    },
  )

  return parsed.counts
}
