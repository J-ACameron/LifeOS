import { useEffect, useState } from "react";
import type { MealEntry } from "../db/types";
import { scaleMacros, updateMealEntryServings } from "../lib/macros";

interface Props {
  entry: MealEntry;
  onClose: () => void;
}

const TRANSITION_MS = 280;

export default function MealEntryEditSheet({ entry, onClose }: Props) {
  const [servings, setServings] = useState(
    Number.isInteger(entry.servings)
      ? entry.servings.toString()
      : entry.servings.toString(),
  );
  const [busy, setBusy] = useState(false);

  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Per-serving macros recovered from the entry's snapshot. This is what gets
  // rescaled by the new servings count, so editing here matches what the
  // backend does in updateMealEntryServings.
  const perServing =
    entry.servings > 0
      ? scaleMacros(entry.macros, 1 / entry.servings)
      : entry.macros;
  const n = parseFloat(servings);
  const valid = !Number.isNaN(n) && n > 0;
  const preview = valid ? scaleMacros(perServing, n) : entry.macros;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      await updateMealEntryServings(entry.id!, n);
      close();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={close}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex max-h-[88%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Edit servings
          </span>
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <form
          onSubmit={save}
          className="flex flex-col gap-4 px-[18px] pb-6 pt-2"
        >
          <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
            <div className="text-base font-medium leading-tight text-fg">
              {entry.foodName}
            </div>
            <div className="mt-0.5 font-mono text-xs text-muted">
              per serving: {Math.round(perServing.calories)} kcal · C
              {Math.round(perServing.carbs)} P{Math.round(perServing.protein)} F
              {Math.round(perServing.fat)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Servings</span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
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
            <div className="text-xs uppercase tracking-[0.06em] text-muted">
              New total
            </div>
            <div className="mt-1 font-mono text-lg tracking-[-0.01em] text-fg">
              {Math.round(preview.calories)} kcal
            </div>
            <div className="mt-1 font-mono text-xs text-muted">
              C{Math.round(preview.carbs)}g · P{Math.round(preview.protein)}g · F
              {Math.round(preview.fat)}g
            </div>
          </div>

          <button
            type="submit"
            disabled={!valid || busy}
            className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
              valid && !busy
                ? "bg-accent text-[#0a160d]"
                : "bg-surface-2 text-subtle"
            }`}
          >
            Save
          </button>
        </form>
      </div>
    </>
  );
}
