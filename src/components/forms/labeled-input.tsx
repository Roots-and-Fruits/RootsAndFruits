import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type Props = ComponentProps<typeof Input> & {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};
export function LabeledInput({
  id,
  label,
  error,
  hint,
  className,
  "aria-describedby": describedBy,
  ...props
}: Props) {
  return (
    <div className="space-y-2.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
      </Label>
      <Input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [describedBy, error ? `${id}-error` : hint ? `${id}-hint` : undefined]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={cn(
          "h-14 rounded-xl bg-background px-4 text-base",
          className,
        )}
        {...props}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          tabIndex={-1}
          className="text-sm text-destructive"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${id}-hint`}
          className="text-xs leading-5 text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
