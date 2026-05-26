import { db } from '../db'
import type { EquipmentType, WorkoutTemplateExercise } from '../db/types'
import { addCustomExercise } from './fitness'

// PPLUL — 5 Day Split (Push / Pull / Legs / Upper / Lower).
// Each exercise carries its full prescription so running a day's template
// pre-loads the right number of sets with rest + rep-range + form notes.

interface ProgramExercise {
  name: string
  equipment: EquipmentType
  muscleGroups: string[]
  sets: number
  repLow: number
  repHigh: number
  restSec: number
  notes?: string
}

interface ProgramDay {
  name: string
  exercises: ProgramExercise[]
}

export const PPLUL_TEMPLATE_PREFIX = 'PPLUL'

const PPLUL_DAYS: ProgramDay[] = [
  {
    name: 'PPLUL · Push',
    exercises: [
      { name: 'Bench Press', equipment: 'barbell', muscleGroups: ['chest', 'triceps', 'shoulders'], sets: 4, repLow: 5, repHigh: 7, restSec: 180, notes: 'Main lift. RPE 7-8.' },
      { name: 'Incline Dumbbell Press', equipment: 'dumbbell', muscleGroups: ['chest', 'shoulders'], sets: 3, repLow: 8, repHigh: 10, restSec: 120 },
      { name: 'Dumbbell Shoulder Press', equipment: 'dumbbell', muscleGroups: ['shoulders', 'triceps'], sets: 3, repLow: 8, repHigh: 10, restSec: 120, notes: 'Seated.' },
      { name: 'Dumbbell Fly', equipment: 'dumbbell', muscleGroups: ['chest'], sets: 3, repLow: 12, repHigh: 15, restSec: 90, notes: 'Flat or incline. 3-sec eccentric for tension.' },
      { name: 'Lateral Raise', equipment: 'dumbbell', muscleGroups: ['shoulders'], sets: 4, repLow: 12, repHigh: 15, restSec: 60, notes: 'Light, strict.' },
      { name: 'Tricep Pushdown', equipment: 'cable', muscleGroups: ['triceps'], sets: 3, repLow: 10, repHigh: 12, restSec: 90, notes: 'Rope attachment.' },
      { name: 'Overhead Tricep Extension', equipment: 'dumbbell', muscleGroups: ['triceps'], sets: 3, repLow: 10, repHigh: 12, restSec: 90, notes: 'Single-arm — 10-12 per arm.' },
    ],
  },
  {
    name: 'PPLUL · Pull',
    exercises: [
      { name: 'Trap Bar Deadlift', equipment: 'barbell', muscleGroups: ['back', 'glutes', 'hamstrings'], sets: 3, repLow: 5, repHigh: 5, restSec: 180, notes: 'Start light, build form.' },
      { name: 'Pull-up', equipment: 'bodyweight', muscleGroups: ['back', 'biceps'], sets: 4, repLow: 5, repHigh: 8, restSec: 150, notes: 'Weighted. Bodyweight AMRAP if you can\'t add weight yet.' },
      { name: 'Chest-Supported Row', equipment: 'machine', muscleGroups: ['back', 'biceps'], sets: 3, repLow: 8, repHigh: 10, restSec: 120, notes: 'Dumbbell.' },
      { name: 'Lat Pulldown', equipment: 'cable', muscleGroups: ['back', 'biceps'], sets: 3, repLow: 10, repHigh: 12, restSec: 90, notes: 'Neutral grip.' },
      { name: 'Reverse Pec Deck', equipment: 'machine', muscleGroups: ['shoulders', 'back'], sets: 3, repLow: 15, repHigh: 15, restSec: 60, notes: 'Backup: rear delt DB flyes on incline.' },
      { name: 'Dumbbell Curl', equipment: 'dumbbell', muscleGroups: ['biceps'], sets: 3, repLow: 8, repHigh: 10, restSec: 90 },
      { name: 'Hammer Curl', equipment: 'dumbbell', muscleGroups: ['biceps'], sets: 3, repLow: 10, repHigh: 12, restSec: 90 },
    ],
  },
  {
    name: 'PPLUL · Legs',
    exercises: [
      { name: 'Back Squat', equipment: 'barbell', muscleGroups: ['quads', 'glutes'], sets: 4, repLow: 5, repHigh: 7, restSec: 180, notes: 'Main lift. Backup: Hack Squat 4×6-8.' },
      { name: 'Romanian Deadlift', equipment: 'barbell', muscleGroups: ['hamstrings', 'glutes'], sets: 3, repLow: 8, repHigh: 10, restSec: 150 },
      { name: 'Leg Press', equipment: 'machine', muscleGroups: ['quads', 'glutes'], sets: 3, repLow: 10, repHigh: 12, restSec: 120 },
      { name: 'Walking Lunge', equipment: 'dumbbell', muscleGroups: ['quads', 'glutes'], sets: 3, repLow: 10, repHigh: 10, restSec: 90, notes: 'Dumbbells — 10 per leg.' },
      { name: 'Leg Curl', equipment: 'machine', muscleGroups: ['hamstrings'], sets: 3, repLow: 10, repHigh: 12, restSec: 90 },
      { name: 'Calf Raise', equipment: 'machine', muscleGroups: ['calves'], sets: 4, repLow: 10, repHigh: 12, restSec: 60, notes: 'Standing.' },
    ],
  },
  {
    name: 'PPLUL · Upper',
    exercises: [
      { name: 'Overhead Press', equipment: 'barbell', muscleGroups: ['shoulders', 'triceps'], sets: 4, repLow: 6, repHigh: 8, restSec: 150, notes: 'Barbell, or seated DB if the rack is taken.' },
      { name: 'Dips', equipment: 'bodyweight', muscleGroups: ['chest', 'triceps'], sets: 3, repLow: 8, repHigh: 10, restSec: 120, notes: 'Weighted. Or close-grip bench.' },
      { name: 'Dumbbell Row', equipment: 'dumbbell', muscleGroups: ['back', 'biceps'], sets: 4, repLow: 8, repHigh: 10, restSec: 120, notes: 'One-arm — 8-10 per arm.' },
      { name: 'Incline Dumbbell Curl', equipment: 'dumbbell', muscleGroups: ['biceps'], sets: 3, repLow: 10, repHigh: 12, restSec: 90 },
      { name: 'Cable Lateral Raise', equipment: 'cable', muscleGroups: ['shoulders'], sets: 4, repLow: 12, repHigh: 15, restSec: 60, notes: 'Backup: DB laterals.' },
      { name: 'Tricep Dips', equipment: 'bodyweight', muscleGroups: ['triceps'], sets: 3, repLow: 10, repHigh: 15, restSec: 90, notes: 'Bench dips. Or DB skullcrusher.' },
      { name: 'Hanging Leg Raise', equipment: 'bodyweight', muscleGroups: ['core'], sets: 3, repLow: 10, repHigh: 15, restSec: 60 },
    ],
  },
  {
    name: 'PPLUL · Lower',
    exercises: [
      { name: 'Bulgarian Split Squat', equipment: 'dumbbell', muscleGroups: ['quads', 'glutes'], sets: 4, repLow: 8, repHigh: 8, restSec: 150, notes: 'Dumbbells — 8 per leg. Backup main if front squat rack taken.' },
      { name: 'Hip Thrust', equipment: 'barbell', muscleGroups: ['glutes'], sets: 3, repLow: 8, repHigh: 10, restSec: 120 },
      { name: 'Stiff-Leg Deadlift', equipment: 'barbell', muscleGroups: ['hamstrings', 'glutes'], sets: 3, repLow: 8, repHigh: 10, restSec: 120, notes: 'Dumbbell or barbell.' },
      { name: 'Leg Extension', equipment: 'machine', muscleGroups: ['quads'], sets: 3, repLow: 12, repHigh: 15, restSec: 90 },
      { name: 'Leg Curl', equipment: 'machine', muscleGroups: ['hamstrings'], sets: 3, repLow: 12, repHigh: 15, restSec: 90, notes: 'Seated.' },
      { name: 'Calf Raise', equipment: 'machine', muscleGroups: ['calves'], sets: 4, repLow: 12, repHigh: 15, restSec: 60, notes: 'Seated.' },
      { name: 'Decline Sit-up', equipment: 'bodyweight', muscleGroups: ['core'], sets: 3, repLow: 12, repHigh: 15, restSec: 60, notes: 'Weighted — hold a plate to your chest.' },
    ],
  },
]

