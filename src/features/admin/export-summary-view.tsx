import { kilograms, type ExportSummary } from "./export-summary";

export function ExportSummaryView({ summary }: { summary: ExportSummary }) {
  return (
    <div className="space-y-3">
      <p className="font-semibold">
        배송지 {summary.deliveryCount.toLocaleString("ko-KR")}건 · 총 준비 중량{" "}
        {kilograms(summary.totalGrams)}
      </p>
      <p className="text-sm text-muted-foreground">
        상품 설명·중량별로 구분하며, 주문 당시 중량 × 주문 수량으로 계산합니다.
        중량이 없는 상품은 합계에서 제외합니다.
      </p>
      <h3 className="text-sm font-semibold">상품별 상세</h3>
      <ul className="divide-y rounded-lg border px-3">
        {summary.products.map((product) => (
          <li
            key={product.key}
            className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm"
          >
            <div className="min-w-0 flex-1 break-words">
              <p className="font-medium">{product.label}</p>
              <p className="text-muted-foreground">
                {product.unitGrams === null
                  ? "중량 없음"
                  : kilograms(product.unitGrams)}{" "}
                × {product.quantity.toLocaleString("ko-KR")}개
              </p>
            </div>
            <strong className="shrink-0">
              {product.totalGrams === null
                ? `${product.quantity.toLocaleString("ko-KR")}개`
                : kilograms(product.totalGrams)}
            </strong>
          </li>
        ))}
      </ul>
      {summary.unweighedQuantity > 0 && (
        <p className="text-sm">
          중량 합계 제외 상품:{" "}
          {summary.unweighedQuantity.toLocaleString("ko-KR")}개
        </p>
      )}
    </div>
  );
}
