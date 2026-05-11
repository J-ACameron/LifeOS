import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import type { Workout, WorkoutSet } from "../db/types";
import { e1RM, exerciseSessions, isSetCompleted } from "../lib/fitness";

interface Props {
  exerciseId: number | null;
  exerciseName: string | null;
  onClose: () => void;
}

export default function ExerciseHistorySheet({
  exerciseId, exerciseName, onClose,
}: Props) {
  const open = exerciseId !== null;

  const [renderedId, setRenderedId] = useState<number | null>(exerciseId);
  const [renderedName, setRenderedName] = useState<string | null>(exerciseName);
  useEffect(() => {
    if (exerciseId !== null) setRenderedId(exerciseId);
    if (exerciseName !== null) setRenderedName(exerciseName);
  }, [exerciseId, exerciseName]);

  const allWorkouts =
    useLiveQuery(() => db.workouts.toArray()) ?? [];

  const sessions = useMemo(() => {
    if (renderedId === null) return [];
    return exerciseSessions(allWorkouts as Workout[], renderedId);
  }, [allWorkouts, renderedId]);

  const allTimeBest = useMemo(() => {
    let best: { e1rm: number; weight: number; reps: number; date: number } | null = null;
    for (const s of sessions) {
      for (const set of s.sets) {
        const e = e1RM(set);
        if (e > 0 && (!best || e > best.e1rm)) {
          best = { e1rm: e, weight: set.weight, reps: set.reps, date: s.date };
        }
      }
    }
    return best;
  }, [sessions]);

  // Sparkline values: top e1RM per session, oldest → newest, last 12.
  const sparkValues = useMemo(() => {
    const ordered = [...sessions].reverse(); // oldest first
    return ordered.slice(-12).map((s) => s.topE1RM);
  }, [sessions]);

  return (
    <>
      <div
        onClick={onClose}
        className={`absolute inset-0 z-50 bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-50 flex h-[90%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            History
          </span>
          <button
            onClick={onClose}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          <div className="px-1.5 pb-3">
            <h2 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em] text-fg">
              {renderedName}
            </h2>
            <div className="mt-1.5 font-mono text-xs text-muted">
              {sessions.length}{" "}
              {sessions.length === 1 ? "session" : "sessions"}
            </div>
          </div>

          {/* All-time best */}
          {allTimeBest && (
            <div className="mb-3 rounded-[14px] border border-border bg-surface px-3.5 py-3">
              <div className="text-xs uppercase tracking-[0.06em] text-muted">
                All-time best
              </div>
              <div className="mt-1 font-mono text-lg text-fg">
                {allTimeBest.reps} × {Math.round(allTimeBest.weight)} lb
                <span className="ml-2 text-xs text-muted">
                  e1RM {Math.round(allTimeBest.e1rm)}
                </span>
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-subtle">
                {new Date(allTimeBest.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
            </div>
          )}

          {/* Sparkline */}
          {sparkValues.length >= 2 && (
            <div className="mb-3 rounded-[14px] border border-border bg-surface px-3.5 py-3">
              <div className="text-xs uppercase tracking-[0.06em] text-muted">
                e1RM trend (last {sparkValues.length})
              </div>
              <Sparkline values={sparkValues} />
            </div>
          )}

          {/* Session list */}
          {sessions.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
              No sessions yet for this exercise.
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <SessionRow key={`${s.workoutId}-${s.date}`} session={s} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 280;
  const height = 60;
  const padding = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / Math.max(1, values.length - 1);

  const points = values
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = padding + (height - padding * 2) * (1 - (v - min) / range);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Area fill under line
  const lastX = padding + (values.length - 1) * stepX;
  const areaPoints = `${padding},${height} ${points} ${lastX.toFixed(1)},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      preserveAspectRatio="none"
      className="mt-2 h-[60px] w-full"
    >
      <polygon
        points={areaPoints}
        fill="var(--color-accent-soft)"
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Mark each session as a dot */}
      {values.map((v, i) => {
        const x = padding + i * stepX;
        const y = padding + (height - padding * 2) * (1 - (v - min) / range);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="2.5"
            fill="var(--color-accent)"
          />
        );
      })}
    </svg>
  );
}

function SessionRow({
  session,
}: {
  session: ReturnType<typeof exerciseSessions>[number];
}) {
  const date = new Date(session.date);
  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });

  return (
    <div className="rounded-[12px] border border-border bg-surface px-3.5 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-subtle">
          {dateStr} · {session.workoutName}
        </div>
        <div className="font-mono text-xs text-muted">
          e1RM {Math.round(session.topE1RM)}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5 font-mono text-xs text-fg">
        {session.sets.map((set: WorkoutSet, i) => (
          <span
            key={i}
            className={
              isSetCompleted(set) && set === session.topSet
                ? "rounded-[6px] bg-accent-soft px-1.5 py-0.5 text-accent-fg"
                : "px-1 py-0.5"
            }
          >
            {set.reps}×{Math.round(set.weight)}
            {set.rpe ? <span className="text-subtle"> @{set.rpe}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}
