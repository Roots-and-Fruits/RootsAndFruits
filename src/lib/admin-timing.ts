// Opt-in diagnostics. Callers must use fixed labels, never URLs/query values or user data.
export function createAdminTiming(
  scope: string,
  enabled = process.env.ADMIN_TIMING === "true",
) {
  const started = performance.now();
  const id = enabled ? crypto.randomUUID() : "";
  const steps: { name: string; ms: number }[] = [];
  let finished = false;
  return {
    async measure<T>(name: string, task: () => PromiseLike<T>): Promise<T> {
      if (!enabled) return await task();
      const start = performance.now();
      try {
        return await task();
      } finally {
        steps.push({
          name,
          ms: Math.round((performance.now() - start) * 10) / 10,
        });
      }
    },
    finish(response?: Response) {
      if (!enabled || finished) return;
      finished = true;
      const ms = Math.round((performance.now() - started) * 10) / 10;
      console.info(
        "[admin-timing]",
        JSON.stringify({
          scope,
          id,
          ms,
          steps,
          status: response?.status,
        }),
      );
      if (response) {
        response.headers.append(
          "Server-Timing",
          [
            ...steps.map((step) => `${step.name};dur=${step.ms}`),
            `handler;dur=${ms}`,
          ].join(", "),
        );
        response.headers.set("X-Admin-Timing-Id", id);
      }
    },
  };
}
export type AdminTiming = ReturnType<typeof createAdminTiming>;

// Only these static menu/API names may appear in diagnostics.
export function adminTimingLabel(value: string) {
  return [
    "counter",
    "orders",
    "shipping",
    "products",
    "settings",
    "notifications",
    "exports",
  ].includes(value)
    ? value
    : "other";
}
