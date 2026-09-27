import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export function AdminButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      className={cn("min-h-11 px-3 lg:h-9 lg:min-h-9", className)}
      {...props}
    />
  );
}
