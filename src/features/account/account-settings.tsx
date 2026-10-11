"use client";
import { CustomerLoading } from "@/components/site/customer-loading";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAccountData, useAccountRequest } from "./client";
import {
  savedSenderSchema,
  type Preferences,
  type SavedAddress,
  type SavedSender,
} from "./schema";
import {
  AddressDialog,
  AddressSummary,
  SavedContactFields,
} from "./address-book";

export function AccountLoading({
  error,
  reload,
}: {
  error?: string;
  reload?: () => void;
}) {
  if (!error) return <CustomerLoading compact />;
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-6">
      <p role={error ? "alert" : "status"}>
        {error || "정보를 불러오고 있어요."}
      </p>
      {error && reload && (
        <Button variant="outline" onClick={reload}>
          다시 불러오기
        </Button>
      )}
    </div>
  );
}
export function AddressBookPage() {
  const { data, loading, error, reload } =
    useAccountData<Preferences>("preferences");
  const request = useAccountRequest();
  const [removing, setRemoving] = useState<SavedAddress | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  if (loading || error || !data)
    return <AccountLoading error={error} reload={reload} />;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">내 주소록</h1>
        <AddressDialog onSaved={reload}>
          <Button>배송지 추가</Button>
        </AddressDialog>
      </div>
      <p className="text-sm text-muted-foreground">
        자주 보내는 배송지를 저장해두고 주문할 때 선택하세요.
      </p>
      {!data.addresses.length && (
        <p className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          아직 저장한 배송지가 없어요.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data.addresses.map((address) => (
          <article
            key={address.id}
            className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-5"
          >
            <AddressSummary address={address} />
            <div className="flex gap-2">
              <AddressDialog address={address} onSaved={reload}>
                <Button variant="outline" size="sm">
                  수정
                </Button>
              </AddressDialog>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeleteError("");
                  setRemoving(address);
                }}
              >
                삭제
              </Button>
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>배송지를 삭제할까요?</DialogTitle>
            <DialogDescription>
              {removing?.label} 배송지가 주소록에서 삭제됩니다. 이미 접수한
              주문에는 영향이 없어요.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              닫기
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (!removing) return;
                setBusy(true);
                setDeleteError("");
                try {
                  await request(`addresses/${removing.id}`, "DELETE");
                  setRemoving(null);
                  reload();
                } catch (e) {
                  setDeleteError(
                    e instanceof Error ? e.message : "삭제하지 못했어요.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "삭제 중…" : "배송지 삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
function SenderForm({ sender }: { sender: SavedSender | null }) {
  const form = useForm<SavedSender>({
    resolver: zodResolver(savedSenderSchema),
    defaultValues: sender ?? { name: "", phone: "" },
  });
  const request = useAccountRequest();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  return (
    <FormProvider {...form}>
      <form
        className="max-w-xl space-y-6 rounded-2xl border bg-card p-5 sm:p-8"
        noValidate
        onSubmit={form.handleSubmit(async (value) => {
          setError("");
          setNotice("");
          try {
            await request("sender", "PUT", value);
            form.reset(value);
            setNotice("기본 보내는 분을 저장했어요. 새 주문부터 입력됩니다.");
          } catch (e) {
            setError(e instanceof Error ? e.message : "저장하지 못했어요.");
          }
        })}
      >
        <SavedContactFields sender />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-primary">
            {notice}
          </p>
        )}
        <Button disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "저장 중…" : "기본 보내는 분 저장"}
        </Button>
      </form>
    </FormProvider>
  );
}
export function SenderSettingsPage() {
  const { data, loading, error, reload } =
    useAccountData<Preferences>("preferences");
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-semibold">기본 보내는 분</h1>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        새 주문에 이름과 휴대폰 번호를 미리 채워드려요. 주문 중에 수정한 내용은
        해당 주문에만 적용되며, 기본값은 이곳에서 변경할 수 있어요.
      </p>
      {loading || error || !data ? (
        <AccountLoading error={error} reload={reload} />
      ) : (
        <SenderForm sender={data.sender} />
      )}
    </section>
  );
}
