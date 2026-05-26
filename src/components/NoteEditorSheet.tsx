import { useEffect, useState } from "react";
import { db } from "../db";

export type NoteTarget = number | "new" | null;

interface Props {
  target: NoteTarget;
  onClose: () => void;
}

const AUTOSAVE_MS = 400;

export default function NoteEditorSheet({ target, onClose }: Props) {
  const open = target !== null;

  // Keep the last-rendered target so content survives the close animation.
  const [renderedTarget, setRenderedTarget] = useState<NoteTarget>(target);
  useEffect(() => {
    if (target !== null) setRenderedTarget(target);
  }, [target]);

  const isCreating = renderedTarget === "new";
  const existingId =
    typeof renderedTarget === "number" ? renderedTarget : null;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // For new notes, holds the id Dexie assigned after the first save so
  // subsequent edits update the same row.
  const [draftId, setDraftId] = useState<number | null>(null);

  // Load (or reset) when the sheet opens or switches to a different note.
  useEffect(() => {
    if (!open) return;
    if (renderedTarget === "new") {
      setTitle("");
      setBody("");
      setDraftId(null);
    } else if (typeof renderedTarget === "number") {
      let cancelled = false;
      db.notes.get(renderedTarget).then((n) => {
        if (cancelled || !n) return;
        setTitle(n.title);
        setBody(n.body);
        setDraftId(null);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [open, renderedTarget]);

  // Debounced auto-save.
  useEffect(() => {
    if (!open) return;
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
  }, [open, title, body, existingId, draftId]);

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
    onClose();
  };

  const onDelete = async () => {
    const persistedId = existingId ?? draftId;
    if (persistedId === null) {
      // Never persisted — just close.
      onClose();
      return;
    }
    if (confirm("Delete this note?")) {
      await db.notes.delete(persistedId);
      onClose();
    }
  };

  const showDelete = !isCreating || draftId !== null;

  return (
    <>
      <div
        onClick={flushAndClose}
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
