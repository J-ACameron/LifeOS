interface Props {
  title: string;
  subtitle?: string;
  body?: string;
}

export default function PlaceholderScreen({
  title,
  subtitle,
  body = "Nothing here yet.",
}: Props) {
  return (
    <div className="relative flex h-full flex-col bg-bg">
      <div className="flex-1 overflow-y-auto px-[18px] pb-[160px] pt-[60px] [&::-webkit-scrollbar]:hidden">
        <header className="px-1.5 pb-4 pt-3.5">
          <h1 className="m-0 text-2xl font-medium leading-[1.05] tracking-[-0.025em]">
            {title}
          </h1>
          {subtitle && (
            <div className="mt-1.5 font-mono text-xs tracking-[0.02em] text-muted">
              {subtitle}
            </div>
          )}
        </header>
        <div className="mt-6 rounded-[16px] border border-dashed border-border bg-surface px-5 py-10 text-center text-sm text-muted">
          {body}
        </div>
      </div>
    </div>
  );
}
