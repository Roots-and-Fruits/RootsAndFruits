import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const staff = "00000000-0000-4000-8000-000000000001";
const p1 = "10000000-0000-4000-8000-000000000001",
  p2 = "10000000-0000-4000-8000-000000000002",
  p3 = "10000000-0000-4000-8000-000000000003";
const sender = {
  name: "테스트",
  phone: "01012345678",
  privacyConsent: true,
  marketingConsent: false,
};
const recipient = {
  name: "수령인",
  phone: "01012345678",
  postalCode: "00000",
  address: "가상 주소",
  addressDetail: "테스트",
};
const delivery = (items: { productId: string; quantity: number }[]) => ({
  recipient,
  items,
  deliveryMode: "regular",
  requestedDate: "",
});
const payload = (deliveries: ReturnType<typeof delivery>[]) => ({
  category: "product",
  sender,
  deliveries,
});
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create table auth.identities(user_id uuid references auth.users(id),provider text);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users(id) values('${staff}');`,
  );
  for (const f of [
    "202609200001_catalog.sql",
    "202609260001_operations.sql",
    "202609260002_product_order.sql",
    "202609290001_customer_auth.sql",
  ])
    await db.exec(await readFile(`supabase/migrations/${f}`, "utf8"));
  await db.query("select public.provision_staff(1::smallint,$1,$2,$3)", [
    staff,
    "owner",
    "owner@example.test",
  ]);
  await db.exec(
    `insert into products(id,category,fruit_type,weight_grams,price,is_active,inventory_enabled,stock_quantity,bundle_eligible) values('${p1}','product','감귤',3000,10000,true,true,2,true),('${p2}','product','한라봉',3000,20000,true,false,null,true),('${p3}','product','선물',5000,30000,true,false,null,false);update delivery_settings set bundle_discount=3000;`,
  );
  return db;
}
test("Postgres: discount per delivery, immutable totals, retry, stock and cancel", async () => {
  const db = await setup();
  try {
    const key = crypto.randomUUID(),
      order = payload([
        delivery([
          { productId: p1, quantity: 3 },
          { productId: p2, quantity: 1 },
          { productId: p3, quantity: 1 },
        ]),
        delivery([{ productId: p2, quantity: 1 }]),
      ]);
    const submit = () =>
      db.query<{ result: { orderNumber: number; total: number } }>(
        "select submit_checkout($1,$2::jsonb) as result",
        [key, JSON.stringify(order)],
      );
    const first = await submit();
    assert.equal(first.rows[0].result.total, 94000);
    assert.deepEqual((await submit()).rows, first.rows);
    assert.equal(
      (
        await db.query<{ stock_quantity: number }>(
          "select stock_quantity from products where id=$1",
          [p1],
        )
      ).rows[0].stock_quantity,
      -1,
    );
    assert.equal(
      (await db.query<{ n: number }>("select count(*)::int n from checkouts"))
        .rows[0].n,
      1,
    );
    await db.exec(
      "update products set price=99000;update delivery_settings set bundle_discount=5000",
    );
    assert.equal(
      (await db.query<{ total: number }>("select total::int from checkouts"))
        .rows[0].total,
      94000,
    );
    await assert.rejects(
      db.query("select submit_checkout($1,$2::jsonb)", [
        key,
        JSON.stringify(payload([delivery([{ productId: p2, quantity: 1 }])])),
      ]),
    );
    const id = (await db.query<{ id: string }>("select id from checkouts"))
      .rows[0].id;
    await db.query("select change_checkout($1,'cancel',$2)", [id, staff]);
    await db.query("select change_checkout($1,'cancel',$2)", [id, staff]);
    assert.equal(
      (
        await db.query<{ stock_quantity: number }>(
          "select stock_quantity from products where id=$1",
          [p1],
        )
      ).rows[0].stock_quantity,
      2,
    );
    await assert.rejects(
      db.query("select change_checkout($1,'pay',$2)", [id, staff]),
    );
  } finally {
    await db.close();
  }
});
test("Postgres: paid cancellation blocked, export transaction, shipment retry and RLS", async () => {
  const db = await setup();
  try {
    await db.query("select submit_checkout($1,$2::jsonb)", [
      crypto.randomUUID(),
      JSON.stringify(payload([delivery([{ productId: p1, quantity: 2 }])])),
    ]);
    const c = (await db.query<{ id: string }>("select id from checkouts"))
      .rows[0].id;
    const d = (await db.query<{ id: string }>("select id from deliveries"))
      .rows[0].id;
    const batch = crypto.randomUUID();
    await assert.rejects(
      db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
        batch,
        [d],
        staff,
      ]),
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from export_batches",
        )
      ).rows[0].n,
      0,
    );
    await db.query("select change_checkout($1,'pay',$2)", [c, staff]);
    const rows = await db.query<{
      result: {
        delivery: { order_items: { quantity: number; label: string }[] };
      }[];
    }>("select export_rows($1,$2) result", [[d], staff]);
    assert.equal(rows.rows[0].result[0].delivery.order_items[0].quantity, 2);
    assert.match(rows.rows[0].result[0].delivery.order_items[0].label, /3kg/);

    await db.query("select change_checkout($1,'pay',$2)", [c, staff]);
    await assert.rejects(
      db.query("select change_checkout($1,'cancel',$2)", [c, staff]),
    );
    await assert.rejects(db.query("select mark_shipped($1,$2)", [[d], staff]));
    await db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
      batch,
      [d],
      staff,
    ]);
    await db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
      batch,
      [d],
      staff,
    ]);
    await assert.rejects(
      db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
        crypto.randomUUID(),
        [d],
        staff,
      ]),
    );
    await db.query("select mark_shipped($1,$2)", [[d], staff]);
    await db.query("select mark_shipped($1,$2)", [[d], staff]);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from staff_events where action='shipped'",
        )
      ).rows[0].n,
      1,
    );
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from checkouts"));
    await assert.rejects(
      db.query("select submit_checkout($1,$2::jsonb)", [
        crypto.randomUUID(),
        JSON.stringify(payload([])),
      ]),
    );
    await db.exec("reset role;set role authenticated");
    assert.equal((await db.query("select * from checkouts")).rows.length, 0);
    await assert.rejects(db.query("update products set price=1"));
    await assert.rejects(db.query("select staff_email('owner')"));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      staff,
    ]);
    assert.equal((await db.query("select * from checkouts")).rows.length, 1);
  } finally {
    await db.close();
  }
});
test("Postgres: failed order rolls back, discount cap and reorder preserves original", async () => {
  const db = await setup();
  try {
    const bad = payload([
      delivery([{ productId: p1, quantity: 1 }]),
      delivery([{ productId: crypto.randomUUID(), quantity: 1 }]),
    ]);
    await assert.rejects(
      db.query("select submit_checkout($1,$2::jsonb)", [
        crypto.randomUUID(),
        JSON.stringify(bad),
      ]),
    );
    assert.equal(
      (
        await db.query<{ stock_quantity: number }>(
          "select stock_quantity from products where id=$1",
          [p1],
        )
      ).rows[0].stock_quantity,
      2,
    );
    await db.exec("update delivery_settings set bundle_discount=100000");
    const order = payload([
      delivery([
        { productId: p2, quantity: 2 },
        { productId: p3, quantity: 1 },
      ]),
    ]);
    await db.query("select submit_checkout($1,$2::jsonb)", [
      crypto.randomUUID(),
      JSON.stringify(order),
    ]);
    assert.equal(
      (await db.query<{ total: number }>("select total::int from checkouts"))
        .rows[0].total,
      30000,
    );
    const original = (
      await db.query<{ id: string }>("select id from checkouts")
    ).rows[0].id;
    await db.query("select submit_checkout($1,$2::jsonb,$3,$4)", [
      crypto.randomUUID(),
      JSON.stringify(order),
      staff,
      original,
    ]);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from checkouts where status='pending'",
        )
      ).rows[0].n,
      2,
    );
    await db.exec(`update products set is_active=false where id='${p2}'`);
    await assert.rejects(
      db.query("select submit_checkout($1,$2::jsonb,$3,$4)", [
        crypto.randomUUID(),
        JSON.stringify(order),
        staff,
        original,
      ]),
    );
  } finally {
    await db.close();
  }
});

test("Postgres: stock toggles preserve deductions; filters, dates and pagination", async () => {
  const db = await setup();
  try {
    const order = payload([delivery([{ productId: p1, quantity: 1 }])]);
    await db.query("select submit_checkout($1,$2::jsonb)", [
      crypto.randomUUID(),
      JSON.stringify(order),
    ]);
    const first = (
      await db.query<{ id: string; order_number: number }>(
        "select id,order_number from checkouts",
      )
    ).rows[0];
    await db.query("select save_product($1,$2::jsonb,$3)", [
      p1,
      JSON.stringify({
        category: "product",
        fruit_type: "감귤",
        weight_grams: 3000,
        description: "",
        price: 10000,
        is_active: true,
        inventory_enabled: false,
        stock_quantity: null,
        sort_order: 0,
        bundle_eligible: true,
        is_deleted: false,
      }),
      staff,
    ]);
    await db.query("select change_checkout($1,'cancel',$2)", [first.id, staff]);
    assert.equal(
      (
        await db.query<{ stock_quantity: number }>(
          "select stock_quantity from products where id=$1",
          [p1],
        )
      ).rows[0].stock_quantity,
      2,
    );
    const badDate = payload([
      {
        ...delivery([{ productId: p2, quantity: 1 }]),
        deliveryMode: "scheduled",
        requestedDate: "2020-01-01",
      },
    ] as unknown as ReturnType<typeof delivery>[]);
    await assert.rejects(
      db.query("select submit_checkout($1,$2::jsonb)", [
        crypto.randomUUID(),
        JSON.stringify(badDate),
      ]),
    );
    for (let n = 0; n < 31; n++)
      await db.query("select submit_checkout($1,$2::jsonb)", [
        crypto.randomUUID(),
        JSON.stringify(payload([delivery([{ productId: p2, quantity: 1 }])])),
      ]);
    const filtered = await db.query<{
      result: {
        count: number;
        orders: {
          order_number: number;
          deliveries: unknown[];
          request_payload?: unknown;
        }[];
      };
    }>("select list_checkouts($1::jsonb,0,$2) result", [
      JSON.stringify({
        number: String(first.order_number),
        status: "cancelled",
      }),
      staff,
    ]);
    assert.equal(filtered.rows[0].result.count, 1);
    assert.equal(
      filtered.rows[0].result.orders[0].order_number,
      first.order_number,
    );
    assert.equal(filtered.rows[0].result.orders[0].request_payload, undefined);
    const second = await db.query<{
      result: { count: number; orders: unknown[] };
    }>("select list_checkouts($1::jsonb,1,$2) result", [
      JSON.stringify({ status: "pending", recipient: "수령", product: p2 }),
      staff,
    ]);
    assert.equal(second.rows[0].result.count, 31);
    assert.equal(second.rows[0].result.orders.length, 1);
  } finally {
    await db.close();
  }
});

test("Postgres: grouped product ordering, append, stale saves and role protection", async () => {
  const db = await setup();
  try {
    const snapshot = async () =>
      (
        await db.query<{ id: string; fruit_type: string; sort_order: number }>(
          "select id,fruit_type,sort_order from products where category='product' and not is_deleted order by sort_order,id",
        )
      ).rows;
    const reorder = (ids: string[], expected: unknown, actor = staff) =>
      db.query(
        "select reorder_products('product',$1::uuid[],$2::jsonb,$3::uuid)",
        [ids, JSON.stringify(expected), actor],
      );
    const before = await snapshot();
    await reorder([p3, p1, p2], before);
    assert.deepEqual(
      (await snapshot()).map((p) => p.id),
      [p3, p1, p2],
    );
    await reorder([p3, p1, p2], before);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from staff_events where action='product_order'",
        )
      ).rows[0].n,
      1,
    );
    await assert.rejects(reorder([p2, p1, p3], before), /다른 관리자/);
    await assert.rejects(
      reorder([p3, p1, p2], await snapshot(), crypto.randomUUID()),
      /관리자 권한/,
    );
    await assert.rejects(
      db.exec(
        "set role anon; select reorder_products('product','{}','[]',null)",
      ),
      /permission denied/,
    );
    await db.exec("reset role");
    const original = (
      await db.query<Record<string, unknown>>(
        "select * from products where id=$1",
        [p1],
      )
    ).rows[0];
    const saved = async (id: string | null, data: unknown) =>
      (
        await db.query<{ id: string }>(
          "select save_product($1,$2::jsonb,$3) id",
          [id, JSON.stringify(data), staff],
        )
      ).rows[0].id;
    const added = await saved(null, {
      ...original,
      weight_grams: 5000,
      stock_quantity: null,
      sort_order: 0,
    });
    assert.deepEqual(
      (await snapshot()).map((p) => p.id),
      [p3, p1, added, p2],
    );
    const expected = await snapshot();
    await assert.rejects(reorder([p1, p2, added, p3], expected), /한 그룹/);
    await assert.rejects(reorder([p1, p1, p2, p3], expected), /목록이 변경/);
    await reorder([added, p1, p2, p3], expected);
    // Saving stale product metadata must not undo order or reset inventory.
    await saved(p1, {
      ...original,
      stock_quantity: null,
      description: "수정",
      sort_order: 0,
    });
    assert.deepEqual(
      (await snapshot()).map((p) => p.id),
      [added, p1, p2, p3],
    );
    assert.equal(
      (
        await db.query<{ stock_quantity: number }>(
          "select stock_quantity from products where id=$1",
          [p1],
        )
      ).rows[0].stock_quantity,
      2,
    );
    const old = await snapshot();
    const last = await saved(null, {
      ...original,
      fruit_type: "새 과일",
      stock_quantity: null,
    });
    assert.equal((await snapshot()).at(-1)?.id, last);
    await assert.rejects(
      reorder(
        old.map((p) => p.id),
        old,
      ),
      /목록이 변경/,
    );
    // Category moves append to the destination without changing other categories.
    await saved(last, {
      ...original,
      category: "experience",
      stock_quantity: null,
    });
    assert.equal(
      (
        await db.query<{ sort_order: number }>(
          "select sort_order from products where id=$1",
          [last],
        )
      ).rows[0].sort_order,
      0,
    );
    const current = await snapshot();
    await assert.rejects(
      reorder([...current.map((p) => p.id).slice(1), last], current),
      /목록이 변경/,
    );
  } finally {
    await db.close();
  }
});

test("Postgres: customer ownership, tablet provisioning, retries and RLS", async () => {
  const db = await setup();
  const kakao = crypto.randomUUID(),
    tablet = crypto.randomUUID(),
    stranger = crypto.randomUUID();
  try {
    await db.query(
      "insert into auth.users(id,email) values($1,null),($2,'tablet-01@tablet.roots-and-fruits.invalid'),($3,'stranger@example.test')",
      [kakao, tablet, stranger],
    );
    await db.query(
      "insert into auth.identities(user_id,provider) values($1,'kakao'),($2,'email')",
      [kakao, stranger],
    );
    await db.query(
      "select provision_tablet($1,'tablet-01','tablet-01@tablet.roots-and-fruits.invalid')",
      [tablet],
    );
    await assert.rejects(
      db.query(
        "select provision_tablet($1,'owner','owner@tablet.roots-and-fruits.invalid')",
        [staff],
      ),
    );
    assert.equal(
      (
        await db.query<{ kind: string }>("select account_kind($1) kind", [
          tablet,
        ])
      ).rows[0].kind,
      "tablet",
    );
    assert.equal(
      (
        await db.query<{ kind: string | null }>(
          "select account_kind($1) kind",
          [stranger],
        )
      ).rows[0].kind,
      null,
    );
    const order = JSON.stringify(
      payload([delivery([{ productId: p1, quantity: 2 }])]),
    );
    for (const [member, source] of [
      [null, "guest"],
      [kakao, "kakao"],
      [tablet, "tablet"],
    ] as const) {
      const request = crypto.randomUUID();
      const submit = () =>
        db.query("select submit_customer_checkout($1,$2::jsonb,$3) result", [
          request,
          order,
          member,
        ]);
      const first = await submit();
      assert.deepEqual((await submit()).rows, first.rows);
      const saved = (
        await db.query<{
          member_id: string | null;
          order_source: string;
          id: string;
        }>(
          "select id,member_id,order_source from checkouts where request_id=$1",
          [request],
        )
      ).rows[0];
      assert.equal(saved.member_id, member);
      assert.equal(saved.order_source, source);
      await assert.rejects(
        db.query("select submit_customer_checkout($1,$2::jsonb,$3)", [
          request,
          order,
          member === kakao ? tablet : kakao,
        ]),
      );
      assert.equal(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from stock_movements where checkout_id=$1",
            [saved.id],
          )
        ).rows[0].n,
        1,
      );
    }
    for (const invalid of [staff, stranger])
      await assert.rejects(
        db.query("select submit_customer_checkout($1,$2::jsonb,$3)", [
          crypto.randomUUID(),
          order,
          invalid,
        ]),
      );
    await db.query(
      "update private.tablet_accounts set enabled=false where user_id=$1",
      [tablet],
    );
    await assert.rejects(
      db.query("select submit_customer_checkout($1,$2::jsonb,$3)", [
        crypto.randomUUID(),
        order,
        tablet,
      ]),
    );
    assert.equal(
      (
        await db.query<{ email: string | null }>(
          "select tablet_email('tablet-01') email",
        )
      ).rows[0].email,
      null,
    );
    assert.equal(
      (await db.query<{ n: number }>("select count(*)::int n from checkouts"))
        .rows[0].n,
      3,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query(
          "select provision_tablet($1,'hacker','hacker@tablet.roots-and-fruits.invalid')",
          [stranger],
        ),
      );
      await assert.rejects(db.query("select tablet_email('tablet-01')"));
      await assert.rejects(db.query("select account_kind($1)", [staff]));
      await assert.rejects(
        db.query("select submit_customer_checkout($1,$2::jsonb,$3)", [
          crypto.randomUUID(),
          order,
          kakao,
        ]),
      );
      await assert.rejects(db.query("select * from private.tablet_accounts"));
      if (role === "authenticated") {
        for (const member of [kakao, tablet]) {
          await db.query(
            "select set_config('request.jwt.claim.sub',$1,false)",
            [member],
          );
          assert.equal(
            (await db.query("select * from checkouts")).rows.length,
            0,
          );
          assert.equal(
            (await db.query<{ staff: boolean }>("select is_staff() staff"))
              .rows[0].staff,
            false,
          );
        }
      }
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});
