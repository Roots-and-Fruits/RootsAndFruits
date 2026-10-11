"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAccountData } from "./client";
import { AccountLoading } from "./account-settings";
import { customerEpoch } from "@/features/auth/session-version";
import { synchronizeCustomerSession } from "@/features/auth/customer-cleanup";

export function AccountManagementPage() {
  const { data, loading, error, reload } = useAccountData<{
    deletionReady: boolean;
  }>("settings");
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">계정 관리</h1>
      <div className="rounded-2xl border bg-card p-5 sm:p-6">
        <h2 className="font-semibold">로그인 방식</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          카카오 계정으로 이용 중이에요. 별도의 비밀번호는 사용하지 않아요.
        </p>
      </div>
      {loading || error || !data ? (
        <AccountLoading error={error} reload={reload} />
      ) : (
        <div className="space-y-4 rounded-2xl border bg-card p-5 sm:p-6">
          <h2 className="font-semibold">회원 탈퇴</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            주소록과 기본 보내는 분 정보가 삭제되고 카카오 연결이 해제됩니다.
            이미 접수한 주문은 취소되지 않으며, 배송과 문의 처리를 위해 주문
            정보는 유지됩니다.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            탈퇴 후에는 내 주문을 조회할 수 없어요. 주문 문의에 필요한
            주문번호를 미리 확인해주세요. 다시 로그인하면 신규 회원으로 시작하며
            이전 주문과 주소록은 복원되지 않아요.
          </p>
          {!data.deletionReady && (
            <p className="text-sm text-muted-foreground">
              계정 삭제 기능을 준비 중이에요. 주문 관련 문의는 카운터에
              알려주세요.
            </p>
          )}
          <Button
            variant="outline"
            className="min-h-11 text-destructive"
            disabled={!data.deletionReady}
            onClick={() => {
              setOpen(true);
              setConfirmed(false);
              setDeleteError("");
            }}
          >
            계정 삭제
          </Button>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>계정을 삭제할까요?</DialogTitle>
            <DialogDescription className="leading-6">
              주소록과 기본 보내는 분은 삭제되며 복원할 수 없어요. 기존 주문은
              취소되지 않고 계속 처리되지만, 탈퇴 후 내 주문에서는 조회할 수
              없어요.
            </DialogDescription>
          </DialogHeader>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-6">
            <Checkbox
              className="mt-1"
              checked={confirmed}
              disabled={busy}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            삭제되는 정보와 기존 주문 유지 안내를 확인했어요.
          </label>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              돌아가기
            </Button>
            <Button
              variant="destructive"
              className="min-h-11"
              disabled={busy || !confirmed}
              onClick={async () => {
                setBusy(true);
                setDeleteError("");
                const epoch = customerEpoch();
                try {
                  const response = await fetch("/api/account/membership", {
                    method: "DELETE",
                    cache: "no-store",
                    headers: {
                      "Content-Type": "application/json",
                      "X-Customer-Epoch": epoch,
                    },
                    body: JSON.stringify({ confirmation: "delete-my-account" }),
                  });
                  const result = await response.json();
                  if (!response.ok)
                    throw new Error(
                      result.error || "계정을 삭제하지 못했어요.",
                    );
                  synchronizeCustomerSession();
                  window.location.replace("/account-deleted");
                } catch (e) {
                  setDeleteError(
                    e instanceof Error
                      ? e.message
                      : "계정을 삭제하지 못했어요.",
                  );
                  setBusy(false);
                }
              }}
            >
              {busy ? "삭제 중…" : "동의하고 계정 삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
