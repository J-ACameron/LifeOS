import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section, ListRow, IconButton, Input } from "../components/primitives";
import { db } from "../db";
import type { Habit, Task } from "../db/types";
import { listTomorrow, formatEventTime, type CalEvent } from "../lib/calendar";
import {
  METRIC_CONFIG,
  computeStreak,
  getGoal,
  startOfToday,
  startOfWeek,
  type DailyMetricType,
} from "../lib/health";
import WeeklyReviewSheet from "../components/WeeklyReviewSheet";
import { OPEN_BACKUP_EVENT } from "../App";

interface HomeProps {
  onOpenMetric: (type: DailyMetricType) => void;
}

export default function Home({ onOpenMetric }: HomeProps) {
  const [reviewOpen, setReviewOpen] = useState(false);

  // --- Calendar (live, tomorrow) ---
  const authSetting = useLiveQuery(() => db.settings.get("google_auth"));
  const accessToken =
    (authSetting?.value as { accessToken?: string } | undefined)?.accessToken;
  const isAuthed = !!accessToken;

  const [schedule, setSchedule] = useState<CalEvent[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      setSchedule([]);
      setScheduleError(null);
      setScheduleLoading(false);
      return;
    }
    let cancelled = false;
    setScheduleLoading(true);
    setScheduleError(null);
    listTomorrow()
      .then((events) => { if (!cancelled) setSchedule(events); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setScheduleError(
          msg === "not_authenticated" ? "Session expired — sign in again." : msg,
        );
      })
      .finally(() => { if (!cancelled) setScheduleLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken]);

  // --- Tasks (Dexie, this week only — older tasks remain in IDB but hidden) ---
  const weekStart = startOfWeek();
  const tasks =
    useLiveQuery(
      () =>
        db.tasks
          .where("createdAt")
          .aboveOrEqual(weekStart)
          .reverse()
          .toArray(),
      [weekStart],
    ) ?? [];
  const [taskDraft, setTaskDraft] = useState("");

  const addTask = async () => {
    const title = taskDraft.trim();
    if (!title) return;
    await db.tasks.add({
      title,
      priority: "med",
      status: "pending",
      source: "manual",
      createdAt: Date.now(),
    });
    setTaskDraft("");
  };
  const toggleTask = async (t: Task) => {
    const next = t.status === "completed" ? "pending" : "completed";
    await db.tasks.update(t.id!, {
      status: next,
      completedAt: next === "completed" ? Date.now() : undefined,
    });
  };
  const deleteTask = (id: number) => db.tasks.delete(id);

  // --- Habits (Dexie) ---
  const habits =
    useLiveQuery(() => db.habits.orderBy("createdAt").toArray()) ?? [];
  const [habitDraft, setHabitDraft] = useState("");

  const addHabit = async () => {
    const name = habitDraft.trim();
    if (!name) return;
    await db.habits.add({
      name,
      frequency: "daily",
      streak: 0,
      longestStreak: 0,
      history: [],
      createdAt: Date.now(),
    });
    setHabitDraft("");
  };
  const toggleHabitToday = async (h: Habit) => {
    const todayStart = startOfToday();
    const yesterdayStart = todayStart - 86_400_000;
    const doneToday = h.history.some((t) => t >= todayStart);

    if (doneToday) {
      const newHistory = h.history.filter((t) => t < todayStart);
      const lastCompleted = newHistory.length ? Math.max(...newHistory) : undefined;
      await db.habits.update(h.id!, {
        history: newHistory,
        streak: Math.max(0, h.streak - 1),
        lastCompleted,
      });
    } else {
      const completedYesterday = h.history.some(
        (t) => t >= yesterdayStart && t < todayStart,
      );
      const newStreak = completedYesterday ? h.streak + 1 : 1;
      const now = Date.now();
      await db.habits.update(h.id!, {
        history: [...h.history, now],
        lastCompleted: now,
        streak: newStreak,
        longestStreak: Math.max(h.longestStreak, newStreak),
      });
    }
  };
  const deleteHabit = (id: number) => db.habits.delete(id);

  // --- Header copy ---
  const today = new Date();
  const dayName = today.toLocaleDateString(undefined, { weekday: "long" });
  const monthDay = today.toLocaleDateString(undefined, { month: "long", day: "numeric" });

  const subtitle =
    !isAuthed       ? "sign in to load calendar" :
    scheduleLoading ? "loading…" :
    scheduleError   ? "calendar error" :
    schedule.length === 0
      ? "nothing on tomorrow's calendar"
      : `${schedule.length} ${schedule.length === 1 ? "event" : "events"} tomorrow`;

  const sectionMeta =
    !isAuthed       ? "" :
    scheduleLoading ? "…" :
    scheduleError   ? "error" :
    `${schedule.length} ${schedule.length === 1 ? "event" : "events"}`;

  const tasksLeft = tasks.filter((t) => t.status !== "completed").length;
  const habitsDoneToday = habits.filter((h) => isDoneToday(h)).length;

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        {/* Top */}
        <div className="flex items-end justify-between px-1.5 pb-[18px] pt-3.5">
          <div>
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
              {dayName}<br/>{monthDay}
            </h1>
            <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
              {subtitle}
            </div>
          </div>
          <div className="text-right font-mono text-xs leading-relaxed tracking-[0.02em] text-subtle">
            {schedule[0] && (
              <>next up<br/><b className="font-medium text-fg">{formatEventTime(schedule[0])}</b></>
            )}
          </div>
        </div>

        {/* Schedule */}
        <Section title="Tomorrow" meta={sectionMeta}>
          <Card>
            {!isAuthed && (
              <div className="px-3.5 py-4 text-sm text-muted">
                Sign in with Google to load your calendar.
              </div>
            )}
            {isAuthed && scheduleLoading && (
              <div className="px-3.5 py-4 text-sm text-muted">Loading events…</div>
            )}
            {isAuthed && !scheduleLoading && scheduleError && (
              <div className="px-3.5 py-4 text-sm text-muted">
                Couldn't load events: {scheduleError}
              </div>
            )}
            {isAuthed && !scheduleLoading && !scheduleError && schedule.length === 0 && (
              <div className="px-3.5 py-4 text-sm text-muted">
                Nothing on tomorrow's calendar.
              </div>
            )}
            {schedule.map((s) => (
              <div key={s.id} className="grid grid-cols-[56px_1fr] border-t border-border px-3.5 py-3 first:border-t-0">
                <div className="pt-px font-mono text-xs tracking-[0.01em] text-muted">
                  {formatEventTime(s)}
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-subtle" />
                  <div className="min-w-0 flex-1">
                    <div className="text-base leading-tight">{s.title}</div>
                    {s.location && <div className="mt-0.5 text-xs text-muted">{s.location}</div>}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </Section>

        {/* Tasks (resets every Monday) */}
        <Section title="Tasks · this week" meta={`${tasksLeft} left`}>
          <Card>
            {tasks.map((t) => (
              <ListRow
                key={t.id}
                done={t.status === "completed"}
                leading={
                  <button
                    onClick={() => toggleTask(t)}
                    className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] transition ${
                      t.status === "completed" ? "border-accent bg-accent" : "border-border-strong"
                    }`}
                  >
                    {t.status === "completed" && <CheckIcon />}
                  </button>
                }
                title={t.title}
                sub={t.description}
                trailing={
                  <IconButton label="Delete" onClick={() => deleteTask(t.id!)} className="opacity-50">
                    <XIcon />
                  </IconButton>
                }
              />
            ))}
            <Input
              value={taskDraft}
              onChange={setTaskDraft}
              onSubmit={addTask}
              placeholder="Add a task"
              leading={
                <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] border-dashed border-border-strong text-subtle">
                  <PlusIcon />
                </span>
              }
            />
          </Card>
        </Section>

        {/* Habits */}
        <Section title="Habits" meta={`${habitsDoneToday}/${habits.length} today`}>
          <Card>
            {habits.map((h) => {
              const done = isDoneToday(h);
              const dots = getHistoryDots(h, 7);
              return (
                <div key={h.id} className="group flex items-center gap-3 border-t border-border px-3.5 py-3 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-base leading-tight">{h.name}</div>
                      <span className={`flex items-center gap-1.5 font-mono text-xs ${h.streak >= 7 ? "text-accent-fg" : "text-muted"}`}>
                        {h.streak}d
                      </span>
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      {dots.map((f, i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full ${f ? "bg-accent" : "bg-surface-2"} ${
                            i === dots.length - 1
                              ? "shadow-[0_0_0_1.5px_var(--color-accent-soft),0_0_0_2.5px_var(--color-bg)]"
                              : ""
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleHabitToday(h)}
                    className={`grid h-8 w-8 place-items-center rounded-full border-[1.5px] transition ${
                      done
                        ? "border-accent bg-accent text-white"
                        : "border-border-strong text-subtle"
                    }`}
                  >
                    {done ? <CheckIcon /> : <PlusIcon />}
                  </button>
                  <IconButton label="Delete habit" onClick={() => deleteHabit(h.id!)} className="opacity-50">
                    <XIcon />
                  </IconButton>
                </div>
              );
            })}
            <Input
              value={habitDraft}
              onChange={setHabitDraft}
              onSubmit={addHabit}
              placeholder="Add a habit"
              leading={
                <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-[6px] border-[1.5px] border-dashed border-border-strong text-subtle">
                  <PlusIcon />
                </span>
              }
            />
          </Card>
        </Section>

        {/* Stats */}
        <Section title="Today's stats">
          <div className="grid grid-cols-3 overflow-hidden rounded-[16px] border border-border bg-surface">
            <StatTile metric="water" onClick={() => onOpenMetric("water")} />
            <StatTile metric="sleep" onClick={() => onOpenMetric("sleep")} />
            <StatTile metric="calories" onClick={() => onOpenMetric("calories")} />
          </div>
        </Section>

        {/* Weekly review */}
        <Section title="Weekly review">
          <WeeklyReviewButton onClick={() => setReviewOpen(true)} />
        </Section>

        {/* Settings */}
        <Section title="Settings">
          <button
            onClick={() =>
              document.dispatchEvent(new Event(OPEN_BACKUP_EVENT))
            }
            className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99]"
          >
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-surface-2 text-subtle">
              <BackupIcon />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base leading-tight text-fg">
                Backup & restore
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-muted">
                Export all data as JSON or import from a backup
              </div>
            </div>
            <span className="text-subtle">›</span>
          </button>
        </Section>

        <div className="py-3 text-center font-mono text-[11px] tracking-[0.04em] text-subtle">
          {tasks.length} tasks · {habits.length} habits
        </div>
      </div>

      <WeeklyReviewSheet
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
      />
    </div>
  );
}

function WeeklyReviewButton({ onClick }: { onClick: () => void }) {
  const cached = useLiveQuery(() =>
    db.cached_briefs
      .where("type")
      .equals("weekly")
      .reverse()
      .sortBy("createdAt"),
  );
  const latest = cached?.[0];

  const ago = latest
    ? relativeTime(latest.createdAt)
    : null;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface px-3.5 py-3 text-left hover:border-border-strong active:scale-[0.99]"
    >
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-accent-soft text-accent-fg">
        <ScrollIcon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-base leading-tight text-fg">
          {latest ? "Read this week's review" : "Generate this week's review"}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {ago ? `Last generated ${ago}` : "Sonnet 4.6 · last 7 days across the app"}
        </div>
      </div>
      <span className="text-subtle">›</span>
    </button>
  );
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ScrollIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 3h7a1.5 1.5 0 0 1 1.5 1.5V12a1.5 1.5 0 0 0 1.5 1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M2 4.5a1.5 1.5 0 0 1 1.5-1.5v9a1.5 1.5 0 0 0 1.5 1.5h8.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M5.5 6h4M5.5 8.5h4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BackupIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M3 10.5V12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8 3v7M5 7l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatTile({ metric, onClick }: { metric: DailyMetricType; onClick: () => void }) {
  const today = startOfToday();
  // Calories source comes from logged meal entries (the Macros tab); other
  // metrics read from health_logs.
  const log = useLiveQuery(
    () =>
      metric === "calories"
        ? Promise.resolve(undefined)
        : db.health_logs.where("[date+type]").equals([today, metric]).first(),
    [metric, today],
  );
  const calorieEntries =
    useLiveQuery(
      () =>
        metric === "calories"
          ? db.meal_entries.where("date").equals(today).toArray()
          : Promise.resolve([]),
      [metric, today],
    ) ?? [];
  const value =
    metric === "calories"
      ? calorieEntries.reduce((s, e) => s + e.macros.calories, 0)
      : log?.value ?? 0;
  const goal =
    useLiveQuery(() => getGoal(metric), [metric]) ??
    METRIC_CONFIG[metric].defaultGoal;
  const streak = useLiveQuery(() => computeStreak(metric), [metric]) ?? 0;
  const config = METRIC_CONFIG[metric];
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className="flex min-w-0 flex-col gap-1 border-l border-border px-3.5 py-3.5 text-left transition first:border-l-0 hover:bg-surface-2 active:scale-[0.99]"
    >
      <div className="flex items-baseline justify-between gap-1">
        <div className="text-xs uppercase tracking-[0.04em] text-muted">{metric}</div>
        {streak > 0 && (
          <span className={`font-mono text-[10px] ${streak >= 7 ? "text-accent-fg" : "text-muted"}`}>
            {streak}d
          </span>
        )}
      </div>
      <div className="font-mono text-[16.5px] tracking-[-0.01em]">
        {config.format(value)}
        {config.unit && <span className="ml-px text-sm text-muted">{config.unit}</span>}
        <span className="ml-1 text-xs text-subtle">
          {" "}
          / {config.format(goal)}
          {config.unit}
        </span>
      </div>
      <div className="mt-1.5 h-0.5 overflow-hidden rounded-[1px] bg-surface-2">
        <span
          className="block h-full rounded-[inherit] bg-accent transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}

function isDoneToday(h: Habit): boolean {
  const t = startOfToday();
  return h.history.some((ts) => ts >= t);
}
function getHistoryDots(h: Habit, days: number): boolean[] {
  const dots: boolean[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const today = d.getTime();
  for (let i = days - 1; i >= 0; i--) {
    const start = today - i * 86_400_000;
    const end = start + 86_400_000;
    dots.push(h.history.some((ts) => ts >= start && ts < end));
  }
  return dots;
}

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M2 6.8 L5 9.5 L11 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const PlusIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
