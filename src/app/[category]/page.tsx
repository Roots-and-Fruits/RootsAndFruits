import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageOpen } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { categoryContent, isCatalogCategory } from "@/features/catalog/types";
import { getCatalog } from "@/features/catalog/queries";
import { OrderWizard } from "@/features/orders/components/order-wizard";
import { dateInSeoul } from "@/features/orders/calculations";

export const dynamic = "force-dynamic";
export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  if (!isCatalogCategory(category)) notFound();
  const catalog = await getCatalog(category);
  return (
    <div className="order-page">
      <SiteHeader compact />
      <main id="main-content">
        {catalog.status === "ready" && catalog.products.length > 0 ? (
          <OrderWizard
            key={category}
            category={category}
            products={catalog.products}
            today={dateInSeoul()}
            maxDeliveryDays={catalog.maxDeliveryDays}
            bundleDiscount={catalog.bundleDiscount}
          />
        ) : (
          <section className="mx-auto max-w-2xl px-5 py-16 text-center">
            <PackageOpen className="mx-auto mb-7 size-10 text-primary" />
            <p className="eyebrow">{categoryContent[category].label}</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              주문 서비스를 준비하고 있어요.
            </h1>
            <p className="mt-5 text-sm leading-7 text-muted-foreground">
              지금은 온라인 접수를 이용할 수 없어요.
              <br />
              상품과 택배 접수는 현장 카운터에 문의해주세요.
            </p>
            <Link
              href="/"
              className="mt-8 inline-flex min-h-12 items-center font-semibold text-primary underline underline-offset-4"
            >
              시작 화면으로
            </Link>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
