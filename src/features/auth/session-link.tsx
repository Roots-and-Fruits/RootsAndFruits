"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { customerReturnPath } from "./redirect";
import { authRequest } from "./client";
import { useCustomerSession } from "./session-provider";

export function SessionLink({ compact = false }: { compact?: boolean }) {
  const path = usePathname();
  const { account, loading, error: sessionError } = useCustomerSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const kind = account?.kind;
  if (loading)
    return (
      <span
        aria-label="메뉴 불러오는 중"
        className="h-5 w-16 rounded bg-muted"
      />
    );
  if (kind !== "kakao" && kind !== "tablet")
    return (
      <Link
        href={`/login?next=${encodeURIComponent(customerReturnPath(path))}`}
        className="inline-flex min-h-11 items-center whitespace-nowrap text-sm hover:text-primary"
      >
        {sessionError ? "로그인 확인" : compact ? "로그인" : "회원 로그인"}
      </Link>
    );
  return (
    <div className="relative flex items-center gap-3 text-sm sm:gap-5">
      {kind === "kakao" ? (
        <Link
          href="/account/orders"
          className="inline-flex min-h-11 items-center whitespace-nowrap hover:text-primary"
        >
          마이페이지
        </Link>
      ) : (
        <span className="whitespace-nowrap text-muted-foreground">태블릿</span>
      )}
      <button
        type="button"
        disabled={busy}
        className="min-h-11 whitespace-nowrap text-muted-foreground hover:text-primary disabled:opacity-60"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await authRequest("logout", {});
            window.location.replace("/");
          } catch (e) {
            setError(e instanceof Error ? e.message : "로그아웃하지 못했어요.");
            setBusy(false);
          }
        }}
      >
        {busy ? "로그아웃 중…" : "로그아웃"}
      </button>
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 w-64 rounded-xl border bg-card p-3 text-destructive shadow"
        >
          {error}
        </p>
      )}
    </div>
  );
}
