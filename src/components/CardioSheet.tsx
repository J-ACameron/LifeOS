import { useEffect, useState } from "react";
import type { CardioKind } from "../db/types";
import {
  CARDIO_LABELS,
  CARDIO_MODALITIES,
  addCardioSession,
} from "../lib/cardio";

interface Props {
  // Parent only mounts when actually logging — no "closed" state inside.
  onClose: () => void;
}

const TRANSITION_MS = 280;

export default function CardioSheet({ onClose }: Props) {
  const [kind, setKind] = useState<CardioKind>("liss");
  const [duration, setDuration] = useState("");
  const [modality, setModality] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

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

  const durationNum = parseFloat(duration);
  const valid = !Number.isNaN(durationNum) && durationNum > 0;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await addCardioSession({
        kind,
        durationMin: durationNum,
        modality,
        notes,
      });
      close();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
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
        className={`absolute inset-x-0 bottom-0 z-40 flex max-h-[85%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between gap-2 px-[18px] pb-2.5 pt-3.5">
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Cancel
          </button>
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Log cardio
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
          {/* Kind toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(["liss", "hiit"] as CardioKind[]).map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  setModality("");
                }}
                className={`rounded-[12px] border px-3 py-2.5 text-sm font-medium transition ${
                  kind === k
                    ? "border-accent bg-accent-soft text-accent-fg"
                    : "border-border bg-surface text-muted hover:border-border-strong"
                }`}
              >
                {CARDIO_LABELS[k]}
              </button>
            ))}
          </div>

          {/* Duration */}
          <label className="mt-4 block">
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Duration (minutes)
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder={kind === "liss" ? "30-40" : "15-20"}
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
            />
          </label>

          {/* Modality */}
          <label className="mt-4 block">
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Type
            </span>
            <input
              value={modality}
              onChange={(e) => setModality(e.target.value)}
              placeholder="Incline walk, bike, rower…"
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CARDIO_MODALITIES[kind].map((m) => (
                <button
                  key={m}
                  onClick={() => setModality(m)}
                  className={`rounded-[8px] border px-2.5 py-1 text-xs transition ${
                    modality === m
                      ? "border-accent bg-accent-soft text-accent-fg"
                      : "border-border bg-surface text-muted hover:border-border-strong"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </label>

          {/* Notes */}
          <label className="mt-4 block">
            <span className="mb-1 block text-xs uppercase tracking-[0.06em] text-muted">
              Notes
            </span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                kind === "hiit"
                  ? "8 rounds, 30s hard / 90s easy"
                  : "Incline 10%, conversational pace"
              }
              className="w-full rounded-[10px] border border-border bg-surface px-3 py-2 text-sm outline-none placeholder:text-subtle"
            />
          </label>
        </div>
      </div>
    </>
  );
}
