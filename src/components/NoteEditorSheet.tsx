import { useEffect, useState } from "react";
import { db } from "../db";

export type NoteTarget = number | "new";

interface Props {
  // Parent only mounts when actually editing — no "closed" state inside.
  target: NoteTarget;
  onClose: () => void;
}

const AUTOSAVE_MS = 400;
const TRANSITION_MS = 280;

export default function NoteEditorSheet({ target, onClose }: Props) {
  const isCreating = target === "new";
  const existingId = typeof target === "number" ? target : null;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // For new notes, holds the id Dexie assigned after the first save so
  // subsequent edits update the same row.
  const [draftId, setDraftId] = useState<number | null>(null);

  // Slide-in animation.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Load the note on mount (only fires once since target is fixed).
  useEffect(() => {
    if (target === "new") {
      setTitle("");
      setBody("");
      setDraftId(null);
      return;
    }
    if (typeof target === "number") {
      let cancelled = false;
      db.notes.get(target).then((n) => {
        if (cancelled || !n) return;
        setTitle(n.title);
        setBody(n.body);
        setDraftId(null);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [target]);

  // Debounced auto-save.
  useEffect(() => {
    const persistedId = existingId ?? draftId;
    const hasContent = title.trim().length > 0 || body.trim().length > 0;

    // Don't create a new row for an empty new note.
    if (persistedId === null && !hasContent) return;

    const handle = window.setTimeout(async () => {
      const now = Date.now();
      if (persistedId === null) {
        const id = await db.notes.add({
          title,
          body,
          createdAt: now,
          updatedAt: now,
        });
        setDraftId(id as number);
      } else {
        await db.notes.update(persistedId, {
          title,
          body,
          updatedAt: now,
        });
      }
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(handle);
  }, [title, body, existingId, draftId]);

  const flushAndClose = () => {
    const persistedId = existingId ?? draftId;
    const hasContent = title.trim().length > 0 || body.trim().length > 0;
    // If the user closed before the debounce fired, save now.
    if (persistedId !== null) {
      void db.notes.update(persistedId, {
        title,
        body,
        updatedAt: Date.now(),
      });
    } else if (hasContent) {
      const now = Date.now();
      void db.notes.add({
        title,
        body,
        createdAt: now,
        updatedAt: now,
      });
    }
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  const onDelete = async () => {
    const persistedId = existingId ?? draftId;
    if (persistedId === null) {
      // Never persisted — just close.
      setShown(false);
      window.setTimeout(onClose, TRANSITION_MS);
      return;
    }
    if (confirm("Delete this note?")) {
      await db.notes.delete(persistedId);
      setShown(false);
      window.setTimeout(onClose, TRANSITION_MS);
    }
  };

  const showDelete = !isCreating || draftId !== null;

  return (
    <>
      <div
        onClick={flushAndClose}
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
            onClick={flushAndClose}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            {isCreating && draftId === null ? "New note" : "Note"}
          </span>
          {showDelete ? (
            <button
              onClick={onDelete}
              aria-label="Delete note"
              className="px-1.5 py-1 text-base text-muted hover:text-fg"
            >
              Delete
            </button>
          ) : (
            <span className="w-12" />
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-transparent text-xl font-medium text-fg outline-none placeholder:text-subtle"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Start typing…"
            className="mt-3 w-full flex-1 resize-none bg-transparent text-base leading-relaxed text-fg outline-none placeholder:text-subtle"
            style={{ minHeight: "60vh" }}
          />
        </div>
      </div>
    </>
  );
}
