import { db } from '../db'
import type { Food, HealthLog, Workout } from '../db/types'

// Human-readable text exports for sharing with a coach. Each function returns
// a plain string the user can copy/paste — no JSON, no markdown table syntax.

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function trimNum(n: number): string {
  if (Number.isInteger(n)) return n.toString()
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/* -------------------- Fitness -------------------- */

// Lists every completed workout with each exercise's sets in
// "reps × weight @ RPE" form. Sets that were logged but never marked complete
// are skipped so the coach only sees what actually happened.
export async function exportFitnessText(): Promise<string> {
  const workouts = await db.workouts.orderBy('date').toArray()
  const completed = workouts.filter((w): w is Workout => w.completedAt !== undefined)

  if (completed.length === 0) return 'No completed workouts yet.\n'

  const lines: string[] = []
  lines.push(`Workout log — ${completed.length} ${completed.length === 1 ? 'workout' : 'workouts'}`)
  lines.push('Format: reps × weight lb @ RPE (RPE omitted if not logged)')
  lines.push('')

  for (const w of completed) {
    lines.push(`${formatDate(w.date)} — ${w.name}`)
    for (const ex of w.exercises) {
      const performed = ex.sets.filter((s) => s.completedAt !== undefined)
      if (performed.length === 0) continue
      lines.push(`  ${ex.exerciseName}`)
      for (const s of performed) {
        const rpe = s.rpe !== undefined ? ` @ RPE ${trimNum(s.rpe)}` : ''
        lines.push(`    ${s.reps} × ${trimNum(s.weight)} lb${rpe}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

/* -------------------- Health (weight only) -------------------- */

// Every weight entry since tracking started, oldest → newest, one per line.
export async function exportHealthText(): Promise<string> {
  const all = await db.health_logs.toArray()
  const weights = all
    .filter((l): l is HealthLog => l.type === 'weight')
    .sort((a, b) => a.date - b.date)

  if (weights.length === 0) return 'No weight entries logged yet.\n'

  const unit = weights[0].unit ?? 'lb'
  const lines: string[] = []
  lines.push(`Weight log — ${weights.length} ${weights.length === 1 ? 'entry' : 'entries'}`)
  lines.push('')
  for (const l of weights) {
    lines.push(`${formatDate(l.date)}  ${l.value.toFixed(1)} ${l.unit ?? unit}`)
  }

  return lines.join('\n')
}

/* -------------------- Macros (food library) -------------------- */

// The user's saved food library — per-serving macros for every food they've
// logged. Sorted by most-used so the coach sees staples first.
export async function exportMacrosText(): Promise<string> {
  const foods = await db.foods.toArray()
  if (foods.length === 0) return 'No foods logged yet.\n'

  const sorted = [...foods].sort((a, b) => {
    if (b.useCount !== a.useCount) return b.useCount - a.useCount
    return a.name.localeCompare(b.name)
  })

  const lines: string[] = []
  lines.push(`Food library — ${sorted.length} ${sorted.length === 1 ? 'food' : 'foods'}`)
  lines.push('Macros are per serving (calories · C carbs · P protein · F fat)')
  lines.push('')

  for (const f of sorted as Food[]) {
    const brand = f.brand ? ` (${f.brand})` : ''
    lines.push(`${f.name}${brand}`)
    lines.push(
      `  serving: ${f.servingSize}${f.servingGrams ? ` (${f.servingGrams} g)` : ''}`,
    )
    lines.push(
      `  ${Math.round(f.macros.calories)} kcal · C${Math.round(f.macros.carbs)} · P${Math.round(f.macros.protein)} · F${Math.round(f.macros.fat)}`,
    )
    if (f.useCount > 0) {
      lines.push(`  logged ${f.useCount}×`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}
