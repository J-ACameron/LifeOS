import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Exercise } from "../db/types";
import {
  addTemplate,
  EQUIPMENT_LABELS,
  updateTemplate,
} from "../lib/fitness";

export type TemplateTarget = number | "new" | null;

interface Props {
  target: TemplateTarget;
  onClose: () => void;
}

export default function TemplateSheet({ target, onClose }: Props) {
  const open = target !== null;

  const [renderedTarget, setRenderedTarget] = useState<TemplateTarget>(target);
  useEffect(() => {
    if (target !== null) setRenderedTarget(target);
  }, [target]);

  const isCreating = renderedTarget === "new";
  const id = typeof renderedTarget === "number" ? renderedTarget : null;

  const allExercises =
    useLiveQuery(() => db.exercises.orderBy("name").toArray()) ?? [];

  const template = useLiveQuery(
    () => (id !== null ? db.workout_templates.get(id) : Promise.resolve(undefined)),
    [id],
  );

  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  // Initialize when sheet opens / target changes
  useEffect(() => {
    if (!open) return;
    if (isCreating) {
      setName("");
      setSelectedIds(new Set());
    } else if (template) {
      setName(template.name);
      setSelectedIds(new Set(template.exercises.map((e) => e.exerciseId)));
    }
    setSearch("");
    setBusy(false);
  }, [open, isCreating, template]);

  const toggle = (exerciseId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allExercises;
    return allExercises.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.muscleGroups.some((g) => g.toLowerCase().includes(q)) ||
        e.equipment.toLowerCase().includes(q),
    );
  }, [allExercises, search]);

  // Selected exercises in selection order (for display at top)
  const selectedExercises = useMemo(
    () => allExercises.filter((e) => e.id !== undefined && selectedIds.has(e.id)),
    [allExercises, selectedIds],
  );

  const valid = name.trim().length > 0 && selectedIds.size > 0;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const exercises = allExercises.filter(
        (e): e is Exercise & { id: number } =>
          e.id !== undefined && selectedIds.has(e.id),
      );
      if (isCreating) {
        await addTemplate(name, exercises);
      } else if (id !== null) {
        await updateTemplate(id, {
          name: name.trim(),
          exercises: exercises.map((e) => ({
            exerciseId: e.id,
            exerciseName: e.name,
          })),
        });
      }
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[92%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between gap-2 px-[18px] pb-2.5 pt-3.5">
          <button
            onClick={onClose}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Cancel
          </button>
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            {isCreating ? "New template" : "Edit template"}
          </span>
          <button
            onClick={save}
            disabled={!valid || busy}
            className={`rounded-[8px] px-3 py-1 text-sm font-medium transition ${
              valid && !busy
                ? "bg-accent text-[#0a160d]"
                : "bg-surface-2 text-subtle"
            }`}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Push Day"
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
            />
          </label>

          {selectedExercises.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 px-1.5 text-xs uppercase tracking-[0.06em] text-muted">
                Selected ({selectedExercises.length})
              </div>
              <div className="space-y-1">
                {selectedExercises.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 rounded-[10px] border border-accent bg-accent-soft px-3 py-2"
                  >
                    <div className="min-w-0 flex-1 truncate text-sm text-fg">
                      {e.name}
                    </div>
                    <button
                      onClick={() => toggle(e.id!)}
                      className="rounded-[6px] px-2 py-0.5 text-xs text-subtle hover:text-fg"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search exercises…"
                className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
              />
            </div>
            <div className="mb-1.5 px-1.5 text-xs uppercase tracking-[0.06em] text-muted">
              {search.trim() ? "Results" : "All exercises"}
            </div>
            {filtered.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-border bg-surface px-3.5 py-6 text-center text-sm text-muted">
                {search.trim() ? `No matches for "${search}".` : "No exercises in library."}
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((e) => {
                  const checked = e.id !== undefined && selectedIds.has(e.id);
                  return (
                    <button
                      key={e.id}
                      onClick={() => e.id !== undefined && toggle(e.id)}
                      className={`flex w-full items-center gap-2 rounded-[10px] border px-3 py-2.5 text-left transition ${
                        checked
                          ? "border-accent bg-accent-soft"
                          : "border-border bg-surface hover:border-border-strong"
                      }`}
                    >
                      <div
                        className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] transition ${
                          checked
                            ? "border-accent bg-accent"
                            : "border-border-strong"
                        }`}
                      >
                        {checked && <CheckIcon />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm leading-tight text-fg">{e.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted">
                          {EQUIPMENT_LABELS[e.equipment]}
                          {e.muscleGroups.length > 0 && ` · ${e.muscleGroups.join(", ")}`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
    <path d="M2 6.8 L5 9.5 L11 3" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
