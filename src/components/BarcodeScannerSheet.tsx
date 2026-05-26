import { useEffect, useRef, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}

// zxing's runtime type isn't worth pulling in just for this file — the
// dynamic import keeps it out of the main bundle. Local minimal interfaces:
interface ZxingResult {
  getText(): string;
}
interface ZxingReader {
  decodeFromVideoElement(
    el: HTMLVideoElement,
    cb: (result: ZxingResult | null, err: Error | null) => void,
  ): Promise<unknown> | unknown;
  reset?(): void;
}
interface ZxingControls {
  stop?(): void;
}

export default function BarcodeScannerSheet({
  open,
  onClose,
  onDetected,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let reader: ZxingReader | null = null;
    let controls: ZxingControls | null = null;
    let stream: MediaStream | null = null;

    const cleanup = () => {
      try {
        controls?.stop?.();
      } catch {
        /* noop */
      }
      try {
        reader?.reset?.();
      } catch {
        /* noop */
      }
      if (stream) {
        for (const t of stream.getTracks()) t.stop();
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    const start = async () => {
      setStarting(true);
      setError(null);

      if (
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        setError("Camera not supported in this browser.");
        setStarting(false);
        return;
      }

      try {
        const mod = await import("@zxing/browser");
        if (cancelled) return;
        // BrowserMultiFormatReader auto-detects code types (UPC-A, EAN-13, etc.)
        const ReaderCtor = (mod as { BrowserMultiFormatReader: new () => ZxingReader })
          .BrowserMultiFormatReader;
        reader = new ReaderCtor();

        // Rear camera preferred; iOS sometimes ignores facingMode but the
        // first matching deviceId from enumerateDevices works as a fallback.
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
        } catch {
          // Some iOS versions throw on facingMode constraint — retry without.
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }

        const video = videoRef.current;
        if (!video) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }

        video.srcObject = stream;
        // playsInline keeps iOS Safari from going fullscreen
        video.setAttribute("playsinline", "true");
        await video.play();

        const result = reader.decodeFromVideoElement(video, (res, err) => {
          if (cancelled) return;
          if (res) {
            const text = res.getText();
            // Guard against firing on the same code repeatedly during the
            // brief window before cleanup completes.
            cancelled = true;
            try {
              navigator.vibrate?.(100);
            } catch {
              /* noop */
            }
            cleanup();
            onDetected(text);
          }
          // err fires constantly while no barcode is visible — ignore.
          void err;
        });
        // Some zxing versions return a controls object; capture if present.
        if (result && typeof result === "object" && "stop" in result) {
          controls = result as ZxingControls;
        }

        setStarting(false);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        // Friendly mapping for the common camera permission error.
        if (/permission|denied|NotAllowed/i.test(msg)) {
          setError(
            "Camera permission was denied. Enable it in your browser / iOS site settings.",
          );
        } else if (/NotFound|no camera/i.test(msg)) {
          setError("No camera available on this device.");
        } else {
          setError(msg);
        }
        setStarting(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [open, onDetected]);

  return (
    <>
      <div
        onClick={onClose}
        className={`absolute inset-0 z-50 bg-black/45 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 z-50 flex h-[92%] flex-col rounded-t-[28px] border-t border-border bg-bg shadow-[0_-20px_40px_rgb(0_0_0/0.32)] transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.32, 0.72, 0.2, 1)" }}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-[2px] bg-border-strong" />
        <div className="flex items-center justify-between gap-2 px-[18px] pb-2.5 pt-3.5">
          <button
            onClick={onClose}
            className="px-1.5 py-1 text-base text-accent-fg"
          >
            Cancel
          </button>
          <span className="text-sm font-medium uppercase tracking-[0.04em] text-muted">
            Scan barcode
          </span>
          <span className="w-12" />
        </div>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
          {error ? (
            <div className="px-6 text-center text-sm text-muted">
              <div className="mb-2 font-medium text-fg">Camera unavailable</div>
              {error}
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                playsInline
                muted
              />
              {/* Aim box */}
              <div className="pointer-events-none relative z-10 h-[140px] w-[80%] max-w-[320px] rounded-[16px] border-2 border-accent shadow-[0_0_0_2000px_rgb(0_0_0/0.35)]" />
              {starting && (
                <div className="absolute bottom-14 z-10 font-mono text-[11px] text-muted">
                  Starting camera…
                </div>
              )}
              <div className="absolute bottom-6 z-10 px-6 text-center font-mono text-[11px] text-subtle">
                Point at a barcode
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
