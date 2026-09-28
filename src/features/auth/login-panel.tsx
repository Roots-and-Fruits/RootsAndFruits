"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { LabeledInput } from "@/components/forms/labeled-input";
import { customerReturnPath } from "./redirect";

type Session = { id: string; kind: "kakao" | "tablet" | "staff" };
async function authRequest(action: string, body?: unknown) {
  const response = await fetch(
    `/api/auth/${action}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "로그인을 처리하지 못했어요.");
  return data;
}
export function LoginPanel({
  tablet = false,
  configured,
  next,
  callbackError = false,
}: {
  tablet?: boolean;
  configured: boolean;
  next: string;
  callbackError?: boolean;
}) {
  const [account, setAccount] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      callbackError
        ? "카카오 로그인을 완료하지 못했어요. 다시 시도해주세요."
        : "",
    );
  const { register, handleSubmit } = useForm<{
    username: string;
    password: string;
  }>();
  useEffect(() => {
    if (!configured) return;
    let live = true;
    authRequest("session")
      .then((data) => {
        if (live) setAccount(data.account);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [configured]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "요청을 처리하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <p className="mt-8" role="status">
        로그인 상태를 확인하고 있어요.
      </p>
    );
  const customer = account?.kind === "kakao" || account?.kind === "tablet";
  return (
    <div className="mt-8 space-y-5">
      {!configured && (
        <p role="status" className="rounded-xl bg-secondary p-4 text-sm">
          로그인 서비스를 준비하고 있어요. 비회원 주문은 계속 이용할 수 있어요.
        </p>
      )}
      {customer ? (
        <>
          <p role="status">
            {account.kind === "tablet"
              ? "공용 태블릿 계정으로 로그인되어 있어요."
              : "카카오 계정으로 로그인되어 있어요."}
          </p>
          <Button asChild className="w-full">
            <Link href={customerReturnPath(next)}>주문하러 가기</Link>
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            className="w-full"
            onClick={() =>
              run(async () => {
                await authRequest("logout", {});
                window.location.replace(tablet ? "/tablet-login" : "/login");
              })
            }
          >
            로그아웃
          </Button>
        </>
      ) : tablet ? (
        <form
          className="space-y-5"
          onSubmit={handleSubmit((value) =>
            run(async () => {
              await authRequest("tablet-login", value);
              window.location.assign(customerReturnPath(next));
            }),
          )}
        >
          <LabeledInput
            id="tablet-username"
            label="태블릿 아이디"
            autoComplete="username"
            required
            {...register("username")}
          />
          <LabeledInput
            id="tablet-password"
            label="비밀번호"
            type="password"
            autoComplete="current-password"
            required
            {...register("password")}
          />
          <Button className="w-full" disabled={busy || !configured}>
            {busy ? "확인 중…" : "태블릿 로그인"}
          </Button>
        </form>
      ) : (
        <Button
          className="h-14 w-full rounded-xl bg-[#FEE500] text-[#191919] hover:bg-[#FEE500]"
          disabled={busy || !configured}
          onClick={() =>
            run(async () => {
              const data = await authRequest("kakao", { next });
              window.location.assign(data.url);
            })
          }
        >
          <Image
            src="/auth/kakao-login.svg"
            loading="eager"
            alt=""
            width={224}
            height={46}
            unoptimized
          />
          <span className="sr-only">{busy ? "연결 중…" : "카카오 로그인"}</span>
        </Button>
      )}
      {error && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          {configured && !customer && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await authRequest("logout", {});
                  window.location.reload();
                })
              }
            >
              로그인 상태 초기화
            </Button>
          )}
        </div>
      )}
      {!customer && !tablet && (
        <Link
          href={customerReturnPath(next)}
          className="flex min-h-11 items-center justify-center text-sm underline underline-offset-4"
        >
          비회원으로 주문하기
        </Link>
      )}
    </div>
  );
}
