import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Card, Section } from "../components/primitives";
import { db } from "../db";
import {
  deleteEvent,
  listEventsForRange,
  formatEventTime,
  type CalEvent,
} from "../lib/calendar";
import EventEditorSheet from "../components/EventEditorSheet";

export default function Calendar() {
  const authSetting = useLiveQuery(() => db.settings.get("google_auth"));
  const accessToken =
    (authSetting?.value as { accessToken?: string } | undefined)?.accessToken;
  const isAuthed = !!accessToken;

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setEvents([]);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 0, 0, 0);
    setLoading(true);
    setError(null);
    listEventsForRange(start, end)
      .then((evts) => { if (!cancelled) setEvents(evts); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(
          msg === "not_authenticated" ? "Session expired — sign in again." : msg,
        );
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accessToken, cursor, refreshKey]);

  const monthName = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const goPrev = () =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const goNext = () =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  const goToday = () => {
    const d = new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(d);
  };

  const today = new Date();
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(
    cursor.getFullYear(),
    cursor.getMonth() + 1,
    0,
  ).getDate();

  type Cell = { date: Date | null; hasEvents: boolean };
  const cells: Cell[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ date: null, hasEvents: false });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
    const hasEvents = events.some((e) => sameDay(e.start, date));
    cells.push({ date, hasEvents });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, hasEvents: false });

  const eventsOfSelected = events
    .filter((e) => sameDay(e.start, selected))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const selectedTitle = selected.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="flex items-center justify-between px-1.5 pb-4 pt-3.5">
          <div>
            <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
              {monthName}
            </h1>
            <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
              {!isAuthed
                ? "sign in to load calendar"
                : loading
                ? "loading…"
                : error
                ? "calendar error"
                : `${events.length} ${events.length === 1 ? "event" : "events"}`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={goPrev}
              aria-label="Previous month"
              className="grid h-8 w-8 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg"
            >
              <ChevronLeft />
            </button>
            <button
              onClick={goToday}
              className="rounded-[8px] px-2 py-1 font-mono text-xs uppercase tracking-[0.04em] text-subtle hover:text-fg"
            >
              today
            </button>
            <button
              onClick={goNext}
              aria-label="Next month"
              className="grid h-8 w-8 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg"
            >
              <ChevronRight />
            </button>
          </div>
        </header>

        <Card>
          <div className="grid grid-cols-7 px-2 pb-1 pt-3">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="text-center text-[10px] uppercase tracking-[0.08em] text-subtle">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 px-2 pb-3 pt-1">
            {cells.map((cell, i) => {
              if (!cell.date) return <div key={i} className="h-9" />;
              const isToday = sameDay(cell.date, today);
              const isSelected = sameDay(cell.date, selected);
              return (
                <button
                  key={i}
                  onClick={() => setSelected(cell.date!)}
                  className={`relative grid h-9 place-items-center rounded-[8px] text-sm transition ${
                    isSelected
                      ? "bg-accent font-medium text-[#0a160d]"
                      : isToday
                      ? "border border-accent text-fg"
                      : "text-fg hover:bg-surface-2"
                  }`}
                >
                  {cell.date.getDate()}
                  {cell.hasEvents && !isSelected && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="mt-[22px]">
          <Section
            title={selectedTitle}
            meta={
              isAuthed
                ? `${eventsOfSelected.length} ${eventsOfSelected.length === 1 ? "event" : "events"}`
                : ""
            }
          >
            <Card>
              {!isAuthed && (
                <div className="px-3.5 py-4 text-sm text-muted">
                  Sign in with Google to load your calendar.
                </div>
              )}
              {isAuthed && loading && (
                <div className="px-3.5 py-4 text-sm text-muted">Loading events…</div>
              )}
              {isAuthed && !loading && error && (
                <div className="px-3.5 py-4 text-sm text-muted">
                  Couldn't load events: {error}
                </div>
              )}
              {isAuthed && !loading && !error && eventsOfSelected.length === 0 && (
                <div className="px-3.5 py-4 text-sm text-muted">No events.</div>
              )}
              {eventsOfSelected.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  onDeleted={() => setRefreshKey((k) => k + 1)}
                />
              ))}
            </Card>
          </Section>

          {isAuthed && (
            <button
              onClick={() => setEditorOpen(true)}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-accent px-4 py-3 text-sm font-medium text-[#0a160d] active:scale-[0.99]"
            >
              <PlusIcon /> Add event on{" "}
              {selected.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </button>
          )}
        </div>
      </div>

      {editorOpen && (
        <EventEditorSheet
          initialDate={selected}
          onClose={() => setEditorOpen(false)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function EventRow({
  event, onDeleted,
}: { event: CalEvent; onDeleted: () => void }) {
  const isRecurring = !!event.recurringEventId;

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${event.title}"?`)) return;

    let idToDelete = event.id;
    if (isRecurring) {
      const deleteAll = confirm(
        `"${event.title}" repeats.\n\nOK = delete the entire series\nCancel = delete just this occurrence`,
      );
      if (deleteAll && event.recurringEventId) {
        idToDelete = event.recurringEventId;
      }
    }
    try {
      await deleteEvent(idToDelete);
      onDeleted();
    } catch (err) {
      alert(
        "Delete failed: " +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  return (
    <div className="group grid grid-cols-[56px_1fr_36px] border-t border-border px-3.5 py-3 first:border-t-0">
      <div className="pt-px font-mono text-xs tracking-[0.01em] text-muted">
        {formatEventTime(event)}
      </div>
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-subtle" />
        <div className="min-w-0 flex-1">
          <div className="text-base leading-tight">
            {event.title}
            {isRecurring && (
              <span className="ml-1.5 rounded-[5px] border border-border bg-surface px-1 py-0.5 align-middle font-mono text-[9px] text-subtle">
                ↻
              </span>
            )}
          </div>
          {event.location && (
            <div className="mt-0.5 text-xs text-muted">{event.location}</div>
          )}
        </div>
      </div>
      <button
        onClick={handleDelete}
        aria-label={`Delete ${event.title}`}
        className="grid h-7 w-7 place-self-start place-items-center rounded-[8px] text-subtle opacity-50 hover:bg-surface-2 hover:text-fg hover:opacity-100"
      >
        <XIcon />
      </button>
    </div>
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

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const ChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M9 11L4 7l5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M5 3l5 4-5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
