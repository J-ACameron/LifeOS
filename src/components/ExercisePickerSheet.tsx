import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Exercise, EquipmentType } from "../db/types";
import {
  addCustomExercise,
  addExerciseToWorkout,
  deleteExercise,
  EQUIPMENT_LABELS,
  type NewExerciseInput,
} from "../lib/fitness";

type View = "list" | "new";

interface Props {
  // Parent only mounts when actually picking — no "closed" state inside.
  workoutId: number;
  onClose: () => void;
}

const TRANSITION_MS = 280;

export default function ExercisePickerSheet({ workoutId, onClose }: Props) {
  const [view, setView] = useState<View>("list");
  const [query, setQuery] = useState("");

  // Slide-in animation.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const handle = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(handle);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  const allExercises = useLiveQuery(
    () => db.exercises.orderBy("name").toArray(),
  ) ?? [];
  const recent = useLiveQuery(
    () =>
      db.exercises
        .orderBy("lastUsedAt")
        .reverse()
        .filter((e) => !!e.lastUsedAt)
        .limit(6)
        .toArray(),
  ) ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allExercises;
    return allExercises.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.muscleGroups.some((g) => g.toLowerCase().includes(q)) ||
        e.equipment.toLowerCase().includes(q),
    );
  }, [allExercises, query]);

  const onPick = async (e: Exercise) => {
    await addExerciseToWorkout(workoutId, e);
    close();
  };

  const headerLabel = view === "new" ? "New exercise" : "Add exercise";

  return (
    <>
      <div
        onClick={close}
        className={`absolute inset-0 z-40 bg-black/45 transition-opacity duration-200 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[88%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
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
              onClick={() => setView("list")}
              className="text-base text-accent-fg"
            >
              ← Back
            </button>
          )}
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>
        {view === "new" && (
          <div className="px-[18px] pb-1 text-sm font-medium uppercase tracking-[0.04em] text-muted">
            {headerLabel}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          {view === "list" ? (
            <ListView
              query={query}
              setQuery={setQuery}
              recent={recent}
              all={filtered}
              showRecent={!query.trim()}
              onPick={onPick}
              onNewExercise={() => setView("new")}
              onDelete={(id) => deleteExercise(id)}
            />
          ) : (
            <NewExerciseForm
              initialName={query}
              onSave={async (input) => {
                const created = await addCustomExercise(input);
                await addExerciseToWorkout(workoutId, created);
                close();
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
  query, setQuery, recent, all, showRecent, onPick, onNewExercise, onDelete,
}: {
  query: string;
  setQuery: (s: string) => void;
  recent: Exercise[];
  all: Exercise[];
  showRecent: boolean;
  onPick: (e: Exercise) => void;
  onNewExercise: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-[10px] border border-border bg-surface px-3 py-2 text-sm">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercises…"
            className="w-full bg-transparent outline-none placeholder:text-subtle"
          />
        </div>
        <button
          onClick={onNewExercise}
          className="grid h-10 w-10 place-items-center rounded-[10px] bg-accent text-[#0a160d]"
          aria-label="New exercise"
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
            {recent.map((e) => (
              <ExerciseRow
                key={e.id}
                exercise={e}
                onPick={() => onPick(e)}
                onDelete={() => onDelete(e.id!)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 px-1.5 text-xs uppercase tracking-[0.08em] text-muted">
          {showRecent ? "All exercises" : "Results"}
        </div>
        {all.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border bg-surface px-3.5 py-6 text-center text-sm text-muted">
            {query.trim() ? `No matches for "${query}". ` : "No exercises yet. "}
            <button
              onClick={onNewExercise}
              className="text-accent-fg underline-offset-2 hover:underline"
            >
              Add a new exercise
            </button>
            .
          </div>
        ) : (
          <div className="space-y-1">
            {all.map((e) => (
              <ExerciseRow
                key={e.id}
                exercise={e}
                onPick={() => onPick(e)}
                onDelete={() => onDelete(e.id!)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExerciseRow({
  exercise, onPick, onDelete,
}: {
  exercise: Exercise;
  onPick: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3 py-2.5 hover:border-border-strong">
      <button onClick={onPick} className="min-w-0 flex-1 text-left">
        <div className="text-sm leading-tight text-fg">{exercise.name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {EQUIPMENT_LABELS[exercise.equipment]} ·{" "}
          {exercise.muscleGroups.join(", ")}
          {exercise.unilateral && " · per side"}
          {exercise.isCustom && " · custom"}
        </div>
      </button>
      <button
        onClick={(ev) => {
          ev.stopPropagation();
          if (confirm(`Delete "${exercise.name}" from library?`)) onDelete();
        }}
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"
        aria-label="Delete exercise"
      >
        <XIcon />
      </button>
    </div>
  );
}

/* -------------------- New exercise form -------------------- */

const EQUIPMENT_OPTIONS: EquipmentType[] = [
  "barbell", "dumbbell", "machine", "cable", "bodyweight", "cardio", "other",
];

function NewExerciseForm({
  initialName, onSave,
}: {
  initialName: string;
  onSave: (input: NewExerciseInput) => void;
}) {
  const [name, setName] = useState(initialName);
  const [muscleGroups, setMuscleGroups] = useState("");
  const [equipment, setEquipment] = useState<EquipmentType>("barbell");
  const [unilateral, setUnilateral] = useState(false);

  const valid = name.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      name: name.trim(),
      muscleGroups: muscleGroups
        .split(",")
        .map((g) => g.trim().toLowerCase())
        .filter(Boolean),
      equipment,
      unilateral: unilateral || undefined,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 pt-2">
      <Field
        label="Name"
        value={name}
        onChange={setName}
        placeholder="Cable Y-Raise"
        autoFocus
      />
      <Field
        label="Muscle groups (comma separated)"
        value={muscleGroups}
        onChange={setMuscleGroups}
        placeholder="shoulders, traps"
      />

      <div>
        <span className="mb-1.5 block text-xs uppercase tracking-[0.06em] text-muted">
          Equipment
        </span>
        <div className="grid grid-cols-3 gap-2">
          {EQUIPMENT_OPTIONS.map((eq) => (
            <button
              key={eq}
              type="button"
              onClick={() => setEquipment(eq)}
              className={`rounded-[8px] border px-2 py-1.5 text-xs transition ${
                equipment === eq
                  ? "border-accent bg-accent-soft text-accent-fg"
                  : "border-border bg-surface text-fg hover:border-border-strong"
              }`}
            >
              {EQUIPMENT_LABELS[eq]}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={unilateral}
          onChange={(e) => setUnilateral(e.target.checked)}
        />
        Unilateral (track per side)
      </label>

      <button
        type="submit"
        disabled={!valid}
        className={`w-full rounded-[10px] py-2.5 text-sm font-medium transition ${
          valid ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
        }`}
      >
        Save & add to workout
      </button>
    </form>
  );
}

function Field({
  label, value, onChange, placeholder, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
      />
    </label>
  );
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
