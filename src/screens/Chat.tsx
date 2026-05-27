import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUp } from "../components/primitives";
import { db, setSetting } from "../db";
import type { ChatMessage } from "../db/types";
import {
  ANTHROPIC_KEY_SETTING,
  streamChat,
  type ApiMessage,
  type AppTool,
} from "../lib/anthropic";
import {
  COACH_CONFIG,
  buildCoachPrompt,
  type CoachKey,
} from "../lib/coaches";
import { MACRO_TOOLS } from "../lib/macroTools";
import { FITNESS_TOOLS } from "../lib/fitnessTools";
import { CALENDAR_TOOLS } from "../lib/calendarTools";

function toolsForCoach(key: CoachKey): AppTool[] {
  switch (key) {
    case "macros": return MACRO_TOOLS;
    case "fitness": return FITNESS_TOOLS;
    case "home": return CALENDAR_TOOLS;
    default: return [];
  }
}

interface Props {
  onClose: () => void;
  coachKey: CoachKey;
}

const TRANSITION_MS = 280;

export default function Chat({ onClose, coachKey }: Props) {
  const coach = COACH_CONFIG[coachKey];
  const conversationId = coach.conversationId;

  const messages =
    useLiveQuery(
      () =>
        db.chat_history
          .where("conversationId")
          .equals(conversationId)
          .sortBy("createdAt"),
      [conversationId],
    ) ?? [];

  const [draft, setDraft] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Anthropic key: prefer the one the user pasted into the app, fall back to env var.
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

  // Auto-scroll to bottom on changes.
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages.length, streaming, thinking, conversationId]);

  // Reset transient state when switching coaches.
  useEffect(() => {
    setDraft("");
    setStreaming(null);
    setThinking(false);
    setError(null);
  }, [conversationId]);

  const send = async (text?: string) => {
    const t = (text ?? draft).trim();
    if (!t || thinking || streaming !== null) return;

    setDraft("");
    setError(null);
    setThinking(true);

    await db.chat_history.add({
      conversationId,
      role: "user",
      content: t,
      createdAt: Date.now(),
    });

    const history = await db.chat_history
      .where("conversationId")
      .equals(conversationId)
      .sortBy("createdAt");

    // Sliding window: only send the most recent 60 turns to the API. Keeps
    // chats fast on long-running threads (Sebastian) while the full history
    // stays in IndexedDB for the user to scroll back through.
    let apiMessages: ApiMessage[] = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-60)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    // Anthropic requires the first message to be a user turn — drop any
    // leading assistant turn that slipped in from the slice.
    while (apiMessages.length > 0 && apiMessages[0].role !== "user") {
      apiMessages = apiMessages.slice(1);
    }

    let systemPrompt: string;
    try {
      systemPrompt = await buildCoachPrompt(coachKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setThinking(false);
      return;
    }

    let acc = "";
    streamChat(
      apiMessages,
      systemPrompt,
      {
        onTextDelta: (delta) => {
          acc += delta;
          setStreaming(acc);
          setThinking(false);
        },
        onComplete: async (final) => {
          await db.chat_history.add({
            conversationId,
            role: "assistant",
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
      toolsForCoach(coachKey),
      { model: coach.model, thinking: coach.thinking },
    );
  };

  const canSend = !!draft.trim() && !thinking && streaming === null;

  const clearConversation = async () => {
    if (thinking || streaming !== null) return;
    if (
      !confirm(
        `Clear conversation with ${coach.label}? This can't be undone.`,
      )
    ) {
      return;
    }
    await db.chat_history
      .where("conversationId")
      .equals(conversationId)
      .delete();
    setStreaming(null);
    setThinking(false);
    setError(null);
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
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[92%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between gap-2 px-[18px] pb-2.5 pt-3.5">
          <button
            onClick={clearConversation}
            disabled={thinking || streaming !== null || messages.length === 0}
            className="px-1.5 py-1 text-sm text-muted hover:text-fg disabled:opacity-30"
          >
            Clear
          </button>
          <span className="truncate text-sm font-medium uppercase tracking-[0.04em] text-muted">
            {coach.label}
          </span>
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <div ref={bodyRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-[18px] py-2 [&::-webkit-scrollbar]:hidden">
          {!hasKey && (
            <div className="my-2 rounded-[16px] border border-border bg-surface px-3.5 py-3">
              <div className="mb-1 text-sm font-medium text-fg">Set your Anthropic API key</div>
              <div className="mb-2.5 text-xs text-muted">
                Get one at <span className="text-fg">console.anthropic.com → Settings → API Keys</span>. Stored on this device only.
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); saveKey(); }}
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
                    keyDraft.trim() ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
                  }`}
                >
                  Save
                </button>
              </form>
            </div>
          )}
          {messages.length === 0 && !streaming && !thinking && (
            <div className="my-3 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-subtle">
              ask anything
            </div>
          )}
          {messages.map((m: ChatMessage) => (
            <div
              key={m.id}
              className={`max-w-[84%] rounded-[18px] px-3.5 py-2.5 text-base leading-snug whitespace-pre-wrap ${
                m.role === "user"
                  ? "self-end rounded-br-[6px] bg-accent text-[#0a160d]"
                  : "self-start rounded-bl-[6px] border border-border bg-surface text-fg"
              }`}
            >
              {m.content}
            </div>
          ))}
          {streaming !== null && (
            <div className="max-w-[84%] self-start rounded-[18px] rounded-bl-[6px] border border-border bg-surface px-3.5 py-2.5 text-base leading-snug whitespace-pre-wrap text-fg">
              {streaming}
              <span className="ml-0.5 inline-block h-[14px] w-[2px] translate-y-[2px] animate-pulse bg-muted" />
            </div>
          )}
          {thinking && (
            <div className="max-w-[84%] self-start rounded-[18px] rounded-bl-[6px] border border-border bg-surface px-3.5 py-2.5">
              <span className="inline-flex gap-1">
                <Dot /><Dot delay={0.15} /><Dot delay={0.3} />
              </span>
            </div>
          )}
          {error && (
            <div className="self-start max-w-[84%] rounded-[18px] rounded-bl-[6px] border border-border bg-surface px-3.5 py-2.5 text-sm text-muted">
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-border px-3.5 pb-[22px] pt-2.5">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex h-11 items-center gap-2.5 rounded-full border border-border bg-surface pl-4 pr-1.5"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={coach.placeholder}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
            />
            <button
              type="submit"
              disabled={!canSend}
              className={`grid h-8 w-8 place-items-center rounded-full transition ${
                canSend ? "bg-accent text-[#0a160d]" : "bg-surface-2 text-subtle"
              }`}
            >
              <ArrowUp />
            </button>
          </form>
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
