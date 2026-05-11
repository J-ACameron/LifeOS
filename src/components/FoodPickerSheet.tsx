import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Food } from "../db/types";
import {
  addFood,
  addMealEntry,
  MEAL_LABELS,
  scaleMacros,
  type MealType,
  type NewFood,
} from "../lib/macros";

type View = "list" | "new" | "servings";

interface Props {
  meal: MealType | null;
  onClose: () => void;
}

export default function FoodPickerSheet({ meal, onClose }: Props) {
  const open = meal !== null;
  const [renderMeal, setRenderMeal] = useState<MealType | null>(meal);
  useEffect(() => { if (meal !== null) setRenderMeal(meal); }, [meal]);

  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Food | null>(null);

  // Reset internal state when sheet opens.
  useEffect(() => {
    if (open) {
      setView("list");
      setQuery("");
      setPicked(null);
    }
  }, [open, renderMeal]);

  const allFoods = useLiveQuery(
    () => db.foods.orderBy("name").toArray(),
  ) ?? [];
  const recentFoods = useLiveQuery(
    () =>
      db.foods
        .orderBy("lastUsedAt")
        .reverse()
        .filter((f) => !!f.lastUsedAt)
        .limit(6)
        .toArray(),
  ) ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allFoods;
    return allFoods.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.brand?.toLowerCase().includes(q) ?? false),
    );
  }, [allFoods, query]);

  const onPick = (food: Food) => {
    setPicked(food);
    setView("servings");
  };

  const headerLabel =
    view === "new"
      ? "New food"
      : view === "servings"
      ? "Servings"
      : renderMeal
      ? `Add to ${MEAL_LABELS[renderMeal]}`
      : "Add food";

  return (
    <>
      <div
        onClick={onClose}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[88%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          {view === "list" ? (
            <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
              {headerLabel}
            </span>
          ) : (
            <button
              onClick={() => {
                setView("list");
                setPicked(null);
              }}
              className="text-base text-accent-fg"
            >
              ← Back
            </button>
          )}
          <button
            onClick={onClose}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>
        {view !== "list" && (
          <div className="px-[18px] pb-1 text-sm font-medium uppercase tracking-[0.04em] text-muted">
            {headerLabel}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          {view === "list" && (
            <ListView
              query={query}
              setQuery={setQuery}
              recent={recentFoods}
              all={filtered}
              showRecent={!query.trim()}
              onPick={onPick}
              onNewFood={() => setView("new")}
              onDeleteFood={(id) => db.foods.delete(id)}
            />
          )}

          {view === "new" && (
            <NewFoodForm
              initialName={query}
              onSave={async (food) => {
                const created = await addFood(food);
                setPicked(created);
                setView("servings");
              }}
            />
          )}

          {view === "servings" && picked && renderMeal && (
            <ServingsForm
              food={picked}
              onConfirm={async (servings) => {
                await addMealEntry(renderMeal, picked, servings);
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

/* -------------------- List view -------------------- */

function ListView({
  query, setQuery, recent, all, showRecent, onPick, onNewFood, onDeleteFood,
}: {
  query: string;
  setQuery: (s: string) => void;
  recent: Food[];
  all: Food[];
  showRecent: boolean;
  onPick: (f: Food) => void;
  onNewFood: () => void;
  onDeleteFood: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods…"
            className="w-full bg-transparent outline-none placeholder:text-subtle"
          />
        </div>
        <button
          onClick={onNewFood}
          className="grid h-10 w-10 place-items-center rounded-[10px] bg-accent text-[#0a160d]"
          aria-label="New food"
        >
          <PlusIcon />
        </button>
      </div>

      {showRecent && recent.length > 0 && (
        <div>
          <div className="mb-2 px-1.5 text-xs uppercase tracking-[0.08em] text-muted">
            Recent
          </div>
          <div className="space-y-1">
            {recent.map((f) => (
              <FoodRow key={f.id} food={f} onClick={() => onPick(f)} onDelete={() => onDeleteFood(f.id!)} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 px-1.5 text-xs uppercase tracking-[0.08em] text-muted">
          {showRecent ? "All foods" : "Results"}
        </div>
        {all.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border bg-surface px-3.5 py-6 text-center text-sm text-muted">
            {query.trim() ? `No matches for "${query}". ` : "No foods yet. "}
            <button
              onClick={onNewFood}
              className="text-accent-fg underline-offset-2 hover:underline"
            >
              Add a new food
            </button>
            .
          </div>
        ) : (
          <div className="space-y-1">
            {all.map((f) => (
              <FoodRow
                key={f.id}
                food={f}
                onClick={() => onPick(f)}
                onDelete={() => onDeleteFood(f.id!)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FoodRow({
  food, onClick, onDelete,
}: { food: Food; onClick: () => void; onDelete: () => void }) {
  return (
    <div className="group flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5 hover:border-border-strong">
      <button onClick={onClick} className="flex-1 min-w-0 text-left">
        <div className="text-sm leading-tight text-fg">
          {food.name}
          {food.brand && <span className="text-muted"> · {food.brand}</span>}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {food.servingSize} · {Math.round(food.macros.calories)} kcal · C
          {Math.round(food.macros.carbs)} P{Math.round(food.macros.protein)} F
          {Math.round(food.macros.fat)}
        </div>
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${food.name}" from library?`)) onDelete();
        }}
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"
        aria-label="Delete food"
      >
        <XIcon />
      </button>
    </div>
  );
}

/* -------------------- New-food form -------------------- */

function NewFoodForm({
  initialName, onSave,
}: { initialName: string; onSave: (food: NewFood) => void }) {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState("");
  const [servingSize, setServingSize] = useState("1 serving");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const valid = name.trim().length > 0 && servingSize.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      name: name.trim(),
      brand: brand.trim() || undefined,
      servingSize: servingSize.trim(),
      macros: {
        calories: parseNum(calories),
        protein: parseNum(protein),
        carbs: parseNum(carbs),
        fat: parseNum(fat),
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <Field label="Name" value={name} onChange={setName} placeholder="Banana" />
      <Field label="Brand (optional)" value={brand} onChange={setBrand} placeholder="Trader Joe's" />
      <Field
        label="Serving size"
        value={servingSize}
        onChange={setServingSize}
        placeholder="1 medium / 100 g / 1 cup"
      />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Calories" value={calories} onChange={setCalories} numeric />
        <Field label="Protein (g)" value={protein} onChange={setProtein} numeric />
        <Field label="Carbs (g)" value={carbs} onChange={setCarbs} numeric />
        <Field label="Fat (g)" value={fat} onChange={setFat} numeric />
      </div>

      <button
        type="submit"
        disabled={!valid}
        className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
          valid ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
        }`}
      >
        Save & pick servings
      </button>
    </form>
  );
}

function Field({
  label, value, onChange, placeholder, numeric,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">{label}</span>
      <input
        type={numeric ? "number" : "text"}
        inputMode={numeric ? "decimal" : undefined}
        step={numeric ? "any" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
      />
    </label>
  );
}

/* -------------------- Servings form -------------------- */

function ServingsForm({
  food, onConfirm,
}: { food: Food; onConfirm: (servings: number) => void }) {
  const [servings, setServings] = useState("1");
  const n = parseFloat(servings);
  const valid = !Number.isNaN(n) && n > 0;
  const totals = valid ? scaleMacros(food.macros, n) : food.macros;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valid) onConfirm(n);
  };

  return (
    <form onSubmit={submit} className="space-y-4 pt-2">
      <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
        <div className="text-base font-medium leading-tight text-fg">
          {food.name}
          {food.brand && <span className="text-muted"> · {food.brand}</span>}
        </div>
        <div className="mt-0.5 font-mono text-xs text-muted">
          per {food.servingSize}: {Math.round(food.macros.calories)} kcal · C
          {Math.round(food.macros.carbs)} P{Math.round(food.macros.protein)} F
          {Math.round(food.macros.fat)}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Servings</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0"
          value={servings}
          autoFocus
          onChange={(e) => setServings(e.target.value)}
          className="w-24 rounded-[10px] border border-border bg-surface px-3 py-2 text-center font-mono text-sm outline-none"
        />
        <div className="ml-auto flex gap-1">
          {[0.5, 1, 2].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setServings(String(q))}
              className="rounded-[8px] border border-border bg-surface px-2.5 py-1 text-xs text-fg hover:border-border-strong"
            >
              {q}×
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
        <div className="text-xs uppercase tracking-[0.06em] text-muted">Total</div>
        <div className="mt-1 font-mono text-lg tracking-[-0.01em] text-fg">
          {Math.round(totals.calories)} kcal
        </div>
        <div className="mt-1 font-mono text-xs text-muted">
          C{Math.round(totals.carbs)}g · P{Math.round(totals.protein)}g · F
          {Math.round(totals.fat)}g
        </div>
      </div>

      <button
        type="submit"
        disabled={!valid}
        className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
          valid ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
        }`}
      >
        Add
      </button>
    </form>
  );
}

function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
