import { AccountManagementPage } from "@/features/account/account-management";
import { notFound } from "next/navigation";
import {
  AddressBookPage,
  SenderSettingsPage,
} from "@/features/account/account-settings";
import { CustomerOrdersPage } from "@/features/account/order-history";
export default async function AccountSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section === "orders") return <CustomerOrdersPage />;
  if (section === "addresses") return <AddressBookPage />;
  if (section === "settings") return <AccountManagementPage />;
  if (section === "sender") return <SenderSettingsPage />;
  notFound();
}
