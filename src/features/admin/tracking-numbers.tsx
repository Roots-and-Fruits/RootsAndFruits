export function TrackingNumbers({ numbers }: { numbers?: string[] }) {
  if (!numbers?.length) return null;
  return (
    <p className="break-all text-sm font-semibold tabular-nums">
      송장번호: {numbers.join(", ")}
    </p>
  );
}
