"use client";
import { getReceipt, clearReceipt } from "@/features/orders/submission-storage";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site/site-header";
import { formatWon } from "@/features/orders/calculations";
const subscribe = () => () => {};
const snapshot = getReceipt;
export default function OrderComplete() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  let receipt: {
    orderNumber: number;
    total: number;
    category: string;
    storageWarning?: boolean;
  } | null = null;
  try {
    receipt = raw ? JSON.parse(raw) : null;
  } catch {}
  return (
    <>
      <SiteHeader />
      <main
        id="main-content"
        className="mx-auto max-w-xl px-5 py-14 text-center"
      >
        <h1 className="text-3xl font-semibold">
          {receipt ? "주문이 접수되었어요." : "주문 접수 안내"}
        </h1>
        {receipt ? (
          <>
            <p className="mt-8 text-sm">카운터에 아래 번호를 알려주세요.</p>
            <p className="my-7 text-7xl font-bold text-primary">
              {receipt.orderNumber}번
            </p>
            <p className="text-xl">결제금액 {formatWon(receipt.total)}</p>
            <p className="my-6 text-muted-foreground">
              아직 결제 전이에요. 카운터에서 결제를 진행해주세요.
            </p>
            {receipt.storageWarning && (
              <p role="alert" className="my-4 text-sm text-destructive">
                브라우저 저장소를 사용할 수 없어요. 이 화면을 나가기 전에
                주문번호를 적어두고, 공용 기기는 남아 있는 입력을 확인해주세요.
              </p>
            )}
            <Button
              className="h-14 w-full"
              onClick={() => {
                clearReceipt();
                window.location.assign(
                  receipt?.category === "experience"
                    ? "/experience"
                    : "/product",
                );
              }}
            >
              다음 주문 시작
            </Button>
          </>
        ) : (
          <p className="mt-6">
            이 탭에서 확인할 접수 결과가 없어요. 접수한 주문은 카운터에
            문의해주세요.
          </p>
        )}
        <Link href="/" className="mt-6 inline-block underline">
          시작 화면
        </Link>
      </main>
    </>
  );
}
