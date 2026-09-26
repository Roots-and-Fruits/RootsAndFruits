import { ClipboardList, CreditCard, MapPin } from "lucide-react";

const steps = [
  {
    icon: ClipboardList,
    title: "상품을 골라주세요",
    body: "보내는 분과 받는 분을 입력하고, 배송지마다 상품을 선택해요.",
  },
  {
    icon: CreditCard,
    title: "카운터에서 결제해요",
    body: "접수 후 받은 주문번호를 말씀해주세요. 여러 배송지도 한 번에 결제해요.",
  },
  {
    icon: MapPin,
    title: "각자의 집으로 보내요",
    body: "입력한 배송지로 보내드려요. 접수 후 변경은 카운터에 문의해주세요.",
  },
];
export function OrderGuide({ stacked = false }: { stacked?: boolean }) {
  return (
    <ol className={`grid gap-8 ${stacked ? "" : "md:grid-cols-3"}`}>
      {steps.map(({ icon: Icon, title, body }, index) => (
        <li key={title} className="flex gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
            <Icon className="size-5" strokeWidth={1.6} aria-hidden="true" />
          </span>
          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">
              STEP 0{index + 1}
            </p>
            <h3 className="font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function OrderGuideNotes() {
  return (
    <div className="max-w-2xl rounded-3xl bg-secondary p-7 text-sm leading-7">
      <p>
        여러 배송지에 서로 다른 상품을 보내실 수 있어요. 결제주문번호는 하나로
        안내해드려요.
      </p>
      <p className="mt-3">
        결제는 현장 카운터에서 진행해요. 접수한 내용을 바꾸려면 카운터에
        문의해주세요.
      </p>
      <p className="mt-3">비회원 주문 확인도 카운터에서 도와드려요.</p>
    </div>
  );
}
