export function CustomerLoading({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="status"
      aria-label="불러오는 중"
      className={
        compact ? "space-y-5" : "mx-auto max-w-2xl space-y-7 px-5 py-8 sm:py-12"
      }
    >
      <span className="sr-only">불러오는 중</span>
      <div aria-hidden="true" className="space-y-6 motion-safe:animate-pulse">
        <div className="h-6 w-24 rounded-lg bg-muted" />
        <div className="space-y-3">
          <div className="h-8 w-3/4 max-w-80 rounded-lg bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>
        <div className="space-y-5 rounded-2xl border bg-card p-5 sm:p-8">
          {[0, 1].map((n) => (
            <div key={n} className="space-y-3">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-12 rounded-xl bg-muted/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
