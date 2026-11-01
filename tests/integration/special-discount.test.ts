import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("special discount is guarded, saved atomically in checkout snapshots and stacks with capped bundle discount", async () => {
  const db = new PGlite();
  const actor = "00000000-0000-4000-8000-000000000001";
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select null::uuid$$; insert into auth.users values('${actor}');`,
    );
    for (const file of [
      "202609200001_catalog.sql",
      "202609260001_operations.sql",
      "202609260002_product_order.sql",
      "202610020001_experience_products.sql",
    ])
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    await db.exec(
      `insert into private.staff values(1,'${actor}','owner','owner@example.test'); update delivery_settings set bundle_discount=3000;`,
    );
    const base = {
      category: "product",
      fruit_type: "감귤",
      weight_grams: 3000,
      description: "할인상품",
      price: 30000,
      is_active: true,
      is_deleted: false,
      inventory_enabled: true,
      stock_quantity: 20,
      bundle_eligible: true,
    };
    const old = await db.query<{ id: string }>(
      "select save_product(null,$1,$2) id",
      [base, actor],
    );
    const id = old.rows[0].id;
    const payload = (quantities: number[]) => ({
      category: "product",
      sender: {
        name: "가상",
        phone: "01012345678",
        privacyConsent: true,
        marketingConsent: false,
      },
      deliveries: quantities.map((quantity) => ({
        recipient: {
          name: "가상",
          phone: "01012345678",
          postalCode: "00000",
          address: "가상",
          addressDetail: "",
        },
        deliveryMode: "regular",
        items: [{ productId: id, quantity }],
      })),
    });
    const before = "20000000-0000-4000-8000-000000000001";
    await db.query("select submit_checkout($1,$2)", [before, payload([1])]);
    const migration = await readFile(
      "supabase/migrations/202610310001_special_discount.sql",
      "utf8",
    );
    await db.exec(migration);
    const save = (
      amount: number,
      enabled = true,
      staff: string | null = actor,
    ) =>
      db.query("select save_product_with_special_discount($1,$2,$3)", [
        id,
        {
          ...base,
          special_discount_enabled: enabled,
          special_discount_amount: amount,
          stock_quantity: null,
        },
        staff,
      ]);
    await assert.rejects(save(5000, true, null), /관리자 권한/);
    await assert.rejects(save(30001));
    await assert.rejects(save(0));
    await save(5000);
    const request = "20000000-0000-4000-8000-000000000002";
    const result = await db.query<{ result: { total: number } }>(
      "select submit_checkout($1,$2) result",
      [request, payload([2, 1])],
    );
    assert.equal(result.rows[0].result.total, 72000);
    const items = await db.query<{
      unit_price: number;
      original_unit_price: number | null;
      special_discount_amount: number;
    }>(
      "select unit_price,original_unit_price,special_discount_amount from order_items order by original_unit_price nulls first",
    );
    assert.deepEqual(items.rows[0], {
      unit_price: 30000,
      original_unit_price: null,
      special_discount_amount: 0,
    });
    assert.deepEqual(items.rows[1], {
      unit_price: 25000,
      original_unit_price: 30000,
      special_discount_amount: 5000,
    });
    await save(29000);
    const capped = await db.query<{ result: { total: number } }>(
      "select submit_checkout($1,$2) result",
      ["20000000-0000-4000-8000-000000000003", payload([2])],
    );
    assert.equal(capped.rows[0].result.total, 0);
    const retry = await db.query<{ result: { total: number } }>(
      "select submit_checkout($1,$2) result",
      [request, payload([2, 1])],
    );
    assert.equal(retry.rows[0].result.total, 72000);
    assert.equal((await db.query("select * from checkouts")).rows.length, 3);
    assert.equal(
      (
        await db.query<{ stock_quantity: number }>(
          "select stock_quantity from products where id=$1",
          [id],
        )
      ).rows[0].stock_quantity,
      14,
    );
    await save(5000, false);
    assert.equal(
      (
        await db.query<{ result: { total: number } }>(
          "select submit_checkout($1,$2) result",
          ["20000000-0000-4000-8000-000000000004", payload([1])],
        )
      ).rows[0].result.total,
      30000,
    );
    await assert.rejects(
      db.query("select save_product_with_special_discount(null,$1,$2)", [
        {
          ...base,
          category: "experience",
          fruit_type: null,
          weight_grams: null,
          inventory_enabled: false,
          bundle_eligible: false,
          special_discount_enabled: true,
          special_discount_amount: 1000,
        },
        actor,
      ]),
    );
    await db.exec("set role anon");
    await assert.rejects(save(1000), /permission denied/);
  } finally {
    await db.close();
  }
});
