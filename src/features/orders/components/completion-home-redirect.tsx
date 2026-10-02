"use client";

import { useEffect, useState } from "react";
import { completionSettings } from "../completion-settings";
import { clearReceipt } from "../submission-storage";

export function CompletionHomeRedirect() {
  const [seconds, setSeconds] = useState<number>(
    completionSettings.homeRedirectSeconds,
  );
  useEffect(() => {
    const deadline = Date.now() + completionSettings.homeRedirectSeconds * 1000;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        clearReceipt();
        window.location.replace("/");
      }
    };
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <p
      className="mt-4 text-sm text-muted-foreground"
      role="timer"
      aria-live="off"
    >
      <span className="font-semibold tabular-nums">{seconds}초</span> 후 메인
      화면으로 이동합니다.
    </p>
  );
}
