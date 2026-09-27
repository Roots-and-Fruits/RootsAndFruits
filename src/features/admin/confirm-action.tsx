"use client";
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
  onConfirm: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">돌아가기</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={onConfirm}>확인</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
