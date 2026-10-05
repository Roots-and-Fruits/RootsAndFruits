"use client";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AdminButton as Button } from "./admin-button";
import { AdminLabeledInput as LabeledInput, AdminSelect } from "./admin-fields";
import { Checkbox } from "@/components/ui/checkbox";
import { adminRequest } from "./client";
import {
  productSchema,
  productFieldsSchema,
  settingsSchema,
  type AdminProduct,
  type Settings,
} from "./schema";
import { ProductSortList } from "./product-sort-list";
const productFormSchema = productFieldsSchema
  .omit({ weight_grams: true })
  .extend({
    weight_kg: z
      .number({ invalid_type_error: "중량을 입력해주세요." })
      .min(0.001, "중량은 0보다 커야 합니다.")
      .max(1000, "중량은 1,000kg 이하로 입력해주세요.")
      .multipleOf(0.001, "중량은 소수점 셋째 자리까지 입력해주세요.")
      .nullable(),
  })
  .superRefine((value, ctx) => {
    const result = productSchema.safeParse({
      ...value,
      weight_grams:
        value.weight_kg === null ? null : Math.round(value.weight_kg * 1000),
    });
    if (!result.success)
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: issue.path.map((part) =>
            part === "weight_grams" ? "weight_kg" : part,
          ),
        });
      }
  });
