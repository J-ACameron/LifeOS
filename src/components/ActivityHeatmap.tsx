import { useMemo } from "react";
import type { Workout } from "../db/types";
import {
  completedSetCount,
} from "../lib/fitness";
import { startOfDay, startOfWeek } from "../lib/health";

const WEEKS = 13; // ~3 months

function intensityFor(sets: number): 0 | 1 | 2 | 3 {
  if (sets === 0) return 0;
  if (sets < 6) return 1;
  if (sets < 16) return 2;
  return 3;
}

const CELL_BG = [
  "var(--color-surface-2)",
  "color-mix(in oklab, var(--color-accent) 25%, transparent)",
  "color-mix(in oklab, var(--color-accent) 55%, transparent)",
  "var(--color-accent)",
];

const DAY_LABELS = ["M", "", "W", "", "F", "", "S"];

export default function ActivityHeatmap({ workouts }: { workouts: Workout[] }) {
  const setsByDay = useMemo(() => {
    const m = new Map<number, number>();
    for (const w of workouts) {
      if (w.completedAt === undefined) continue;
      const day = startOfDay(w.date);
      m.set(day, (m.get(day) ?? 0) + completedSetCount(w));
    }
    return m;
  }, [workouts]);

  const totalCompleted = useMemo(
    () => workouts.filter((w) => w.completedAt !== undefined).length,
    [workouts],
  );

  // Build grid: 7 rows (days of week, Monday at top) × WEEKS columns.
  // Column 0 = WEEKS-1 weeks ago, column WEEKS-1 = current week.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const thisWeekStart = startOfWeek(today);

  const grid = useMemo(() => {
    const cells: { date: number; isFuture: boolean; intensity: 0 | 1 | 2 | 3 }[][] = [];
    for (let row = 0; row < 7; row++) {
      const rowCells: { date: number; isFuture: boolean; intensity: 0 | 1 | 2 | 3 }[] = [];
      for (let col = 0; col < WEEKS; col++) {
        const weekOffset = WEEKS - 1 - col;
        const date = thisWeekStart - weekOffset * 7 * 86_400_000 + row * 86_400_000;
        const isFuture = date > todayMs;
        const sets = setsByDay.get(date) ?? 0;
        rowCells.push({ date, isFuture, intensity: intensityFor(sets) });
      }
      cells.push(rowCells);
    }
    return cells;
  }, [setsByDay, thisWeekStart, todayMs]);

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-[0.06em] text-muted">
          Activity
        </div>
        <div className="font-mono text-[11px] tracking-[0.02em] text-subtle">
          {totalCompleted} {totalCompleted === 1 ? "workout" : "workouts"}
        </div>
      </div>

      <div className="flex gap-1.5">
        <div className="flex flex-col justify-between py-[1px] text-[9px] text-subtle">
          {DAY_LABELS.map((d, i) => (
            <div key={i} className="h-3 leading-[12px]">
              {d}
            </div>
          ))}
        </div>

        <div className="flex-1">
          <div
            className="grid gap-[3px]"
            style={{
              gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))`,
              gridTemplateRows: "repeat(7, minmax(0, 1fr))",
              gridAutoFlow: "column",
            }}
          >
            {grid.flat().map((cell, i) => (
              <div
                key={i}
                title={
                  cell.isFuture
                    ? ""
                    : new Date(cell.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                }
                className="aspect-square rounded-[3px]"
                style={{
                  background: cell.isFuture
                    ? "transparent"
                    : CELL_BG[cell.intensity],
                  opacity: cell.isFuture ? 0 : 1,
                }}
              />
            ))}
          </div>

          <div className="mt-2 flex items-center justify-end gap-1.5 text-[9px] text-subtle">
            <span>Less</span>
            {[0, 1, 2, 3].map((lvl) => (
              <div
                key={lvl}
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{ background: CELL_BG[lvl] }}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}
