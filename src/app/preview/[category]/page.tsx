import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { isCatalogCategory } from "@/features/catalog/types";
import { previewProducts } from "@/features/catalog/preview-data";
import { OrderWizard } from "@/features/orders/components/order-wizard";
import { dateInSeoul } from "@/features/orders/calculations";
import { isOrderPreviewEnabled } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  title: "주문 화면 미리보기",
};
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  if (!isOrderPreviewEnabled()) notFound();
  const { category } = await params;
  if (!isCatalogCategory(category)) notFound();
  return (
    <div className="order-page">
      <SiteHeader compact />
      <main id="main-content">
        <OrderWizard
          key={category}
          category={category}
          products={previewProducts.filter(
            (product) => product.category === category,
          )}
          today={dateInSeoul()}
          maxDeliveryDays={14}
          preview
        />
      </main>
      <SiteFooter />
    </div>
  );
}
