import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { isCatalogCategory } from "@/features/catalog/types";
import { OrderEntry } from "@/features/orders/components/order-entry";
import { isOrderPreviewEnabled } from "@/lib/preview";

export const metadata = {
  title: "주문 시작",
  robots: { index: false, follow: false },
};

export default async function OrderStartPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { category } = await params;
  const preview = (await searchParams).preview === "1";
  if (!isCatalogCategory(category) || (preview && !isOrderPreviewEnabled()))
    notFound();
  return (
    <div className="order-page" data-order-category={category}>
      <SiteHeader compact />
      <main id="main-content">
        <OrderEntry
          key={`${category}:${preview}`}
          category={category}
          preview={preview}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
