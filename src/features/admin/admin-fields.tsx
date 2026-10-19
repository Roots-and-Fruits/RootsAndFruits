import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { LabeledInput } from "@/components/forms/labeled-input";
import { cn } from "@/lib/utils";

const fieldClass = "h-11 rounded-lg px-3 text-base lg:h-9 lg:text-sm";

export function AdminInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return <Input className={cn(fieldClass, className)} {...props} />;
}

export function AdminLabeledInput({
  className,
  ...props
}: ComponentProps<typeof LabeledInput>) {
  return (
    <div className="min-w-0 lg:[&>div]:space-y-1.5">
      <LabeledInput className={cn(fieldClass, className)} {...props} />
    </div>
  );
}

export function AdminSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        fieldClass,
        "block w-full min-w-0 border border-input bg-background outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

export function AdminTextarea({
  className,
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "block w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 lg:text-sm",
        className,
      )}
      {...props}
    />
  );
}