// True when the PPLUL templates already exist (avoid double-installing).
export async function isPPLULInstalled(): Promise<boolean> {
  const count = await db.workout_templates
    .where('name')
    .startsWith(PPLUL_TEMPLATE_PREFIX)
    .count()
  return count > 0
}

// Install (or reinstall) the 5-day PPLUL program: match-or-create every
// exercise in the library, then create the 5 day templates with full
// prescriptions. Any existing PPLUL templates are replaced first, so
// re-running refreshes them to the latest program definition.
export async function installPPLULProgram(): Promise<void> {
  // Drop existing PPLUL templates so a re-run refreshes them.
  const stale = await db.workout_templates
    .where('name')
    .startsWith(PPLUL_TEMPLATE_PREFIX)
    .primaryKeys()
  if (stale.length > 0) {
    await db.workout_templates.bulkDelete(stale)
  }

  // Build a case-insensitive lookup of the existing library.
  const existing = await db.exercises.toArray()
  const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e]))

  const resolveExerciseId = async (ex: ProgramExercise): Promise<number> => {
    const found = byName.get(ex.name.toLowerCase())
    if (found?.id !== undefined) return found.id
    const created = await addCustomExercise({
      name: ex.name,
      muscleGroups: ex.muscleGroups,
      equipment: ex.equipment,
    })
    byName.set(ex.name.toLowerCase(), created)
    return created.id!
  }

  const now = Date.now()
  for (let i = 0; i < PPLUL_DAYS.length; i++) {
    const day = PPLUL_DAYS[i]
    const exercises: WorkoutTemplateExercise[] = []
    for (const ex of day.exercises) {
      const exerciseId = await resolveExerciseId(ex)
      exercises.push({
        exerciseId,
        exerciseName: ex.name,
        targetSets: ex.sets,
        repLow: ex.repLow,
        repHigh: ex.repHigh,
        restSec: ex.restSec,
        ...(ex.notes ? { notes: ex.notes } : {}),
      })
    }
    await db.workout_templates.add({
      name: day.name,
      exercises,
      // Stagger createdAt so the list shows Push → Pull → Legs → Upper → Lower
      // (the templates list renders newest-first).
      createdAt: now + (PPLUL_DAYS.length - i),
      useCount: 0,
    })
  }
}
