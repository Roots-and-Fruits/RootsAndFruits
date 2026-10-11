"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { flushSync } from "react-dom";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { CustomerLoading } from "@/components/site/customer-loading";
import { Button } from "@/components/ui/button";
import {
  clearSubmissionWarning,
  synchronizeCustomerSession,
} from "./customer-cleanup";
import { customerEpoch, customerEpochStorage } from "./session-version";

export function CustomerBoundary({ children }: { children: ReactNode }) {
  const path = usePathname();
  const admin = path.startsWith("/namu-admin");
  const personal =
    /^(\/account(?:\/|$)|\/order(?:\/|-)|\/product$|\/experience$|\/preview\/)/.test(
      path,
    );
  const [state, setState] = useState<ReturnType<
    typeof synchronizeCustomerSession
  > | null>(null);
  const container = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (admin) return;
    const sync = () => {
      const next = synchronizeCustomerSession();
      setState((old) =>
        old?.epoch === next.epoch &&
        old.warning === next.warning &&
        old.failed === next.failed
          ? old
          : next,
      );
    };
    sync();
    const storage = (event: StorageEvent) => {
      if (
        !event.key ||
        event.key === customerEpochStorage ||
        event.key === "roots-and-fruits:cleared-submission-warning"
      )
        sync();
    };
    const show = () => {
      flushSync(sync);
      if (container.current) container.current.style.visibility = "";
    };
    const hide = () => {
      if (container.current) container.current.style.visibility = "hidden";
    };
    const timer = window.setInterval(sync, 1000); // Cookie changes are local; no network polling.
    window.addEventListener("storage", storage);
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", show);
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [admin, path]);
  if (admin) return children;
  return (
    <div ref={container}>
      {!state ? (
        personal ? (
          <>
            <SiteHeader compact />
            <main id="main-content">
              <CustomerLoading />
            </main>
            <SiteFooter />
          </>
        ) : (
          children
        )
      ) : state.epoch !== customerEpoch() ? (
        <>
          <SiteHeader compact />
          <main id="main-content">
            <CustomerLoading />
          </main>
          <SiteFooter />
        </>
      ) : state.failed ? (
        <div className="mx-auto max-w-xl space-y-4 p-6" role="alert">
          <p>
            이전 입력을 지우지 못했어요. 브라우저 설정에서 이 사이트의 저장
            데이터를 삭제한 뒤 다시 접속해주세요.
          </p>
          <Button onClick={() => window.location.reload()}>다시 확인</Button>
        </div>
      ) : (
        <div key={state.epoch}>
          {state.warning && (
            <aside
              role="alert"
              className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950"
            >
              <p className="flex-1">
                접수 결과를 확인하지 못한 주문의 임시 정보가 지워졌어요. 다시
                접수하기 전에 내 주문 내역이나 카운터에서 접수 여부를
                확인해주세요.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  clearSubmissionWarning();
                  setState({ ...state, warning: false });
                }}
              >
                확인했어요
              </Button>
            </aside>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
