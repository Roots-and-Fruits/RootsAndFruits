import { notFound } from "next/navigation";
import { z } from "zod";
import { CustomerOrderPage } from "@/features/account/order-history";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  return <CustomerOrderPage key={id} id={id} />;
}
