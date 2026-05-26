// Lightweight client for the Open Food Facts API.
//
// Endpoint: https://world.openfoodfacts.org/api/v2/product/<barcode>.json
//
// No API key needed. Coverage is strong on packaged goods (cereal, snacks,
// drinks, frozen) and weaker on restaurant / fresh food. If the lookup
// misses, the caller should fall back to the manual New Food form.

export interface OFFProduct {
  name: string
  brand?: string
  servingSize: string
  macros: {
    calories: number
    protein: number
    carbs: number
    fat: number
  }
}

export type OFFResult =
  | { kind: 'found'; product: OFFProduct }
  | { kind: 'not-found' }
  | { kind: 'no-macros' } // product exists in OFF but lacks the macro fields we need
  | { kind: 'error'; message: string }

interface OFFNutriments {
  // OFF returns per-100g, per-serving, and sometimes legacy keys. We try
  // both per-serving and per-100g and pick the most useful set.
  'energy-kcal_serving'?: number
  'proteins_serving'?: number
  'carbohydrates_serving'?: number
  'fat_serving'?: number
  'energy-kcal_100g'?: number
  'proteins_100g'?: number
  'carbohydrates_100g'?: number
  'fat_100g'?: number
}

interface OFFResponse {
  status: 0 | 1
  product?: {
    product_name?: string
    product_name_en?: string
    generic_name?: string
    brands?: string
    serving_size?: string
    serving_quantity?: string | number
    nutriments?: OFFNutriments
  }
}

export async function lookupBarcode(barcode: string): Promise<OFFResult> {
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
  }

  if (!res.ok) {
    if (res.status === 404) return { kind: 'not-found' }
    return { kind: 'error', message: `HTTP ${res.status}` }
  }

  let data: OFFResponse
  try {
    data = (await res.json()) as OFFResponse
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
  }

  if (data.status !== 1 || !data.product) {
    return { kind: 'not-found' }
  }

  const p = data.product
  const nut = p.nutriments ?? {}

  const servingQty =
    typeof p.serving_quantity === 'number'
      ? p.serving_quantity
      : parseFloat(p.serving_quantity ?? '') || 0

  const haveServing =
    nut['energy-kcal_serving'] !== undefined ||
    nut['proteins_serving'] !== undefined

  const get = (
    servingKey: keyof OFFNutriments,
    per100Key: keyof OFFNutriments,
  ): number => {
    if (haveServing) return Number(nut[servingKey]) || 0
    const per100 = Number(nut[per100Key]) || 0
    return servingQty > 0 ? per100 * (servingQty / 100) : per100
  }

  const calories = get('energy-kcal_serving', 'energy-kcal_100g')
  const protein = get('proteins_serving', 'proteins_100g')
  const carbs = get('carbohydrates_serving', 'carbohydrates_100g')
  const fat = get('fat_serving', 'fat_100g')

  if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
    return { kind: 'no-macros' }
  }

  const name =
    p.product_name?.trim() ||
    p.product_name_en?.trim() ||
    p.generic_name?.trim() ||
    'Unknown product'

  const servingSize =
    p.serving_size?.trim() ||
    (servingQty > 0 ? `${servingQty} g` : '1 serving')

  return {
    kind: 'found',
    product: {
      name,
      brand: p.brands?.split(',')[0].trim() || undefined,
      servingSize,
      macros: {
        calories: Math.round(calories * 10) / 10,
        protein: Math.round(protein * 10) / 10,
        carbs: Math.round(carbs * 10) / 10,
        fat: Math.round(fat * 10) / 10,
      },
    },
  }
}
