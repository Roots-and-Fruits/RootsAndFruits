import { HandHeart, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { categoryContent, type CatalogCategory } from "./types";
import { cn } from "@/lib/utils";

export function CategoryBadge({
  category,
  className,
}: {
  category: CatalogCategory;
  className?: string;
}) {
  const Icon = category === "experience" ? HandHeart : Package;
  return (
    <Badge
      className={cn(
        "h-auto gap-1.5 rounded-full px-3 py-1.5 text-xs tracking-normal",
        className,
      )}
    >
      <Icon aria-hidden="true" />
      {categoryContent[category].label}
    </Badge>
  );
}