type ProductFormValues = z.infer<typeof productFormSchema>;
const emptyProduct: AdminProduct = {
  id: null,
  category: "product",
  fruit_type: "",
  weight_grams: 3000,
  description: "",
  price: 0,
  is_active: true,
  is_deleted: false,
  inventory_enabled: false,
  stock_quantity: null,
  sort_order: 0,
  bundle_eligible: false,
};
export function CatalogAdmin({ section }: { section: string }) {
  const [products, setProducts] = useState<AdminProduct[]>([]),
    [settings, setSettings] = useState<Settings | null>(null),
    [editing, setEditing] = useState<AdminProduct | null>(null),
    [category, setCategory] = useState<AdminProduct["category"]>("product"),
    [sorting, setSorting] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    try {
      if (section === "products") setProducts(await adminRequest("products"));
      else setSettings(await adminRequest("settings"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let live = true;
    adminRequest<AdminProduct[] | Settings>(section)
      .then((data) => {
        if (live) {
          if (section === "products") setProducts(data as AdminProduct[]);
          else setSettings(data as Settings);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [section]);
  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-secondary p-4">
          {notice}
        </p>
      )}
      {section === "settings" ? (
        settings && (
          <SettingsForm
            value={settings}
            onSave={async (v) => {
              await adminRequest("settings", v);
              setNotice("설정을 저장했습니다. 이후 조회·접수부터 적용됩니다.");
              await load();
            }}
          />
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="상품 목록 구분"
              className="flex gap-2"
            >
              {(["product", "experience"] as const).map((c) => (
                <Button
                  key={c}
                  variant={category === c ? "default" : "outline"}
                  aria-pressed={category === c}
                  disabled={sorting || !!editing}
                  onClick={() => setCategory(c)}
                >
                  {c === "product" ? "일반 상품" : "체험 상품"}
                </Button>
              ))}
            </div>
            <Button
              disabled={sorting || !!editing}
              onClick={() => {
                setEditing({
                  ...emptyProduct,
                  category,
                  ...(category === "experience"
                    ? { fruit_type: null, weight_grams: null }
                    : {}),
                });
                setNotice("");
              }}
            >
              상품 등록
            </Button>
          </div>
          {editing && (
            <ProductForm
              key={editing.id ?? "new"}
              value={editing}
              onCancel={() => setEditing(null)}
              onSave={async (value) => {
                await adminRequest("products", value);
                setEditing(null);
                setCategory(value.category);
                setNotice("상품을 저장했습니다.");
                await load();
              }}
            />
          )}
          <ProductSortList
            key={category + JSON.stringify(products)}
            products={products.filter(
              (p) => p.category === category && !p.is_deleted,
            )}
            category={category}
            disabled={!!editing}
            onDirtyChange={setSorting}
            onEdit={(p) => {
              setEditing(p);
              setNotice("");
            }}
            onReload={async () => {
              setProducts(await adminRequest("products"));
            }}
            onSave={async (ids) => {
              const expected = products
                .filter((p) => p.category === category && !p.is_deleted)
                .map(({ id, fruit_type, sort_order }) => ({
                  id,
                  fruit_type,
                  sort_order,
                }));
              await adminRequest("products/order", { category, ids, expected });
              setProducts(await adminRequest("products"));
              setNotice("상품 순서를 저장했습니다.");
            }}
          />
        </>
      )}
    </div>
  );
}
function ProductForm({
  value,
  onSave,
  onCancel,
}: {
  value: AdminProduct;
  onSave: (value: AdminProduct) => Promise<void>;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      ...value,
      // Older DB rows can still contain fields the experience form no longer shows.
      ...(value.category === "experience"
        ? { fruit_type: null, inventory_enabled: false, bundle_eligible: false }
        : {}),
      weight_kg:
        value.category === "experience" || value.weight_grams === null
          ? null
          : value.weight_grams / 1000,
      stock_quantity: null,
    },
  });
  const [error, setError] = useState("");
  const current = useWatch({ control });
  return (
    <form
      className="max-w-5xl space-y-5 rounded-xl border bg-card p-5 lg:space-y-4 lg:p-6"
      onSubmit={handleSubmit(
        async (v) => {
          try {
            setError("");
            const { weight_kg, ...product } = v;
            await onSave({
              ...product,
              weight_grams:
                weight_kg === null ? null : Math.round(weight_kg * 1000),
              stock_quantity: product.inventory_enabled
                ? product.stock_quantity
                : null,
            });
          } catch (e) {
            setError((e as Error).message);
          }
        },
        () => {
          // Hidden or unregistered fields must not leave a seemingly inert Save button.
          setError("입력 내용을 확인해주세요. 저장되지 않은 항목이 있습니다.");
        },
      )}
    >
      <h2 className="text-xl font-semibold lg:text-lg">
        {value.id ? "상품 수정" : "새 상품"}
      </h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-5 lg:gap-y-4">
        <label className="flex flex-col gap-2.5 text-sm font-medium lg:gap-1.5">
          <span>상품 구분</span>
          <AdminSelect
            {...register("category")}
            onChange={(event) => {
              const category = event.target.value as AdminProduct["category"];
              setValue("category", category);
              setValue("fruit_type", category === "experience" ? null : "");
              setValue("weight_kg", category === "experience" ? null : 3);
              setValue("inventory_enabled", false);
              setValue("bundle_eligible", false);
              setValue("stock_quantity", null);
            }}
          >
            <option value="product">일반</option>
            <option value="experience">체험</option>
          </AdminSelect>
        </label>
        {current.category === "product" && (
          <>
            <LabeledInput
              id="fruit"
              label="과일 종류"
              {...register("fruit_type")}
              error={errors.fruit_type?.message}
            />
            <LabeledInput
              id="weight"
              label="중량 (kg)"
              type="number"
              inputMode="decimal"
              min="0.001"
              max="1000"
              step="0.001"
              {...register("weight_kg", { valueAsNumber: true })}
              error={errors.weight_kg?.message}
            />
          </>
        )}
        <div className="sm:col-span-2 lg:col-span-3">
          <LabeledInput
            id="desc"
            label="상품 내용"
            {...register("description")}
            error={errors.description?.message}
          />
        </div>
        <LabeledInput
          id="price"
          label="가격 (원)"
          type="number"
          {...register("price", { valueAsNumber: true })}
          error={errors.price?.message}
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3 border-t pt-4 lg:text-sm">
        {(
          [
            ["is_active", "판매 중"],
            ["inventory_enabled", "재고 관리"],
            ["bundle_eligible", "묶음 배송 할인 대상"],
          ] as const
        )
          .filter(
            ([key]) => current.category === "product" || key === "is_active",
          )
          .map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <Checkbox
                checked={current[key]}
                onCheckedChange={(v) => {
                  setValue(key, v === true);
                  if (key === "inventory_enabled" && v !== true) {
                    setValue("stock_quantity", null, { shouldValidate: true });
                  }
                }}
              />
              {label}
            </label>
          ))}
      </div>
      {current.category === "product" && current.inventory_enabled && (
        <div className="max-w-md space-y-2 rounded-lg bg-secondary/50 p-4">
          <LabeledInput
            id="stock"
            label={`재고 수량 변경 (현재 ${value.stock_quantity ?? 0}개 · 비우면 유지)`}
            type="number"
            {...register("stock_quantity", {
              setValueAs: (v) => (v == null || v === "" ? null : Number(v)),
            })}
            error={errors.stock_quantity?.message}
          />
          <p className="text-sm text-muted-foreground">
            수량을 입력하면 현재 재고를 그 수량으로 조정합니다. 재고 관리를 꺼도
            기존 재고 수량과 차감 기록은 보존됩니다.
          </p>
        </div>
      )}
      {value.id && (
        <label className="flex items-center gap-2 text-destructive">
          <Checkbox
            checked={current.is_deleted}
            onCheckedChange={(v) => {
              setValue("is_deleted", v === true);
              if (v) setValue("is_active", false);
            }}
          />
          이 상품 삭제 (기존 주문은 보존)
        </label>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          닫기
        </Button>
        <Button disabled={isSubmitting}>저장</Button>
      </div>
    </form>
  );
}
function SettingsForm({
  value,
  onSave,
}: {
  value: Settings;
  onSave: (v: Settings) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Settings>({
    defaultValues: value,
    resolver: zodResolver(settingsSchema),
  });
  const [error, setError] = useState("");
  return (
    <form
      className="grid max-w-4xl gap-6 rounded-xl border bg-card p-5 lg:grid-cols-2 lg:gap-x-8 lg:p-6"
      onSubmit={handleSubmit(async (v) => {
        try {
          setError("");
          await onSave(v);
        } catch (e) {
          setError((e as Error).message);
        }
      })}
    >
      <div className="space-y-3">
        <h2 className="font-semibold">묶음 배송 할인</h2>
        <LabeledInput
          id="discount"
          label="대상 상품 2개당 묶음 할인 (원)"
          type="number"
          {...register("bundle_discount", { valueAsNumber: true })}
          error={errors.bundle_discount?.message}
        />
        <p className="text-sm text-muted-foreground">
          일반 상품에만 적용합니다. 0원은 할인 없음. 배송지마다 계산하며 발송
          수량은 줄이지 않습니다.
        </p>
      </div>
      <div className="space-y-3">
        <h2 className="font-semibold">예약 배송</h2>
        <LabeledInput
          id="days"
          label="예약 배송 최대 범위 (오늘부터 일수)"
          type="number"
          {...register("max_days", { valueAsNumber: true })}
          error={errors.max_days?.message}
        />
      </div>
      <div className="space-y-4 border-t pt-5 lg:col-span-2">
        <h2 className="font-semibold">송장 발송지</h2>
        <div className="max-w-xs">
          <LabeledInput
            id="postal"
            label="송장 발송지 우편번호"
            {...register("postal_code")}
            error={errors.postal_code?.message}
          />
        </div>
        <LabeledInput
          id="address"
          label="송장 발송지 주소"
          {...register("address")}
          error={errors.address?.message}
        />
      </div>
      {error && (
        <p role="alert" className="lg:col-span-2">
          {error}
        </p>
      )}
      <div className="border-t pt-4 lg:col-span-2">
        <Button disabled={isSubmitting}>설정 저장</Button>
      </div>
    </form>
  );
}
