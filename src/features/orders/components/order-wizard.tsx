"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Check, Leaf, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  categoryContent,
  type CatalogCategory,
  type Product,
} from "@/features/catalog/types";
import { createEmptyDelivery, type DeliveryDraft } from "../schema";
import { addDays, calculateTotal, formatWon } from "../calculations";
import { SenderStep } from "./sender-step";
import { RecipientStep } from "./recipient-step";
import { AddressStep } from "./address-step";
import { ProductStep } from "./product-step";
import { DeliveryDateStep } from "./delivery-date-step";
import { OrderEdit } from "./order-edit";
import { getPendingSubmission } from "../submission-storage";
import { SubmitOrder } from "./submit-order";
import { OrderReview } from "./order-review";

import {
  createDraftStore,
  draftStorageKey,
  type OrderDraft,
} from "../draft-storage";

function subscribeSubmission(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("order-submission", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("order-submission", listener);
  };
}

type Step = OrderDraft["step"];
const headings: Record<Step, { title: string; description: string }> = {
  edit: {
    title: "주문 정보를 수정해주세요.",
    description:
      "모든 정보를 이 화면에서 수정하고, 완료하면 주문 확인으로 돌아가요.",
  },
  sender: {
    title: "보내는 분을 알려주세요.",
    description: "이름과 연락 가능한 휴대폰 번호를 입력해주세요.",
  },
  recipient: {
    title: "누구에게 보내시나요?",
    description: "과일을 받으실 분의 이름과 연락처를 입력해주세요.",
  },
  address: {
    title: "어디로 보내드릴까요?",
    description: "주소를 검색한 뒤 상세주소까지 확인해주세요.",
  },
  products: {
    title: "보내실 과일을 골라주세요.",
    description: "이 배송지에 보낼 상품의 수량을 선택해주세요.",
  },
  date: {
    title: "배송 일정을 선택해주세요.",
    description: "빠른 배송 또는 원하는 날짜의 예약 배송을 선택하세요.",
  },
  review: {
    title: "보내는 마음, 한 번 더 확인해요.",
    description: "주소와 상품을 확인해주세요. 다른 배송지도 추가할 수 있어요.",
  },
};

