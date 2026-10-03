"use client";
import { useState } from "react";
import { AdminButton as Button } from "./admin-button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
export function ConfirmAction({
  label,
  description,
  disabled,
  onConfirm,
}: {
  label: string;
  description: string;
  disabled?: boolean;
  onConfirm: () => void | Promise<string | null | void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = pending || disabled;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (saving) return;
        setError(null);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={saving}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>
              돌아가기
            </Button>
          </DialogClose>
          <Button
            disabled={saving}
            onClick={async () => {
              setPending(true);
              setError(null);
              try {
                const message = await onConfirm();
                if (message) setError(message);
                else setOpen(false);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "처리하지 못했습니다. 다시 시도해주세요.",
                );
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? "처리 중…" : "확인"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
