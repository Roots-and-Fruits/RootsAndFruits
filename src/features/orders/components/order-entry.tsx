"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CustomerLoading } from "@/components/site/customer-loading";
import { type CatalogCategory } from "@/features/catalog/types";
import {
  clearOrderDraft,
  createDraftStore,
  draftStorageKey,
  hasOrderDraft,
} from "../draft-storage";
import { getPendingSubmission } from "../submission-storage";
import { OrderLoginGate } from "@/features/auth/order-login-gate";

export function OrderEntry({
  category,
  preview,
}: {
  category: CatalogCategory;
  preview: boolean;
}) {
  const entry = <DraftEntry category={category} preview={preview} />;
  return preview ? (
    entry
  ) : (
    <OrderLoginGate next={`/${category}`}>{entry}</OrderLoginGate>
  );
}

function DraftEntry({
  category,
  preview,
}: {
  category: CatalogCategory;
  preview: boolean;
}) {
  const router = useRouter();
  const key = draftStorageKey(category, preview);
  const destination = `${preview ? "/preview" : ""}/${category}`;
  const [store] = useState(() => createDraftStore(key));
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const [error, setError] = useState("");
  const continueButton = useRef<HTMLButtonElement>(null);
  const pending = useSyncExternalStore(
    subscribeSubmission,
    () => !preview && Boolean(getPendingSubmission(category)),
    () => false,
  );
  const needsChoice = Boolean(
    snapshot && (snapshot.failed || hasOrderDraft(snapshot.draft)),
  );

  useEffect(() => {
    if (snapshot && (pending || !needsChoice)) router.replace(destination);
  }, [snapshot, pending, needsChoice, destination, router]);

  function startOver() {
    // Recheck at the moment of the click: another tab may have submitted meanwhile.
    if (!preview && getPendingSubmission(category)) {
      router.replace(destination);
      return;
    }
    if (!clearOrderDraft(key)) {
      setError(
        "임시 저장 내용을 지우지 못했어요. 브라우저의 저장소 설정을 확인한 뒤 다시 시도해주세요.",
      );
      return;
    }
    router.replace(destination);
  }

  return (
    <section>
      <CustomerLoading />
      <Dialog
        open={needsChoice && !pending}
        onOpenChange={(open) => {
          if (!open) router.replace("/");
        }}
      >
        <DialogContent
          data-order-category={category}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            continueButton.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="pr-6 text-xl font-semibold">
              작성 중인 주문이 있어요
            </DialogTitle>
            <DialogDescription className="leading-6">
              이전에 입력한 내용으로 이어서 작성할까요?
              <br />
              처음부터 시작하면 이 주문의 작성 내용이 지워져요.
            </DialogDescription>
          </DialogHeader>
          {snapshot?.failed && (
            <p role="alert" className="text-sm text-destructive">
              임시 저장 내용을 확인하지 못했어요. 이어서 작성한 뒤 입력 내용을
              확인하거나 처음부터 시작해주세요.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button className="min-h-11" variant="outline" onClick={startOver}>
              처음부터
            </Button>
            <Button
              className="min-h-11"
              ref={continueButton}
              onClick={() => router.replace(destination)}
            >
              이어 작성하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function subscribeSubmission(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("order-submission", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("order-submission", listener);
  };
}
