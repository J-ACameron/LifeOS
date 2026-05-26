import type { ReactNode, FormEvent } from "react";

export function Section({
  title, meta, children,
}: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="mb-[22px]">
      <div className="mx-1.5 mb-2.5 flex items-baseline justify-between">
        <h3 className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-muted">{title}</h3>
        {meta && <span className="font-mono text-xs tracking-[0.02em] text-subtle">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
      {children}
    </div>
  );
}

export function ListRow({
  leading, title, sub, trailing, done = false, onClick,
}: {
  leading?: ReactNode; title: ReactNode; sub?: ReactNode;
  trailing?: ReactNode; done?: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="group flex min-h-[52px] items-center gap-3 border-t border-border px-3.5 py-3 first:border-t-0"
    >
      {leading}
      <div className="min-w-0 flex-1">
        <div className={`text-base leading-tight ${done ? "text-subtle line-through" : "text-fg"}`}>
          {title}
        </div>
        {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
      </div>
      {trailing}
    </div>
  );
}

export function IconButton({
  children, onClick, label, className = "",
}: { children: ReactNode; onClick?: () => void; label?: string; className?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`grid h-7 w-7 place-items-center rounded-[8px] text-subtle hover:bg-surface-2 hover:text-fg ${className}`}
    >
      {children}
    </button>
  );
}

export function Input({
  value, onChange, placeholder, onSubmit, leading,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  onSubmit?: () => void; leading?: ReactNode;
}) {
  return (
    <form
      onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit?.(); }}
      className="flex items-center gap-2.5 border-t border-border px-3.5 py-2.5"
    >
      {leading}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
      />
    </form>
  );
}

export function ChatDock({
  onOpen, placeholder = "Ask Claude…",
}: { onOpen: () => void; placeholder?: string }) {
  return (
    <div className="absolute inset-x-0 bottom-[64px] z-20 border-t border-border bg-bg px-3.5 pb-3 pt-2.5">
      <div
        onClick={onOpen}
        role="button"
        className="flex h-11 cursor-text items-center gap-2.5 rounded-full border border-border bg-surface pl-4 pr-1.5 hover:border-border-strong"
      >
        <span className="flex-1 truncate text-base text-subtle">{placeholder}</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-subtle">
          <ArrowUp />
        </span>
      </div>
    </div>
  );
}

export function ArrowUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 11V3M3.5 6.5L7 3l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
