"use client";

import {
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from "react";
import { RefreshCw } from "lucide-react";
import { AdminButton } from "./admin-button";

const REFRESH_SECONDS = 10;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const isVisible = () => document.visibilityState === "visible";
const serverVisible = () => true;

// Mount a fresh countdown after each request or pause. The deadline also handles
// delayed browser timers without issuing several catch-up requests at once.
function Countdown({ onElapsed }: { onElapsed: () => void }) {
  const [seconds, setSeconds] = useState(REFRESH_SECONDS);
  const elapsed = useEffectEvent(onElapsed);
  useEffect(() => {
    const deadline = Date.now() + REFRESH_SECONDS * 1000;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        elapsed();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="tabular-nums">{seconds}초</span>;
}

export function CounterRefreshButton({
  paused,
  refreshing,
  onRefresh,
}: {
  paused: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const visible = useSyncExternalStore(
    subscribeVisibility,
    isVisible,
    serverVisible,
  );
  const refresh = useEffectEvent(() => {
    if (!paused && !refreshing && isVisible()) onRefresh();
  });
  useEffect(
    () =>
      subscribeVisibility(() => {
        if (isVisible()) refresh();
      }),
    [],
  );

  return (
    <AdminButton
      type="button"
      variant="outline"
      className="min-w-40"
      aria-label="주문 목록 새로고침"
      title="10초마다 자동 갱신합니다. 누르면 바로 새로고침합니다."
      disabled={paused || refreshing || !visible}
      onClick={onRefresh}
    >
      <RefreshCw
        aria-hidden="true"
        className={refreshing ? "motion-safe:animate-spin" : undefined}
      />
      {refreshing ? (
        "새로고침 중…"
      ) : (
        <>
          새로고침 ·{" "}
          {paused || !visible ? (
            "일시정지"
          ) : (
            <Countdown onElapsed={onRefresh} />
          )}
        </>
      )}
    </AdminButton>
  );
}
