"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AdminButton as Button } from "./admin-button";
import { AdminTextarea as Textarea } from "./admin-fields";
import { adminRequest } from "./client";

type Notice = { fruit_type: string; notice: string };

export function useFruitNotices(enabled: boolean) {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    adminRequest<Notice[]>("fruit-notices")
      .then((data) => {
        if (live) setNotices(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [enabled]);
  return { notices, error };
}

export function FruitNoticeEditor({
  fruit,
  notices,
  error,
  disabled,
}: {
  fruit: string;
  notices: Notice[] | null;
  error: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string>();
  const notice =
    saved ?? notices?.find((n) => n.fruit_type === fruit)?.notice ?? "";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {notice && (
        <p className="min-w-0 whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            disabled={disabled || !notices}
            aria-label={`${fruit} 안내사항 수정`}
            title="안내사항 수정"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>{fruit} 안내사항</DialogTitle>
          <DialogDescription className="sr-only">
            과일 이름 옆에 표시할 문구를 입력하세요. 비워서 저장하면 삭제됩니다.
          </DialogDescription>
          <FruitNoticeForm
            fruit={fruit}
            initial={notice}
            disabled={disabled}
            onSaved={(value) => {
              setSaved(value);
              setOpen(false);
            }}
            onCancel={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FruitNoticeForm({
  fruit,
  initial,
  disabled,
  onSaved,
  onCancel,
}: {
  fruit: string;
  initial: string;
  disabled: boolean;
  onSaved: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      aria-label={`${fruit} 안내사항 편집`}
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          await adminRequest("fruit-notices", {
            fruit_type: fruit,
            notice: value,
          });
          onSaved(value.trim());
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block space-y-2 text-sm font-medium">
        <span className="sr-only">{fruit} 안내사항</span>
        <Textarea
          value={value}
          maxLength={500}
          rows={2}
          disabled={disabled || busy}
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
      </label>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {value.length}/500자
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            취소
          </Button>
          <Button disabled={disabled || busy || value.trim() === initial}>
            {busy ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
