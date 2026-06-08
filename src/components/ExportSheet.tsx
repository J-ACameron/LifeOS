import { useEffect, useState } from "react";

interface Props {
  title: string;
  // Async so callers can run a Dexie query inside it. Called once on mount.
  generate: () => Promise<string>;
  onClose: () => void;
}

const TRANSITION_MS = 280;

export default function ExportSheet({ title, generate, onClose }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<{
    text: string;
    kind: "ok" | "err";
  } | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    generate()
      .then(setText)
      .catch((e: unknown) =>
        setStatus({
          text: e instanceof Error ? e.message : String(e),
          kind: "err",
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    setShown(false);
    window.setTimeout(onClose, TRANSITION_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ text: "Copied to clipboard.", kind: "ok" });
    } catch {
      setStatus({
        text: "Copy failed. Tap-and-hold the text to select, then copy.",
        kind: "err",
      });
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
        className={`absolute inset-x-0 bottom-0 z-40 flex h-[88%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between px-[18px] pb-2.5 pt-3.5">
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Export · {title}
          </span>
          <button
            onClick={close}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Done
          </button>
        </div>

        <div className="flex flex-1 flex-col px-[18px] pb-6 [&::-webkit-scrollbar]:hidden">
          {status && (
            <div
              className={`mb-3 rounded-[10px] border px-3 py-2 text-xs ${
                status.kind === "ok"
                  ? "border-border bg-surface text-fg"
                  : "border-border bg-surface text-muted"
              }`}
            >
              {status.text}
            </div>
          )}

          <p className="mb-3 text-xs leading-relaxed text-muted">
            Human-readable text you can copy and paste to share with a coach.
          </p>

          <textarea
            readOnly
            value={text}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            placeholder="Preparing export…"
            className="flex-1 w-full resize-none rounded-[10px] border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-fg outline-none placeholder:text-subtle"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={copy}
              disabled={!text}
              className={`rounded-[10px] px-3 py-2 text-sm font-medium transition ${
                text
                  ? "bg-accent text-[#0a160d]"
                  : "bg-surface-2 text-subtle"
              }`}
            >
              Copy to clipboard
            </button>
            {text && (
              <span className="ml-auto font-mono text-[11px] text-subtle">
                {text.split("\n").length} lines
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
