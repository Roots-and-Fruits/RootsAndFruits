import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getStaff } from "@/features/admin/auth";
import { ReceiptPreview } from "@/features/admin/receipt-preview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "주문서 인쇄",
  robots: { index: false, follow: false },
};

export default async function PrintOrder({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await getStaff())) redirect("/namu-admin/login");
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  return <ReceiptPreview orderId={id} />;
}
