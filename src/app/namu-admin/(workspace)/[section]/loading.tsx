export default function AdminLoading() {
  return (
    <div role="status" className="space-y-4" aria-live="polite">
      <p className="text-sm text-muted-foreground">
        관리자 화면을 불러오는 중…
      </p>
      <div aria-hidden="true" className="space-y-3 motion-safe:animate-pulse">
        <div className="h-24 rounded-xl border bg-card" />
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-16 rounded-xl bg-secondary" />
        ))}
      </div>
    </div>
  );
}
