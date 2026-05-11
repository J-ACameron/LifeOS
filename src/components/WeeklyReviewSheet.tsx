import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, setSetting } from "../db";
import {
  ANTHROPIC_KEY_SETTING,
  streamChat,
  type ApiMessage,
} from "../lib/anthropic";
import {
  WEEKLY_REVIEW_SYSTEM_PROMPT,
  buildWeeklyReviewUserMessage,
  weekStartKey,
} from "../lib/weeklyReview";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WeeklyReviewSheet({ open, onClose }: Props) {
  const cached = useLiveQuery(() =>
    db.cached_briefs
      .where("type")
      .equals("weekly")
      .reverse()
      .sortBy("createdAt"),
  );
  const latest = cached?.[0];

  const [streaming, setStreaming] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  const apiKeyRow = useLiveQuery(() => db.settings.get(ANTHROPIC_KEY_SETTING));
  const storedKey = (apiKeyRow?.value as string | undefined) ?? "";
  const hasKey =
    storedKey.trim().length > 0 ||
    (import.meta.env.VITE_ANTHROPIC_API_KEY ?? "").trim().length > 0;

  const saveKey = async () => {
    const k = keyDraft.trim();
    if (!k) return;
    await setSetting(ANTHROPIC_KEY_SETTING, k);
    setKeyDraft("");
    setError(null);
  };

  useEffect(() => {
    if (!open) {
      setStreaming(null);
      setThinking(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [streaming]);

  const generate = async () => {
    if (thinking || streaming !== null) return;
    setError(null);
    setThinking(true);

    let userMessage: string;
    try {
      userMessage = await buildWeeklyReviewUserMessage();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setThinking(false);
      return;
    }

    const apiMessages: ApiMessage[] = [
      { role: "user", content: userMessage },
    ];

    let acc = "";
    streamChat(
      apiMessages,
      WEEKLY_REVIEW_SYSTEM_PROMPT,
      {
        onTextDelta: (delta) => {
          acc += delta;
          setStreaming(acc);
          setThinking(false);
        },
        onComplete: async (final) => {
          await db.cached_briefs.add({
            type: "weekly",
            date: weekStartKey(),
            content: final,
            createdAt: Date.now(),
          });
          setStreaming(null);
          setThinking(false);
        },
        onError: (err) => {
          setError(err.message);
          setStreaming(null);
          setThinking(false);
        },
      },
      [],
      { model: "claude-sonnet-4-6", thinking: "adaptive" },
    );
  };

  const deleteLatest = async () => {
    if (!latest?.id) return;
    if (confirm("Delete this weekly review?")) {
      await db.cached_briefs.delete(latest.id);
    }
  };

  const renderedDate = latest
    ? new Date(latest.createdAt).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  const busy = thinking || streaming !== null;

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
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Weekly review
          </span>
          <button
            onClick={onClose}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <div
          ref={bodyRef}
          className="flex-1 overflow-y-auto px-[18px] pb-4 [&::-webkit-scrollbar]:hidden"
        >
          {!hasKey && (
            <div className="my-2 rounded-[16px] border border-border bg-surface px-3.5 py-3">
              <div className="mb-1 text-sm font-medium text-fg">
                Set your Anthropic API key
              </div>
              <div className="mb-2.5 text-xs text-muted">
                Get one at console.anthropic.com → Settings → API Keys. Stored
                on this device only.
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveKey();
                }}
                className="flex gap-2"
              >
                <input
                  type="password"
                  autoComplete="off"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="sk-ant-api03-…"
                  className="flex-1 rounded-[8px] border border-border bg-bg px-2.5 py-1.5 text-sm outline-none placeholder:text-subtle"
                />
                <button
                  type="submit"
                  disabled={!keyDraft.trim()}
                  className={`rounded-[8px] px-3 py-1.5 text-sm font-medium ${
                    keyDraft.trim()
                      ? "bg-accent text-[#0a160d]"
                      : "bg-surface-2 text-subtle"
                  }`}
                >
                  Save
                </button>
              </form>
            </div>
          )}

          {/* Streaming or current */}
          {streaming !== null ? (
            <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3 text-base leading-snug whitespace-pre-wrap text-fg">
              {streaming}
              <span className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-[2px] animate-pulse bg-muted" />
            </div>
          ) : thinking ? (
            <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3">
              <span className="inline-flex gap-1">
                <Dot />
                <Dot delay={0.15} />
                <Dot delay={0.3} />
              </span>
              <span className="ml-2 font-mono text-xs text-muted">
                Alfred is thinking…
              </span>
            </div>
          ) : latest ? (
            <div className="rounded-[16px] border border-border bg-surface px-3.5 py-3 text-base leading-snug whitespace-pre-wrap text-fg">
              {latest.content}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-border bg-surface px-5 py-8 text-center text-sm text-muted">
              No review yet. Tap "Generate" below to get a Sonnet recap of your
              last 7 days.
            </div>
          )}

          {renderedDate && !busy && (
            <div className="mt-2 px-1.5 font-mono text-[11px] text-subtle">
              Generated {renderedDate}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-sm text-muted">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-border px-3.5 pb-[22px] pt-2.5">
          <button
            onClick={generate}
            disabled={busy || !hasKey}
            className={`flex-1 rounded-[12px] px-4 py-2.5 text-sm font-medium transition ${
              busy || !hasKey
                ? "bg-surface-2 text-subtle"
                : "bg-accent text-[#0a160d] active:scale-[0.99]"
            }`}
          >
            {busy
              ? "Generating…"
              : latest
                ? "Generate new"
                : "Generate"}
          </button>
          {latest && !busy && (
            <button
              onClick={deleteLatest}
              className="rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-sm text-subtle hover:border-border-strong hover:text-fg"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-muted"
      style={{ animation: `blink 1.2s ${delay}s infinite ease-in-out` }}
    />
  );
}
