import { useEffect, useState } from "react";
import { createEvent } from "../lib/calendar";

interface Props {
  // Parent mounts only when actually editing; no "closed" state inside.
  initialDate: Date;
  onClose: () => void;
  onCreated: () => void;
}

const TRANSITION_MS = 280;

const RECURRENCE_OPTIONS: { label: string; value: string }[] = [
  { label: "Doesn't repeat", value: "" },
  { label: "Daily", value: "FREQ=DAILY" },
  { label: "Weekly", value: "FREQ=WEEKLY" },
  { label: "Monthly", value: "FREQ=MONTHLY" },
  { label: "Yearly", value: "FREQ=YEARLY" },
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function EventEditorSheet({
  initialDate, onClose, onCreated,
}: Props) {
  const dateStr = ymd(initialDate);
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState(dateStr);
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(dateStr);
  const [endTime, setEndTime] = useState("10:00");
  const [recurrence, setRecurrence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Slide-in animation on mount.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setError(null);

    let start: Date;
    let end: Date;
    if (allDay) {
      start = new Date(startDate + "T00:00:00");
      // Google treats end.date as exclusive, so add one calendar day.
      const endRaw = new Date(endDate + "T00:00:00");
      end = new Date(endRaw.getFullYear(), endRaw.getMonth(), endRaw.getDate() + 1);
    } else {
      start = new Date(startDate + "T" + startTime + ":00");
      end = new Date(endDate + "T" + endTime + ":00");
    }

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Invalid date or time.");
      return;
    }
    if (end <= start) {
      setError("End must be after start.");
      return;
    }

    setBusy(true);
    try {
      await createEvent({
        title: title.trim(),
        start,
        end,
        allDay,
        recurrence: recurrence || undefined,
      });
      onCreated();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Cancel
          </button>
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            New event
          </span>
          <button
            type="submit"
            form="event-form"
            disabled={!title.trim() || busy}
            className={`rounded-[8px] px-3 py-1 text-sm font-medium transition ${
              title.trim() && !busy
                ? "bg-accent text-[#0a160d]"
                : "bg-surface-2 text-subtle"
            }`}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>

        <form
          id="event-form"
          onSubmit={submit}
          className="flex-1 space-y-3 overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden"
        >
          <Field
            label="Title"
            value={title}
            onChange={setTitle}
            placeholder="Lunch with Sam"
          />

          <label className="flex items-center justify-between rounded-[10px] border border-border bg-surface px-3 py-2.5 text-sm text-fg">
            <span>All-day</span>
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <DateField label="Start date" value={startDate} onChange={setStartDate} />
            {!allDay && (
              <TimeField label="Start time" value={startTime} onChange={setStartTime} />
            )}
            <DateField label="End date" value={endDate} onChange={setEndDate} />
            {!allDay && (
              <TimeField label="End time" value={endTime} onChange={setEndTime} />
            )}
          </div>

          <div>
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Repeats
            </span>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-fg outline-none"
            >
              {RECURRENCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-[10px] border border-border bg-surface px-3 py-2 text-xs text-muted">
              {error}
            </div>
          )}
        </form>
      </div>
    </>
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

function DateField({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-fg outline-none"
      />
    </label>
  );
}

function TimeField({
  label, value, onChange,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm text-fg outline-none"
      />
    </label>
  );
}
