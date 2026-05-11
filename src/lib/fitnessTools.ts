import { db } from '../db'
import {
  addExerciseToWorkout,
  addSet,
  finishWorkout,
  getActiveWorkout,
  isSetCompleted,
  startWorkout,
  updateSet,
} from './fitness'
import type { AppTool } from './anthropic'

const startWorkoutTool: AppTool = {
  name: 'start_workout',
  description: `Create a new active workout. Only one active workout allowed at a time — if one already exists, this returns an error and the user must finish or discard it first.`,
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Optional name (e.g. "Push Day", "Legs"). Defaults to "Workout".',
      },
    },
    required: [],
  },
  handler: async (raw: unknown) => {
    const input = raw as { name?: string }
    const existing = await getActiveWorkout()
    if (existing) {
      return `Error: an active workout "${existing.name}" already exists. Finish or discard it first, or just add exercises to it.`
    }
    await startWorkout(input.name ?? 'Workout')
    return `Started "${input.name ?? 'Workout'}". Ready to add exercises.`
  },
}

const addExerciseTool: AppTool = {
  name: 'add_exercise_to_workout',
  description: `Add an exercise to the user's active workout. Looks up the exercise in their library by name (case-insensitive). If no match, returns an error — direct the user to add custom exercises via the Fitness tab UI.`,
  inputSchema: {
    type: 'object',
    properties: {
      exercise_name: {
        type: 'string',
        description: "Exact name of an exercise in the user's library",
      },
    },
    required: ['exercise_name'],
  },
  handler: async (raw: unknown) => {
    const input = raw as { exercise_name: string }
    const active = await getActiveWorkout()
    if (!active) {
      return 'Error: no active workout. Call start_workout first.'
    }
    const exercise = await db.exercises
      .filter((e) => e.name.toLowerCase() === input.exercise_name.toLowerCase())
      .first()
    if (!exercise) {
      return `Error: "${input.exercise_name}" is not in the user's exercise library. Tell the user to add it manually via the exercise picker.`
    }
    await addExerciseToWorkout(active.id!, exercise)
    return `Added ${exercise.name} to ${active.name}.`
  },
}

const logSetTool: AppTool = {
  name: 'log_set',
  description: `Log a single completed set in the active workout. Use ONLY weight, reps, and RPE values the user has explicitly stated — do not estimate or fill in gaps. If the user said "8 reps", reps=8; if they didn't mention RPE, omit it (don't guess). The exercise must already be added to the workout (use add_exercise_to_workout first if needed).`,
  inputSchema: {
    type: 'object',
    properties: {
      exercise_name: {
        type: 'string',
        description: 'Exercise name as it appears in the active workout',
      },
      weight: { type: 'number', description: 'Weight in lb' },
      reps: { type: 'number', description: 'Number of reps' },
      rpe: {
        type: 'number',
        description: 'Rate of perceived exertion 1-10 (omit if user did not specify)',
      },
    },
    required: ['exercise_name', 'weight', 'reps'],
  },
  handler: async (raw: unknown) => {
    const input = raw as {
      exercise_name: string
      weight: number
      reps: number
      rpe?: number
    }
    const active = await getActiveWorkout()
    if (!active) return 'Error: no active workout. Call start_workout first.'
    const exIdx = active.exercises.findIndex(
      (e) => e.exerciseName.toLowerCase() === input.exercise_name.toLowerCase(),
    )
    if (exIdx === -1) {
      return `Error: "${input.exercise_name}" is not in the active workout. Add it first with add_exercise_to_workout.`
    }
    const ex = active.exercises[exIdx]
    const lastSet = ex.sets[ex.sets.length - 1]
    const isPlaceholder =
      lastSet &&
      !isSetCompleted(lastSet) &&
      lastSet.reps === 0 &&
      lastSet.weight === 0
    if (isPlaceholder) {
      // Replace the empty placeholder set
      await updateSet(active.id!, exIdx, ex.sets.length - 1, {
        weight: input.weight,
        reps: input.reps,
        rpe: input.rpe,
        completedAt: Date.now(),
      })
    } else {
      // Append a new set then update it
      await addSet(active.id!, exIdx)
      const refreshed = await db.workouts.get(active.id!)
      const newSetIdx = refreshed?.exercises[exIdx]?.sets.length
        ? refreshed.exercises[exIdx].sets.length - 1
        : 0
      await updateSet(active.id!, exIdx, newSetIdx, {
        weight: input.weight,
        reps: input.reps,
        rpe: input.rpe,
        completedAt: Date.now(),
      })
    }
    const rpeStr = input.rpe ? ` @ RPE ${input.rpe}` : ''
    return `Logged ${input.reps} × ${input.weight} lb${rpeStr} on ${ex.exerciseName}.`
  },
}

const finishWorkoutTool: AppTool = {
  name: 'finish_workout',
  description: `Complete the active workout, stamping its completion time and computing duration. Use only when the user explicitly says they're done.`,
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler: async () => {
    const active = await getActiveWorkout()
    if (!active) return 'Error: no active workout to finish.'
    await finishWorkout(active.id!)
    return `Finished "${active.name}".`
  },
}

export const FITNESS_TOOLS: AppTool[] = [
  startWorkoutTool,
  addExerciseTool,
  logSetTool,
  finishWorkoutTool,
]