export function OrderWizard({
  category,
  products,
  today,
  maxDeliveryDays,
  preview = false,
  bundleDiscount = 0,
}: {
  category: CatalogCategory;
  products: Product[];
  today: string;
  maxDeliveryDays: number;
  preview?: boolean;
  bundleDiscount?: number;
}) {
  const [store] = useState(() =>
    createDraftStore(draftStorageKey(category, preview)),
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  const pendingSubmission = useSyncExternalStore(
    subscribeSubmission,
    () => {
      if (preview) return null;
      try {
        return getPendingSubmission(category);
      } catch {
        return null;
      }
    },
    () => null,
  );
  if (snapshot && pendingSubmission)
    return (
      <section className="mx-auto max-w-xl space-y-6 px-5 py-12">
        <h1 className="text-2xl font-semibold">접수 결과를 확인해주세요.</h1>
        <p>
          이전에 보낸 주문의 결과를 아직 확인하지 못했어요. 같은 요청을 다시
          확인하므로 주문이 중복 접수되지 않아요. 확인이 끝날 때까지 새 주문을
          시작할 수 없어요.
        </p>
        <SubmitOrder
          category={category}
          sender={snapshot.draft.sender}
          deliveries={snapshot.draft.deliveries}
        />
      </section>
    );
  if (!snapshot)
    return (
      <p className="px-5 py-8 text-sm text-muted-foreground" role="status">
        작성 내용을 확인하고 있어요.
      </p>
    );
  // Persisted input can outlive the catalog. Preserve it without rendering a broken total
  // or silently dropping products; catalog replacement policy is a separate decision.
  let canRestore = !(
    category === "experience" && snapshot.draft.step === "date"
  );
  try {
    calculateTotal(snapshot.draft.deliveries, products);
    if (snapshot.draft.editDraft)
      calculateTotal(snapshot.draft.editDraft.deliveries, products);
    if (snapshot.draft.pendingDelivery)
      calculateTotal([snapshot.draft.pendingDelivery], products);
  } catch {
    canRestore = false;
  }
  if (!canRestore)
    return (
      <section className="mx-auto max-w-2xl space-y-5 px-5 py-8">
        <h1 className="text-xl font-semibold">
          저장된 주문을 확인할 수 없어요.
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          저장된 상품이나 단계 정보를 현재 화면에서 사용할 수 없어요. 입력
          내용은 지우지 않았어요. 새로고침 후 다시 확인하거나 처음부터
          작성해주세요.
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">처음부터</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>처음부터 다시 작성할까요?</DialogTitle>
              <DialogDescription>
                현재 입력한 주문 정보와 임시 저장 내용이 지워져요.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">취소</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button onClick={() => store.reset()}>입력 초기화</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    );
  return (
    <OrderWizardContent
      key={snapshot.revision}
      {...{
        category,
        products,
        today,
        maxDeliveryDays,
        bundleDiscount,
        preview,
        store,
        snapshot,
      }}
    />
  );
}

function OrderWizardContent({
  category,
  products,
  today,
  maxDeliveryDays,
  preview,
  bundleDiscount,
  store,
  snapshot,
}: {
  category: CatalogCategory;
  products: Product[];
  today: string;
  maxDeliveryDays: number;
  preview: boolean;
  bundleDiscount: number;
  store: ReturnType<typeof createDraftStore>;
  snapshot: NonNullable<
    ReturnType<ReturnType<typeof createDraftStore>["getSnapshot"]>
  >;
}) {
  const {
    sender,
    deliveries,
    activeIndex,
    step,
    editSection,
    pendingDelivery,
    editDraft,
  } = snapshot.draft;
  const resetKey = snapshot.revision;
  const setSender = (value: OrderDraft["sender"]) =>
    store.update("sender", value);
  const setDeliveries = (
    value:
      | OrderDraft["deliveries"]
      | ((current: OrderDraft["deliveries"]) => OrderDraft["deliveries"]),
  ) => store.update("deliveries", value);
  const setActiveIndex = (value: number) => store.update("activeIndex", value);
  const setStep = (value: Step) => store.update("step", value);
  const setEditSection = (value: "sender" | number) =>
    store.update("editSection", value);
  const setPendingDelivery = (value: DeliveryDraft | null) =>
    store.update("pendingDelivery", value);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const lastNavigation = useRef({ step, activeIndex, resetKey });
  const delivery = deliveries[activeIndex];
  const content = categoryContent[category];
  const progressSteps: { label: string; steps: Step[] }[] = [
    { label: "보내는 분", steps: ["sender"] },
    { label: "받는 분", steps: ["recipient", "address"] },
    { label: "상품 선택", steps: ["products"] },
    ...(category === "product"
      ? [{ label: "배송 일정", steps: ["date" as Step] }]
      : []),
    { label: "최종 확인", steps: ["review", "edit"] },
  ];
  const progress = progressSteps.findIndex((item) => item.steps.includes(step));

  useEffect(() => {
    const previous = lastNavigation.current;
    if (
      previous.step === step &&
      previous.activeIndex === activeIndex &&
      previous.resetKey === resetKey
    )
      return;
    lastNavigation.current = { step, activeIndex, resetKey };
    if (step === "edit") return;
    titleRef.current?.focus({ preventScroll: true });
    titleRef.current?.scrollIntoView({ block: "start" });
  }, [step, activeIndex, resetKey]);

  function updateDelivery(patch: Partial<DeliveryDraft>) {
    setDeliveries((current) =>
      current.map((item, index) =>
        index === activeIndex ? { ...item, ...patch } : item,
      ),
    );
  }
  function reset() {
    store.reset();
  }
  function finishDelivery() {
    setPendingDelivery(null);
    setStep("review");
  }
  function addRecipient() {
    setDeliveries((current) => [
      ...current,
      pendingDelivery ?? createEmptyDelivery(),
    ]);
    setPendingDelivery(null);
    setActiveIndex(deliveries.length);
    setStep("recipient");
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-12 sm:px-10">
      {preview && (
        <aside className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 sm:mb-6 sm:px-4 sm:py-3">
          <span className="sm:hidden">
            미리보기 · 실제 주문은 접수되지 않아요.
          </span>
          <span className="hidden sm:inline">
            <strong>화면 미리보기</strong> · 가상 상품과 가격이에요. 실제 주문은
            접수되지 않아요.
          </span>
          <Link
            href="/"
            className="hidden underline underline-offset-4 sm:inline"
          >
            시작 화면
          </Link>
        </aside>
      )}
      <div className="grid items-start gap-4 sm:gap-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-14">
        <aside className="lg:sticky lg:top-8">
          <Badge
            variant="secondary"
            className="mb-5 hidden rounded-full px-3 py-1.5 text-xs sm:inline-flex"
          >
            {content.label}
          </Badge>
          <p className="hidden text-[10px] tracking-[0.2em] text-muted-foreground lg:block">
            {content.eyebrow}
          </p>
          <h2 className="mt-4 hidden whitespace-pre-line text-[30px] font-semibold leading-[1.5] tracking-[-0.05em] lg:block">
            {content.title}
          </h2>
          <p className="mt-5 hidden text-sm leading-7 text-muted-foreground lg:block">
            {content.description}
          </p>
          <div
            className="sm:hidden"
            role="progressbar"
            aria-label="주문 진행 단계"
            aria-valuemin={1}
            aria-valuemax={progressSteps.length}
            aria-valuenow={progress + 1}
            aria-valuetext={`${progress + 1}/${progressSteps.length} · ${step === "edit" ? "주문 수정" : step === "address" ? "받는 분 · 주소" : progressSteps[progress].label}`}
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-primary">
                {step === "edit"
                  ? "주문 수정"
                  : step === "address"
                    ? "받는 분 · 주소"
                    : progressSteps[progress].label}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {progress + 1} / {progressSteps.length}
              </span>
            </div>
            <div className="flex gap-1.5" aria-hidden="true">
              {progressSteps.map((item, index) => (
                <span
                  key={item.label}
                  className={`h-1 flex-1 rounded-full ${index <= progress ? "bg-primary" : "bg-border"}`}
                />
              ))}
            </div>
          </div>
          <ol
            className="hidden justify-between gap-2 sm:flex lg:mt-10 lg:flex-col lg:gap-6"
            aria-label="주문 진행 단계"
          >
            {progressSteps.map((item, index) => (
              <li
                key={item.label}
                aria-current={index === progress ? "step" : undefined}
                className={`flex flex-col items-center gap-2 lg:flex-row lg:gap-3 ${index === progress ? "text-primary" : "text-muted-foreground"}`}
              >
                <span
                  className={`flex size-7 shrink-0 sm:size-11 sm:text-sm items-center justify-center rounded-full text-xs font-semibold ${index <= progress ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
                >
                  {index < progress ? (
                    <Check className="size-3.5 sm:size-5" />
                  ) : (
                    `0${index + 1}`
                  )}
                </span>
                <span className="text-[11px] font-medium sm:text-xs lg:text-sm">
                  {item.label}
                </span>
              </li>
            ))}
          </ol>
          <div className="mt-10 hidden rounded-2xl bg-secondary/70 p-5 lg:block">
            <Leaf className="mb-3 size-5 text-primary" />
            <p className="text-sm font-medium">
              여러 곳으로 보내도,
              <br />
              결제는 한 번에.
            </p>
            <p className="mt-4 text-xs text-muted-foreground">현재 선택 금액</p>
            <p className="mt-1 text-xl font-semibold text-primary tabular-nums">
              {formatWon(calculateTotal(deliveries, products, bundleDiscount))}
            </p>
          </div>
        </aside>
        <section className="min-w-0 rounded-3xl border border-border bg-card p-5 sm:p-9">
          <div className="mb-5 sm:mb-8">
            <div className="mb-2 flex items-center justify-between gap-2 sm:mb-4">
              <p className="eyebrow">
                <span className="sm:hidden">{content.label}</span>
                <span className="hidden sm:inline">STEP 0{progress + 1}</span>
                {step !== "sender" && step !== "review" && step !== "edit"
                  ? ` / 배송지 ${activeIndex + 1}`
                  : ""}
              </p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                  >
                    <RotateCcw className="size-3.5" />
                    처음부터
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>처음부터 다시 작성할까요?</DialogTitle>
                    <DialogDescription>
                      현재 입력한 주문 정보가 지워져요. 로그인 상태는 유지돼요.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">계속 작성</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button onClick={reset}>입력 초기화</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <h1
              ref={titleRef}
              tabIndex={-1}
              className="scroll-mt-4 text-[22px] sm:scroll-mt-8 sm:text-2xl font-semibold leading-snug tracking-[-0.045em] outline-none sm:text-[28px]"
            >
              {headings[step].title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground sm:mt-3">
              {step === "products"
                ? `${delivery.recipient.name}님께 ${headings[step].description}`
                : headings[step].description}
            </p>
          </div>
          <div key={`${step}-${activeIndex}-${resetKey}`}>
            {step === "sender" && (
              <SenderStep
                value={sender}
                onChange={setSender}
                onNext={(value) => {
                  setSender(value);
                  setStep("recipient");
                }}
              />
            )}
            {step === "recipient" && (
              <RecipientStep
                value={delivery.recipient}
                onChange={(value) =>
                  updateDelivery({
                    recipient: { ...delivery.recipient, ...value },
                  })
                }
                sender={sender}
                onNext={(value) => {
                  updateDelivery({
                    recipient: { ...delivery.recipient, ...value },
                  });
                  setStep("address");
                }}
                onBack={(value) => {
                  updateDelivery({
                    recipient: { ...delivery.recipient, ...value },
                  });
                  if (activeIndex > 0) {
                    setPendingDelivery({
                      ...delivery,
                      recipient: { ...delivery.recipient, ...value },
                    });
                    setDeliveries((current) =>
                      current.filter((_, index) => index !== activeIndex),
                    );
                    setActiveIndex(0);
                    setStep("review");
                  } else {
                    setStep("sender");
                  }
                }}
              />
            )}
            {step === "address" && (
              <AddressStep
                value={delivery.recipient}
                onChange={(value) =>
                  updateDelivery({
                    recipient: { ...delivery.recipient, ...value },
                  })
                }
                preview={preview}
                onNext={(value) => {
                  updateDelivery({
                    recipient: { ...delivery.recipient, ...value },
                  });
                  setStep("products");
                }}
                onBack={(value) => {
                  updateDelivery({
                    recipient: { ...delivery.recipient, ...value },
                  });
                  setStep("recipient");
                }}
              />
            )}
            {step === "products" && (
              <ProductStep
                products={products}
                bundleDiscount={bundleDiscount}
                items={delivery.items}
                onChange={(items) => updateDelivery({ items })}
                onBack={() => setStep("address")}
                onNext={() => {
                  if (category === "experience") {
                    updateDelivery({
                      deliveryMode: "regular",
                      requestedDate: addDays(today, 2),
                    });
                    finishDelivery();
                  } else {
                    if (!delivery.requestedDate)
                      updateDelivery({ requestedDate: addDays(today, 2) });
                    setStep("date");
                  }
                }}
              />
            )}
            {step === "date" && (
              <DeliveryDateStep
                today={today}
                maxDays={maxDeliveryDays}
                mode={delivery.deliveryMode}
                date={delivery.requestedDate}
                onChange={(deliveryMode, requestedDate) =>
                  updateDelivery({ deliveryMode, requestedDate })
                }
                onBack={() => setStep("products")}
                onNext={finishDelivery}
              />
            )}
            {step === "edit" && (
              <OrderEdit
                sender={editDraft?.sender ?? sender}
                deliveries={editDraft?.deliveries ?? deliveries}
                onChange={(value) => store.update("editDraft", value)}
                products={products}
                bundleDiscount={bundleDiscount}
                category={category}
                today={today}
                maxDays={maxDeliveryDays}
                preview={preview}
                initialSection={editSection}
                onSave={(value) => {
                  store.update("editDraft", null);
                  setSender(value.sender);
                  setDeliveries(value.deliveries);
                  setStep("review");
                }}
                onCancel={() => {
                  store.update("editDraft", null);
                  setStep("review");
                }}
              />
            )}
            {step === "review" && (
              <OrderReview
                category={category}
                sender={sender}
                deliveries={deliveries}
                products={products}
                bundleDiscount={bundleDiscount}
                preview={preview}
                onEditSender={() => {
                  store.update("editDraft", null);
                  setEditSection("sender");
                  setStep("edit");
                }}
                onEdit={(index) => {
                  store.update("editDraft", null);
                  setEditSection(index);
                  setStep("edit");
                }}
                onRemove={(index) => {
                  setDeliveries((current) =>
                    current.filter((_, i) => i !== index),
                  );
                  setActiveIndex(0);
                }}
                hasPendingDelivery={pendingDelivery !== null}
                onAdd={addRecipient}
              />
            )}
          </div>
          <p
            role="status"
            className={`mt-6 text-xs leading-5 ${snapshot.failed ? "text-destructive" : "text-muted-foreground"}`}
          >
            {snapshot.notice && (
              <span className="block">{snapshot.notice}</span>
            )}
            {!snapshot.failed &&
              "입력 내용은 이 브라우저에 임시 저장돼요. 공용 기기에서는 다음 분이 이용하기 전에 ‘처음부터’를 눌러주세요."}
          </p>
        </section>
      </div>
    </div>
  );
}
