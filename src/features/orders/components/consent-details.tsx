import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Legacy consent text, with order notification purpose added for order notifications.
export function ConsentDetails({ marketing = false }: { marketing?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger
        type="button"
        className="shrink-0 text-xs text-muted-foreground underline underline-offset-4"
      >
        자세히
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {marketing
              ? "마케팅 목적의 개인정보 수집 및 이용 동의"
              : "개인정보 수집 및 이용 동의"}
          </DialogTitle>
          <DialogDescription>동의 내용을 확인해주세요.</DialogDescription>
        </DialogHeader>
        <dl className="space-y-5 py-3 text-sm leading-6">
          <div>
            <dt className="font-semibold">수집 항목</dt>
            <dd className="text-muted-foreground">이름, 휴대폰번호, 주소</dd>
          </div>
          <div>
            <dt className="font-semibold">이용 목적</dt>
            <dd className="text-muted-foreground">
              {marketing
                ? "상품 안내 이벤트 알림서비스"
                : "상품 택배배송 및 주문 접수·발송 안내"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">보유 및 이용 기간</dt>
            <dd className="text-muted-foreground">발송일로부터 1년</dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
