import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section } from "../components/primitives";
import { db } from "../db";
import type { HealthLog } from "../db/types";
import { startOfToday } from "../lib/health";

type LoggableType = "weight" | "mood" | "energy";

interface MetricSpec {
  type: LoggableType;
  label: string;
  unit: string;
  step: string;
  hint: string;
  format: (v: number) => string;
}

const METRICS: MetricSpec[] = [
  {
    type: "weight",
    label: "Weight",
    unit: "lb",
    step: "0.1",
    hint: "Today's weight",
    format: (v) => v.toFixed(1),
  },
  {
    type: "mood",
    label: "Mood",
    unit: "/10",
    step: "1",
    hint: "1 = awful · 10 = great",
    format: (v) => Math.round(v).toString(),
  },
  {
    type: "energy",
    label: "Energy",
    unit: "/10",
    step: "1",
    hint: "1 = drained · 10 = electric",
    format: (v) => Math.round(v).toString(),
  },
];

export default function Health() {
  const today = startOfToday();
  const fourteenDaysAgo = today - 13 * 86_400_000;
  const thirtyDaysAgo = today - 29 * 86_400_000;

  const recentLogs =
    useLiveQuery(
      () =>
        db.health_logs
          .where("date")
          .between(thirtyDaysAgo, today, true, true)
          .toArray(),
      [thirtyDaysAgo, today],
    ) ?? [];

  const todayLogs = useMemo(
    () => recentLogs.filter((l) => l.date === today),
    [recentLogs, today],
  );

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-3 pt-3.5">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            Health
          </h1>
          <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
            weight · mood · energy
          </div>
        </header>

        <Section title="Today">
          <Card>
            {METRICS.map((m, i) => (
              <QuickLogRow
                key={m.type}
                spec={m}
                todayValue={
                  todayLogs.find((l) => l.type === m.type)?.value
                }
                isFirst={i === 0}
              />
            ))}
          </Card>
        </Section>

        <Section title="Last 14 days">
          <div className="space-y-3">
            {METRICS.map((m) => (
              <TrendCard
                key={m.type}
                spec={m}
                logs={recentLogs.filter(
                  (l) => l.type === m.type && l.date >= fourteenDaysAgo,
                )}
              />
            ))}
          </div>
        </Section>

        <Section title="Recent entries">
          <Card>
            {recentLogs.length === 0 ? (
              <div className="px-3.5 py-4 text-sm text-muted">
                No entries yet — log something above.
              </div>
            ) : (
              [...recentLogs]
                .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt)
                .slice(0, 12)
                .map((l) => <EntryRow key={l.id} log={l} />)
            )}
          </Card>
        </Section>
      </div>
    </div>
  );
}

function QuickLogRow({
  spec,
  todayValue,
  isFirst,
}: {
  spec: MetricSpec;
  todayValue: number | undefined;
  isFirst: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(draft);
    if (Number.isNaN(v)) return;
    setBusy(true);
    try {
      const today = startOfToday();
      const existing = await db.health_logs
        .where("[date+type]")
        .equals([today, spec.type])
        .first();
      if (existing) {
        await db.health_logs.update(existing.id!, { value: v });
      } else {
        await db.health_logs.add({
          date: today,
          type: spec.type,
          value: v,
          unit: spec.unit === "/10" ? undefined : spec.unit,
          createdAt: Date.now(),
        });
      }
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 px-3.5 py-3 ${
        isFirst ? "" : "border-t border-border"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <div className="text-base leading-tight text-fg">{spec.label}</div>
          {todayValue !== undefined && (
            <span className="font-mono text-xs text-accent-fg">
              {spec.format(todayValue)}
              {spec.unit}
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">
          {spec.hint}
        </div>
      </div>
      <form onSubmit={save} className="flex items-center gap-1.5">
        <input
          type="number"
          step={spec.step}
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            todayValue !== undefined ? spec.format(todayValue) : "—"
          }
          className="w-20 rounded-[8px] border border-border bg-surface px-2 py-1 text-center font-mono text-sm outline-none placeholder:text-subtle"
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          className={`rounded-[8px] px-2.5 py-1 text-xs font-medium transition ${
            draft.trim() && !busy
              ? "bg-accent text-[#0a160d]"
              : "bg-surface-2 text-subtle"
          }`}
        >
          Log
        </button>
      </form>
    </div>
  );
}

function TrendCard({
  spec,
  logs,
}: {
  spec: MetricSpec;
  logs: HealthLog[];
}) {
  const sorted = useMemo(
    () => [...logs].sort((a, b) => a.date - b.date),
    [logs],
  );
  const values = sorted.map((l) => l.value);
  const latest = sorted[sorted.length - 1]?.value;
  const first = sorted[0]?.value;
  const delta =
    latest !== undefined && first !== undefined ? latest - first : 0;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const range = max - min || 1;

  const W = 280;
  const H = 44;
  const path =
    sorted.length === 0
      ? ""
      : sorted
          .map((l, i) => {
            const x =
              sorted.length === 1
                ? W / 2
                : (i / (sorted.length - 1)) * (W - 6) + 3;
            const y = H - 4 - ((l.value - min) / range) * (H - 8);
            return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");

  return (
    <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-fg">{spec.label}</div>
        {latest !== undefined && (
          <div className="font-mono text-xs">
            <span className="text-fg">
              {spec.format(latest)}
              {spec.unit}
            </span>
            {sorted.length >= 2 && (
              <span
                className={`ml-2 ${
                  delta === 0
                    ? "text-muted"
                    : (spec.type === "weight" ? delta < 0 : delta > 0)
                    ? "text-accent-fg"
                    : "text-subtle"
                }`}
              >
                {delta > 0 ? "+" : ""}
                {spec.type === "weight" ? delta.toFixed(1) : Math.round(delta)}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="mt-2">
        {sorted.length === 0 ? (
          <div className="font-mono text-[11px] text-subtle">no data</div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block h-11 w-full"
          >
            <path
              d={path}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {sorted.map((l, i) => {
              const x =
                sorted.length === 1
                  ? W / 2
                  : (i / (sorted.length - 1)) * (W - 6) + 3;
              const y = H - 4 - ((l.value - min) / range) * (H - 8);
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r="1.6"
                  fill="var(--color-accent)"
                />
              );
            })}
          </svg>
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-subtle">
        <span>{sorted.length} entries</span>
        {sorted.length >= 2 && (
          <span>
            {spec.format(min)}–{spec.format(max)}
            {spec.unit}
          </span>
        )}
      </div>
    </div>
  );
}

function EntryRow({ log }: { log: HealthLog }) {
  const dateStr = new Date(log.date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const onDelete = async () => {
    if (confirm(`Delete this ${log.type} entry?`)) {
      await db.health_logs.delete(log.id!);
    }
  };
  return (
    <div className="flex items-center gap-3 border-t border-border px-3.5 py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm leading-tight text-fg">
          {log.type}
          <span className="ml-2 font-mono text-xs text-muted">{dateStr}</span>
        </div>
        {log.notes && (
          <div className="mt-0.5 font-mono text-[11px] text-muted">
            {log.notes}
          </div>
        )}
      </div>
      <div className="font-mono text-sm text-fg">
        {log.value}
        <span className="ml-0.5 text-xs text-muted">{log.unit ?? ""}</span>
      </div>
      <button
        onClick={onDelete}
        aria-label="Delete entry"
        className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"
      >
        <XIcon />
      </button>
    </div>
  );
}

const XIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <path
      d="M2 2l7 7M9 2l-7 7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
