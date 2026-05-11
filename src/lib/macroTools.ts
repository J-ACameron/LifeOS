import { db } from '../db'
import { startOfToday } from './health'
import { addFood, scaleMacros } from './macros'
import type { MealType } from './macros'
import type { AppTool } from './anthropic'

const MEAL_VALUES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

const logFromLibrary: AppTool = {
  name: 'log_food_from_library',
  description: `Log a food the user has previously saved in their library. Macros come from the library entry — they're the user's own saved values. Use this when the food name matches one in their library (case-insensitive). NEVER use this for foods not in the library.`,
  inputSchema: {
    type: 'object',
    properties: {
      meal: {
        type: 'string',
        enum: MEAL_VALUES,
        description: 'Meal slot to log to',
      },
      food_name: {
        type: 'string',
        description: "Exact name of the food in the user's library (case-insensitive match)",
      },
      servings: {
        type: 'number',
        description: 'Number of servings (e.g. 1, 0.5, 2)',
      },
    },
    required: ['meal', 'food_name', 'servings'],
  },
  handler: async (raw: unknown) => {
    const input = raw as { meal: MealType; food_name: string; servings: number }
    const food = await db.foods
      .filter((f) => f.name.toLowerCase() === input.food_name.toLowerCase())
      .first()
    if (!food) {
      return `Error: "${input.food_name}" is not in the user's food library. Use log_new_food instead, or ask the user for macros first.`
    }
    const totalMacros = scaleMacros(food.macros, input.servings)
    await db.meal_entries.add({
      date: startOfToday(),
      type: input.meal,
      foodId: food.id!,
      foodName: food.name,
      servings: input.servings,
      macros: totalMacros,
      createdAt: Date.now(),
    })
    await db.foods.update(food.id!, {
      lastUsedAt: Date.now(),
      useCount: (food.useCount ?? 0) + 1,
    })
    return `Logged ${input.servings}× ${food.name} to ${input.meal}: ${Math.round(totalMacros.calories)} kcal · P${Math.round(totalMacros.protein)}g C${Math.round(totalMacros.carbs)}g F${Math.round(totalMacros.fat)}g`
  },
}

const logNewFood: AppTool = {
  name: 'log_new_food',
  description: `Log a food NOT yet in the user's library AND save it for future use. The user must have explicitly stated the macros per serving. NEVER estimate, look up, or guess macros — that's making up data, which is forbidden. If the user mentioned a food without giving macros, ASK them first instead of calling this.`,
  inputSchema: {
    type: 'object',
    properties: {
      meal: { type: 'string', enum: MEAL_VALUES },
      name: { type: 'string', description: 'Food name as the user said it' },
      serving_size: {
        type: 'string',
        description: 'Free-text serving size (e.g. "1 medium", "100 g", "1 cup")',
      },
      servings: { type: 'number', description: 'Number of servings (e.g. 1, 2)' },
      calories: { type: 'number', description: 'Calories per single serving' },
      protein_g: { type: 'number', description: 'Protein grams per single serving' },
      carbs_g: { type: 'number', description: 'Carb grams per single serving' },
      fat_g: { type: 'number', description: 'Fat grams per single serving' },
    },
    required: [
      'meal', 'name', 'serving_size', 'servings',
      'calories', 'protein_g', 'carbs_g', 'fat_g',
    ],
  },
  handler: async (raw: unknown) => {
    const input = raw as {
      meal: MealType
      name: string
      serving_size: string
      servings: number
      calories: number
      protein_g: number
      carbs_g: number
      fat_g: number
    }
    // Add to library first
    const food = await addFood({
      name: input.name,
      servingSize: input.serving_size,
      macros: {
        calories: input.calories,
        protein: input.protein_g,
        carbs: input.carbs_g,
        fat: input.fat_g,
      },
    })
    const totalMacros = scaleMacros(food.macros, input.servings)
    await db.meal_entries.add({
      date: startOfToday(),
      type: input.meal,
      foodId: food.id!,
      foodName: food.name,
      servings: input.servings,
      macros: totalMacros,
      createdAt: Date.now(),
    })
    await db.foods.update(food.id!, {
      lastUsedAt: Date.now(),
      useCount: 1,
    })
    return `Logged ${input.servings}× ${food.name} (${input.serving_size}) to ${input.meal}: ${Math.round(totalMacros.calories)} kcal · P${Math.round(totalMacros.protein)}g C${Math.round(totalMacros.carbs)}g F${Math.round(totalMacros.fat)}g. Saved to library for future use.`
  },
}

export const MACRO_TOOLS: AppTool[] = [logFromLibrary, logNewFood]
