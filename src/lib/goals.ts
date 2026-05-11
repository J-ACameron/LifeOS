import { db } from '../db'
import type { Goal, GoalTerm } from '../db/types'

export const TERM_LABELS: Record<GoalTerm, string> = {
  short: 'Short term',
  mid: 'Mid term',
  long: 'Long term',
}

export const TERM_HINTS: Record<GoalTerm, string> = {
  short: 'next few weeks',
  mid: 'next few months',
  long: 'this year & beyond',
}

export const TERM_ORDER: GoalTerm[] = ['short', 'mid', 'long']

export interface NewGoalInput {
  title: string
  description?: string
  term: GoalTerm
  targetDate?: number
}

export interface UpdateGoalInput {
  title?: string
  description?: string
  term?: GoalTerm
  targetDate?: number
}

export async function addGoal(input: NewGoalInput): Promise<number> {
  const id = await db.goals.add({
    title: input.title,
    description: input.description,
    term: input.term,
    targetDate: input.targetDate,
    progress: 0,
    status: 'active',
    createdAt: Date.now(),
  })
  return id as number
}

export async function updateGoal(
  id: number,
  patch: UpdateGoalInput,
): Promise<void> {
  await db.goals.update(id, patch as Partial<Goal>)
}

export async function deleteGoal(id: number): Promise<void> {
  await db.transaction('rw', [db.goals, db.goal_journal], async () => {
    await db.goal_journal.where('goalId').equals(id).delete()
    await db.goals.delete(id)
  })
}

export async function markGoalComplete(id: number): Promise<void> {
  await db.goals.update(id, {
    status: 'completed',
    completedAt: Date.now(),
  })
}

export async function reactivateGoal(id: number): Promise<void> {
  await db.goals.update(id, {
    status: 'active',
    completedAt: undefined,
  })
}

export async function addJournalEntry(
  goalId: number,
  text: string,
): Promise<void> {
  const t = text.trim()
  if (!t) return
  await db.goal_journal.add({
    goalId,
    text: t,
    createdAt: Date.now(),
  })
}

export async function deleteJournalEntry(id: number): Promise<void> {
  await db.goal_journal.delete(id)
}

export function formatDeadline(targetDate: number, now: number = Date.now()): string {
  const days = Math.floor((targetDate - now) / 86_400_000)
  if (days < -1) return `${Math.abs(days)}d overdue`
  if (days === -1) return 'overdue'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 30) return `${days}d left`
  if (days < 365) {
    const months = Math.floor(days / 30)
    return `${months}mo left`
  }
  return new Date(targetDate).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  })
}

export function formatJournalDate(timestamp: number, now: number = Date.now()): string {
  const date = new Date(timestamp)
  const today = new Date(now)
  const yesterday = new Date(now - 86_400_000)
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  if (sameDate(date, today)) return `Today · ${time}`
  if (sameDate(date, yesterday)) return `Yesterday · ${time}`
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  })
}

function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
