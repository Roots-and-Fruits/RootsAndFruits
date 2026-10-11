"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { Account } from "./server";
import { authRequest } from "./client";
import { customerEpoch, customerResetEvent } from "./session-version";

type SessionState = {
  account: Account | null;
  loading: boolean;
  error: string;
};
const initial: SessionState = { account: null, loading: true, error: "" };
const SessionContext = createContext<SessionState & { refresh: () => void }>({
  ...initial,
  refresh: () => {},
});

// One in-memory session check for the header and customer screens. Never persisted
// or used as authorization; each API still checks the live server-side account.
export function SessionProvider({ children }: { children: ReactNode }) {
  const admin = usePathname().startsWith("/namu-admin");
  const [state, setState] = useState(initial);
  const control = useRef<{
    sequence: number;
    checkedAt: number;
    pending: {
      epoch: string;
      promise: Promise<{ account: Account | null }>;
    } | null;
  }>({ sequence: 0, checkedAt: 0, pending: null });
  const refresh = useCallback(() => {
    const request = ++control.current.sequence;
    const epoch = customerEpoch();
    const active = control.current;
    const pending =
      active.pending?.epoch === epoch
        ? active.pending
        : {
            epoch,
            promise: authRequest("session") as Promise<{
              account: Account | null;
            }>,
          };
    active.pending = pending;
    void pending.promise
      .then(({ account }) => {
        if (active.pending === pending) active.pending = null;
        if (request === control.current.sequence && epoch === customerEpoch()) {
          control.current.checkedAt = Date.now();
          setState({ account, loading: false, error: "" });
        }
      })
      .catch((error) => {
        if (active.pending === pending) active.pending = null;
        if (request === control.current.sequence && epoch === customerEpoch())
          setState({ account: null, loading: false, error: error.message });
      });
  }, []);
  const reload = useCallback(() => {
    setState(initial);
    refresh();
  }, [refresh]);
  useEffect(() => {
    if (admin) return;
    const active = control.current;
    refresh();
    const focus = () => {
      if (Date.now() - control.current.checkedAt > 30_000) refresh();
    };
    const reset = () => reload();
    window.addEventListener(customerResetEvent, reset);
    window.addEventListener("focus", focus);
    return () => {
      active.sequence++;
      window.removeEventListener(customerResetEvent, reset);
      window.removeEventListener("focus", focus);
    };
  }, [admin, refresh, reload]);
  return (
    <SessionContext.Provider value={{ ...state, refresh: reload }}>
      {children}
    </SessionContext.Provider>
  );
}
export function useCustomerSession() {
  return useContext(SessionContext);
}
