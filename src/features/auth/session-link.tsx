"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { customerReturnPath } from "./redirect";
export function SessionLink() {
  const path = usePathname();
  const [kind, setKind] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (live) setKind(data?.account?.kind ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [path]);
  const loggedIn = kind === "kakao" || kind === "tablet";
  return (
    <Link
      href={`/login?next=${encodeURIComponent(customerReturnPath(path))}`}
      className="hover:text-primary"
    >
      {loggedIn
        ? kind === "tablet"
          ? "태블릿 로그인 상태"
          : "회원 로그인 상태"
        : "회원 로그인"}
    </Link>
  );
}
