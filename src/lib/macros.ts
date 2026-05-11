import { db, getSetting, setSetting } from '../db'
import type { Food, Macros, MealEntry } from '../db/types'
import { startOfToday } from './health'

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
}

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat'

interface MacroGoalConfig {
  settingKey: string
  default: number
  unit: string
  label: string
}

export const MACRO_GOALS: Record<MacroKey, MacroGoalConfig> = {
  calories: { settingKey: 'goal_calories', default: 2200, unit: '', label: 'Calories' },
  protein: { settingKey: 'goal_protein_g', default: 150, unit: 'g', label: 'Protein' },
  carbs: { settingKey: 'goal_carbs_g', default: 250, unit: 'g', label: 'Carbs' },
  fat: { settingKey: 'goal_fat_g', default: 70, unit: 'g', label: 'Fat' },
}

export async function getMacroGoal(key: MacroKey): Promise<number> {
  const stored = await getSetting<number>(MACRO_GOALS[key].settingKey)
  return stored ?? MACRO_GOALS[key].default
}

export async function setMacroGoal(key: MacroKey, value: number): Promise<void> {
  await setSetting(MACRO_GOALS[key].settingKey, value)
}

export const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }

export function sumMacros(entries: MealEntry[]): Macros {
  return entries.reduce<Macros>(
    (acc, e) => ({
      calories: acc.calories + e.macros.calories,
      protein: acc.protein + e.macros.protein,
      carbs: acc.carbs + e.macros.carbs,
      fat: acc.fat + e.macros.fat,
    }),
    { ...ZERO_MACROS },
  )
}

export function scaleMacros(macros: Macros, servings: number): Macros {
  return {
    calories: macros.calories * servings,
    protein: macros.protein * servings,
    carbs: macros.carbs * servings,
    fat: macros.fat * servings,
  }
}

export async function addMealEntry(
  type: MealType,
  food: Food,
  servings: number,
  date: number = startOfToday(),
): Promise<void> {
  const macros = scaleMacros(food.macros, servings)
  await db.meal_entries.add({
    date,
    type,
    foodId: food.id!,
    foodName: food.name,
    servings,
    macros,
    createdAt: Date.now(),
  })
  await db.foods.update(food.id!, {
    lastUsedAt: Date.now(),
    useCount: (food.useCount ?? 0) + 1,
  })
}

export async function deleteMealEntry(id: number): Promise<void> {
  await db.meal_entries.delete(id)
}

export type NewFood = Omit<Food, 'id' | 'createdAt' | 'useCount' | 'lastUsedAt'>

export async function addFood(food: NewFood): Promise<Food> {
  const createdAt = Date.now()
  const id = await db.foods.add({ ...food, createdAt, useCount: 0 })
  return { ...food, id: id as number, createdAt, useCount: 0 }
}

export async function deleteFood(id: number): Promise<void> {
  await db.foods.delete(id)
}
