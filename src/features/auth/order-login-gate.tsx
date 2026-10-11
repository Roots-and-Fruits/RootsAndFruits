"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CustomerLoading } from "@/components/site/customer-loading";
import { useCustomerSession } from "./session-provider";
import { authRequest } from "./client";
import { KakaoLoginButton } from "./kakao-login-button";

export function OrderLoginGate({
  children,
  next,
}: {
  children: ReactNode;
  next: "/product" | "/experience";
}) {
  const router = useRouter();
  const session = useCustomerSession();
  const [continued, setContinued] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const customer =
    session.account?.kind === "kakao" || session.account?.kind === "tablet";
  const status = session.loading
    ? "checking"
    : session.error
      ? "error"
      : customer || continued
        ? "continue"
        : "guest";

  if (status === "continue") return children;
  return (
    <section>
      <CustomerLoading />
      <Dialog
        open={status !== "checking"}
        onOpenChange={(open) => {
          if (!open && !busy) router.replace("/");
        }}
      >
        <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle className="pr-6 text-xl font-semibold">
              {status === "error"
                ? "로그인 상태를 확인해주세요"
                : "로그인하고 더 편하게 주문하세요"}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {status === "error"
                ? "로그인 상태를 다시 확인하거나 로그인 화면에서 진행해주세요."
                : "주소록을 불러와 간편하게 주문하고, 마이페이지에서 주문 내역과 배송 현황을 확인할 수 있어요."}
            </DialogDescription>
          </DialogHeader>
          {(error || session.error) && (
            <p role="alert" className="text-sm text-destructive">
              {error || session.error}
            </p>
          )}
          {status === "error" ? (
            <div className="space-y-2">
              <Button
                className="min-h-11 w-full"
                onClick={() => {
                  setError("");
                  session.refresh();
                }}
              >
                다시 확인
              </Button>
              <Button asChild variant="outline" className="min-h-11 w-full">
                <Link href={`/login?next=${encodeURIComponent(next)}`}>
                  로그인 화면으로
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2 pt-2">
              <KakaoLoginButton
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const data = await authRequest("kakao", { next });
                    window.location.assign(data.url);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "로그인을 시작하지 못했어요.",
                    );
                    setBusy(false);
                  }
                }}
              />
              <Button
                variant="outline"
                className="min-h-12 w-full"
                disabled={busy}
                onClick={() => setContinued(true)}
              >
                비회원으로 계속하기
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
