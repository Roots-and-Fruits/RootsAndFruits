"use client";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { LabeledInput } from "@/components/forms/labeled-input";
import { CustomerLoading } from "@/components/site/customer-loading";
import { useCustomerSession } from "./session-provider";
import { customerReturnPath } from "./redirect";
import { authRequest } from "./client";
import { KakaoLoginButton } from "./kakao-login-button";

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
  const session = useCustomerSession();
  const account = session.account;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(
      callbackError
        ? "카카오 로그인을 완료하지 못했어요. 다시 시도해주세요."
        : "",
    );
  const { register, handleSubmit } = useForm<{
    username: string;
    password: string;
  }>();
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
  if (configured && session.loading) return <CustomerLoading compact />;
  const customer = account?.kind === "kakao" || account?.kind === "tablet";
  return (
    <div className="mt-8 space-y-5">
      {!configured && (
        <p role="status" className="rounded-xl bg-secondary p-4 text-sm">
          로그인 서비스를 준비하고 있어요. 비회원 주문은 계속 이용할 수 있어요.
        </p>
      )}
      {tablet ? (
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
        <KakaoLoginButton
          busy={busy}
          disabled={!configured}
          onClick={() =>
            run(async () => {
              const data = await authRequest("kakao", { next });
              window.location.assign(data.url);
            })
          }
        />
      )}
      {(error || session.error) && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {error || session.error}
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
