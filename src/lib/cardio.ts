import { db } from '../db'
import type { CardioKind } from '../db/types'

export const CARDIO_LABELS: Record<CardioKind, string> = {
  liss: 'Zone 2 / LISS',
  hiit: 'HIIT',
}

// Suggested modalities per kind — used as quick-pick chips in the log sheet.
export const CARDIO_MODALITIES: Record<CardioKind, string[]> = {
  liss: ['Incline walk', 'Bike', 'Stairmaster', 'Row'],
  hiit: ['Bike', 'Row', 'Sprints'],
}

export async function addCardioSession(input: {
  kind: CardioKind
  durationMin: number
  modality?: string
  notes?: string
}): Promise<number> {
  const now = Date.now()
  const id = await db.cardio_sessions.add({
    date: now,
    kind: input.kind,
    durationMin: input.durationMin,
    ...(input.modality?.trim()
      ? { modality: input.modality.trim() }
      : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    createdAt: now,
  })
  return id as number
}

export async function deleteCardioSession(id: number): Promise<void> {
  await db.cardio_sessions.delete(id)
}
