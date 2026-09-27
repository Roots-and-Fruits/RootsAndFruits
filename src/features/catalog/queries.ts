import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { CatalogCategory, Product } from "./types";

const rowSchema = z.object({
  id: z.string(),
  category: z.enum(["product", "experience"]),
  fruit_type: z.string(),
  weight_grams: z.number().int().positive(),
  description: z.string(),
  price: z.number().int().nonnegative(),
  inventory_enabled: z.boolean(),
  stock_quantity: z.number().int().nullable(),
  bundle_eligible: z.boolean(),
});
export type CatalogResult = {
  products: Product[];
  maxDeliveryDays: number;
  bundleDiscount: number;
  status: "ready" | "unavailable";
};

export async function getCatalog(
  category: CatalogCategory,
): Promise<CatalogResult> {
  const unavailable: CatalogResult = {
    products: [],
    maxDeliveryDays: 14,
    bundleDiscount: 0,
    status: "unavailable",
  };
  if (!getSupabaseConfig()) return unavailable;
  try {
    const supabase = await createClient();
    const [catalog, settings] = await Promise.all([
      supabase
        .from("products")
        .select(
          "id, category, fruit_type, weight_grams, description, price, inventory_enabled, stock_quantity, bundle_eligible",
        )
        .eq("category", category)
        .eq("is_active", true)
        .order("sort_order")
        .order("id"),
      supabase
        .from("delivery_settings")
        .select("max_days, bundle_discount")
        .eq("id", 1)
        .maybeSingle(),
    ]);
    if (catalog.error || settings.error) return unavailable;
    const parsed = z.array(rowSchema).safeParse(catalog.data);
    if (!parsed.success) return unavailable;
    const products: Product[] = parsed.data.map((row) => ({
      id: row.id,
      category: row.category,
      fruitType: row.fruit_type,
      weightGrams: row.weight_grams,
      description: row.description,
      price: row.price,
      inventoryEnabled: row.inventory_enabled,
      stockQuantity: row.stock_quantity,
      bundleEligible: row.bundle_eligible,
    }));
    const maxDays = z.number().int().min(3).safeParse(settings.data?.max_days);
    return {
      products,
      maxDeliveryDays: maxDays.success ? maxDays.data : 14,
      bundleDiscount: z
        .number()
        .int()
        .nonnegative()
        .parse(settings.data?.bundle_discount),
      status: "ready",
    };
  } catch {
    return unavailable;
  }
}
