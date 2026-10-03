"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { AdminButton } from "./admin-button";
import { adminRequest } from "./client";
import type { Checkout } from "./schema";
import { OrderReceipt } from "./order-receipt";
import styles from "./receipt.module.css";

export function ReceiptPreview({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Checkout | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    adminRequest<{ orders: Checkout[] }>(`orders/${orderId}`)
      .then(({ orders }) => {
        if (!live) return;
        if (!orders[0]) setError("주문을 찾을 수 없습니다.");
        else setOrder(orders[0]);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [orderId, revision]);

  return (
    <main id="main-content" className={styles.page}>
      <div className={styles.toolbar}>
        <div>
          <h1 className="font-semibold">주문서 미리보기</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            SLK-TS100 · 80mm 용지 · 인쇄 폭 72mm
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            인쇄 설정: 용지 80mm · 배율 100% · 여백 없음 · 머리글/바닥글 해제
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminButton disabled={!order} onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            인쇄
          </AdminButton>
          <AdminButton
            variant="outline"
            onClick={() => {
              setOrder(null);
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            다시 불러오기
          </AdminButton>
          <AdminButton asChild variant="ghost">
            <Link href="/namu-admin/orders">주문 관리</Link>
          </AdminButton>
        </div>
      </div>
      {error ? (
        <p role="alert" className={styles.message}>
          {error}
        </p>
      ) : order ? (
        <OrderReceipt order={order} />
      ) : (
        <p role="status" className={styles.message}>
          주문을 불러오는 중…
        </p>
      )}
    </main>
  );
}
