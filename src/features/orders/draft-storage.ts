import { z } from "zod";
import { createEmptyDelivery, emptySender } from "./schema";

// Draft validation checks structure only: incomplete and unnormalized input is intentional.
const sender = z.object({
  name: z.string(),
  phone: z.string(),
  privacyConsent: z.boolean(),
  marketingConsent: z.boolean(),
});
const recipient = z.object({
  name: z.string(),
  phone: z.string(),
  postalCode: z.string(),
  address: z.string(),
  addressDetail: z.string(),
  sameAsSender: z.boolean().optional(),
});
const delivery = z.object({
  recipient,
  items: z.array(
    z.object({ productId: z.string(), quantity: z.number().int().positive() }),
  ),
  deliveryMode: z.enum(["regular", "scheduled"]),
  requestedDate: z.string(),
});
const edit = z.object({ sender, deliveries: z.array(delivery).min(1) });
const draftSchema = z
  .object({
    version: z.literal(1),
    sender,
    deliveries: z.array(delivery).min(1),
    activeIndex: z.number().int().nonnegative(),
    step: z.enum([
      "sender",
      "recipient",
      "address",
      "products",
      "date",
      "review",
      "edit",
    ]),
    editSection: z.union([z.literal("sender"), z.number().int().nonnegative()]),
    pendingDelivery: delivery.nullable(),
    editDraft: edit.nullable(),
  })
  .refine((value) => value.activeIndex < value.deliveries.length);

export type OrderDraft = z.infer<typeof draftSchema>;
export function emptyOrderDraft(): OrderDraft {
  return {
    version: 1,
    sender: { ...emptySender },
    deliveries: [createEmptyDelivery()],
    activeIndex: 0,
    step: "sender",
    editSection: "sender",
    pendingDelivery: null,
    editDraft: null,
  };
}
export function draftStorageKey(category: string, preview: boolean) {
  return `roots-and-fruits:order-draft:v1:${preview ? "preview" : "live"}:${category}`;
}

type Snapshot = {
  draft: OrderDraft;
  revision: number;
  notice: string;
  failed: boolean;
};
export function createDraftStore(key: string) {
  let snapshot: Snapshot | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());
  function restore() {
    let draft = emptyOrderDraft();
    let notice = "";
    let failed = false;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = draftSchema.safeParse(JSON.parse(raw));
        if (!parsed.success) throw new Error("Invalid draft");
        draft = parsed.data;
        notice = "작성 중이던 주문을 불러왔어요.";
      }
    } catch {
      notice = "임시 저장 내용을 불러오지 못했어요. 입력 내용을 확인해주세요.";
      failed = true;
    }
    snapshot = {
      draft,
      revision: (snapshot?.revision ?? 0) + 1,
      notice,
      failed,
    };
    emit();
  }
  function onStorage(event: StorageEvent) {
    if (event.key === key || event.key === null) restore();
  }
  function onPageShow(event: PageTransitionEvent) {
    if (event.persisted) restore();
  }
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => null,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        restore();
        window.addEventListener("storage", onStorage);
        window.addEventListener("pageshow", onPageShow);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          window.removeEventListener("storage", onStorage);
          window.removeEventListener("pageshow", onPageShow);
        }
      };
    },
    update<K extends keyof OrderDraft>(
      field: K,
      value: OrderDraft[K] | ((current: OrderDraft[K]) => OrderDraft[K]),
    ) {
      if (!snapshot) return;
      const next =
        typeof value === "function" ? value(snapshot.draft[field]) : value;
      const draft = { ...snapshot.draft, [field]: next };
      // RHF owns mutable form objects; detach before retaining a draft or edit baseline.
      const serialized = JSON.stringify(draft);
      if (serialized === JSON.stringify(snapshot.draft)) return;
      snapshot = { ...snapshot, draft: JSON.parse(serialized) as OrderDraft };
      try {
        localStorage.setItem(key, serialized);
        snapshot = {
          ...snapshot,
          notice: snapshot.failed ? "" : snapshot.notice,
          failed: false,
        };
      } catch {
        snapshot = {
          ...snapshot,
          failed: true,
          notice:
            "이 브라우저에서는 임시 저장을 할 수 없어요. 새로고침하거나 화면을 나가면 입력 내용이 사라질 수 있어요.",
        };
      }
      emit();
    },
    reset() {
      if (!snapshot) return;
      let failed = false;
      try {
        localStorage.removeItem(key);
      } catch {
        failed = true;
      }
      snapshot = {
        draft: emptyOrderDraft(),
        revision: snapshot.revision + 1,
        failed,
        notice: failed
          ? "브라우저의 임시 저장 내용을 지우지 못했어요. 브라우저 설정에서 사이트 데이터를 삭제해주세요."
          : "",
      };
      emit();
    },
  };
}
