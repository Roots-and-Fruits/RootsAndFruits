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
async function setup(
  includeExperienceMigration = true,
  includePaymentMigration = true,
) {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create table auth.identities(user_id uuid references auth.users(id),provider text);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users(id) values('${staff}');`,
  );
  for (const f of [
    "202609200001_catalog.sql",
    "202609260001_operations.sql",
    "202609260002_product_order.sql",
    "202609290001_customer_auth.sql",
    "202610020001_experience_products.sql",
    "202610020002_payment_method.sql",
    "202610030001_order_notifications.sql",
  ])
    if (
      (includeExperienceMigration ||
        f !== "202610020001_experience_products.sql") &&
      (includePaymentMigration || f !== "202610020002_payment_method.sql")
    )
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
test("Postgres: notification outbox is opt-in, atomic, sender-only and idempotent", async () => {
  const db = await setup();
  try {
    const submit = (
      id: string,
      order = payload([delivery([{ productId: p2, quantity: 1 }])]),
    ) =>
      db.query("select submit_checkout($1,$2::jsonb)", [
        id,
        JSON.stringify(order),
      ]);
    await submit(crypto.randomUUID());
    assert.equal(
      (await db.query("select * from order_notifications")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select configure_order_notifications(true,$1)", [
        crypto.randomUUID(),
      ]),
    );
    await db.query("select configure_order_notifications(true,$1)", [staff]);
    const key = crypto.randomUUID();
    const order = payload([
      delivery([{ productId: p2, quantity: 1 }]),
      delivery([{ productId: p2, quantity: 2 }]),
    ]);
    order.deliveries[0] = {
      ...order.deliveries[0],
      recipient: { ...recipient, phone: "01099998888" },
    };
    await submit(key, order);
    await submit(key, order);
    let rows = (
      await db.query<{
        id: string;
        checkout_id: string;
        event: string;
        phone: string;
        payload: { total: number; deliveryCount: number };
        status: string;
      }>("select * from order_notifications")
    ).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].phone, sender.phone);
    assert.equal(rows[0].payload.total, 57000);
    assert.equal(rows[0].payload.deliveryCount, 2);
    const checkout = rows[0].checkout_id,
      receiptId = rows[0].id;
    // Failed order transaction leaves no notification behind.
    await assert.rejects(
      submit(
        crypto.randomUUID(),
        payload([delivery([{ productId: crypto.randomUUID(), quantity: 1 }])]),
      ),
    );
    assert.equal(
      (await db.query("select * from order_notifications")).rows.length,
      1,
    );
    const claim = () =>
      db.query<{ id: string }>("select * from claim_order_notifications(10)");
    assert.equal((await claim()).rows.length, 1);
    assert.equal((await claim()).rows.length, 0);
    await db.query(
      "update order_notifications set updated_at=now()-interval '6 minutes' where id=$1",
      [receiptId],
    );
    assert.equal((await claim()).rows.length, 0);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from order_notifications where id=$1",
          [receiptId],
        )
      ).rows[0].status,
      "unknown",
    );
    await db.query("select retry_order_notification($1,$2)", [
      receiptId,
      staff,
    ]);
    assert.equal((await claim()).rows.length, 0);
    const ids = (
      await db.query<{ id: string }>(
        "select id from deliveries where checkout_id=$1",
        [checkout],
      )
    ).rows.map((r) => r.id);
    await db.query("select change_checkout($1,'pay',$2,'card')", [
      checkout,
      staff,
    ]);
    await db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
      crypto.randomUUID(),
      ids,
      staff,
    ]);
    assert.equal(
      (await db.query("select * from order_notifications")).rows.length,
      1,
    );
    await db.query("select mark_shipped($1,$2)", [ids, staff]);
    await db.query("select mark_shipped($1,$2)", [ids, staff]);
    rows = (
      await db.query<(typeof rows)[number]>("select * from order_notifications")
    ).rows;
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.phone === sender.phone));
    const claimed = await claim();
    assert.equal(claimed.rows.length, 2);
    await db.query(
      "update order_notifications set status='failed' where id=$1",
      [claimed.rows[0].id],
    );
    await db.query("select retry_order_notification($1,$2)", [
      claimed.rows[0].id,
      staff,
    ]);
    await db.query("select retry_order_notification($1,$2)", [
      claimed.rows[0].id,
      staff,
    ]);
    assert.equal((await claim()).rows.length, 1);
    const cancelKey = crypto.randomUUID();
    await submit(cancelKey);
    await db.query(
      "select change_checkout(id,'cancel',$1) from checkouts where request_id=$2",
      [staff, cancelKey],
    );
    assert.equal((await claim()).rows.length, 0);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select n.status from order_notifications n join checkouts c on c.id=n.checkout_id where c.request_id=$1",
          [cancelKey],
        )
      ).rows[0].status,
      "skipped",
    );
    await submit(crypto.randomUUID());
    await db.query("select configure_order_notifications(false,$1)", [staff]);
    assert.equal(
      (
        await db.query(
          "select * from order_notifications where status='pending'",
        )
      ).rows.length,
      0,
    );
    await db.query("select configure_order_notifications(true,$1)", [staff]);
    assert.equal((await claim()).rows.length, 0);
    await db.exec("set role anon");
    await assert.rejects(db.query("select * from order_notifications"));
    await assert.rejects(
      db.query("select * from claim_order_notifications(1)"),
    );
    await db.exec("reset role; set role authenticated");
    await assert.rejects(db.query("select * from order_notifications"));
    await assert.rejects(
      db.query("select configure_order_notifications(true,$1)", [staff]),
    );
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});

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
      db.query("select change_checkout($1,'pay',$2,'card')", [id, staff]),
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
    await db.query("select change_checkout($1,'pay',$2,'card')", [c, staff]);
    const rows = await db.query<{
      result: {
        delivery: { order_items: { quantity: number; label: string }[] };
      }[];
    }>("select export_rows($1,$2) result", [[d], staff]);
    assert.equal(rows.rows[0].result[0].delivery.order_items[0].quantity, 2);
    assert.match(rows.rows[0].result[0].delivery.order_items[0].label, /3kg/);

    await db.query("select change_checkout($1,'pay',$2,'card')", [c, staff]);
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
      fruit_type: null,
      weight_grams: null,
      description: "체험 택배",
      inventory_enabled: false,
      bundle_eligible: false,
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

test("Postgres: experience has no fruit, weight, stock deduction or discount; flat sorting and reorder", async () => {
  const db = await setup();
  try {
    const data = {
      category: "experience",
      description: "체험 택배",
      price: 10000,
      is_active: true,
    };
    const save = async (id: string | null, value: object) =>
      (
        await db.query<{ id: string }>(
          "select save_product($1,$2::jsonb,$3) id",
          [id, JSON.stringify(value), staff],
        )
      ).rows[0].id;
    const first = await save(null, data);
    const second = await save(null, { ...data, description: "큰 상자" });
    for (const invalid of [
      { fruit_type: "감귤" },
      { weight_grams: 3000 },
      { inventory_enabled: true },
      { bundle_eligible: true },
      { description: " " },
    ]) {
      await assert.rejects(save(first, { ...data, ...invalid }));
    }
    await assert.rejects(save(null, { ...data, category: "product" }));
    const snapshot = async () =>
      (
        await db.query<{ id: string; fruit_type: null; sort_order: number }>(
          "select id,fruit_type,sort_order from products where category='experience' order by sort_order,id",
        )
      ).rows;
    const expected = await snapshot();
    await db.query("select reorder_products('experience',$1,$2::jsonb,$3)", [
      [second, first],
      JSON.stringify(expected),
      staff,
    ]);
    assert.deepEqual(
      (await snapshot()).map((p) => p.id),
      [second, first],
    );
    const third = await save(null, { ...data, description: "추가 상자" });
    assert.deepEqual(
      (await snapshot()).map((p) => p.id),
      [second, first, third],
    );
    await assert.rejects(
      db.query("select reorder_products('experience',$1,$2::jsonb,$3)", [
        [first, second],
        JSON.stringify(expected),
        staff,
      ]),
    );
    const order = {
      ...payload([delivery([{ productId: first, quantity: 3 }])]),
      category: "experience",
    };
    const key = crypto.randomUUID();
    const submit = () =>
      db.query<{ result: { total: number } }>(
        "select submit_customer_checkout($1,$2::jsonb) result",
        [key, JSON.stringify(order)],
      );
    assert.equal((await submit()).rows[0].result.total, 30000);
    await submit();
    assert.deepEqual(
      (
        await db.query(
          "select label,weight_grams,bundle_eligible,inventory_deducted from order_items",
        )
      ).rows,
      [
        {
          label: "체험 택배",
          weight_grams: null,
          bundle_eligible: false,
          inventory_deducted: false,
        },
      ],
    );
    assert.deepEqual(
      (await db.query("select discount_unit,discount::int from deliveries"))
        .rows,
      [{ discount_unit: 0, discount: 0 }],
    );
    assert.equal(
      (await db.query("select * from stock_movements")).rows.length,
      0,
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
    await db.query("select change_checkout($1,'cancel',$2)", [original, staff]);
    assert.equal(
      (await db.query("select * from stock_movements")).rows.length,
      0,
    );
    await save(first, {
      ...data,
      category: "product",
      fruit_type: "감귤",
      weight_grams: 3000,
    });
    assert.equal(
      (
        await db.query<{ label: string }>(
          "select label from order_items limit 1",
        )
      ).rows[0].label,
      "체험 택배",
    );
  } finally {
    await db.close();
  }
});

test("Postgres: experience migration normalizes catalog but preserves existing order snapshots", async () => {
  const db = await setup(false);
  try {
    await db.exec(
      `update products set category='experience',description='체험 택배' where id='${p1}'`,
    );
    const order = {
      ...payload([delivery([{ productId: p1, quantity: 2 }])]),
      category: "experience",
    };
    await db.query("select submit_checkout($1,$2::jsonb)", [
      crypto.randomUUID(),
      JSON.stringify(order),
    ]);
    const snapshots = async () => ({
      checkouts: (await db.query("select * from checkouts")).rows,
      deliveries: (await db.query("select * from deliveries")).rows,
      items: (await db.query("select * from order_items")).rows,
    });
    const before = await snapshots();
    const experienceData = {
      category: "experience",
      fruit_type: null,
      weight_grams: null,
      description: "체험귤",
      price: 10000,
      is_active: true,
      is_deleted: false,
      inventory_enabled: false,
      bundle_eligible: false,
      stock_quantity: null,
    };
    const save = (id: string | null, description: string) =>
      db.query<{ id: string }>("select save_product($1,$2::jsonb,$3) as id", [
        id,
        JSON.stringify({ ...experienceData, description }),
        staff,
      ]);
    // Reproduce both failing writes against the schema with the missed migration.
    for (const id of [null, p1]) {
      await assert.rejects(save(id, "체험귤"), { code: "23502" });
    }
    const sequenceBefore = (
      await db.query("select last_value,is_called from checkout_number_seq")
    ).rows;
    await db.exec(
      await readFile(
        "supabase/migrations/202610020001_experience_products.sql",
        "utf8",
      ),
    );
    assert.deepEqual(await snapshots(), before);
    assert.deepEqual(
      (await db.query("select last_value,is_called from checkout_number_seq"))
        .rows,
      sequenceBefore,
    );
    const created = (await save(null, "새 체험귤")).rows[0].id;
    assert.equal((await save(p1, "수정 체험귤")).rows[0].id, p1);
    assert.equal((await save(created, "새 체험귤 수정")).rows[0].id, created);
    assert.deepEqual(
      (
        await db.query(
          "select fruit_type,weight_grams,inventory_enabled,bundle_eligible from products where id=$1",
          [p1],
        )
      ).rows,
      [
        {
          fruit_type: null,
          weight_grams: null,
          inventory_enabled: false,
          bundle_eligible: false,
        },
      ],
    );
  } finally {
    await db.close();
  }
});

test("Postgres: payment methods, validation, retries, permissions and historical migration", async () => {
  const db = await setup(true, false);
  try {
    const create = async () => {
      const requestId = crypto.randomUUID();
      await db.query("select submit_checkout($1,$2::jsonb)", [
        requestId,
        JSON.stringify(payload([delivery([{ productId: p2, quantity: 1 }])])),
      ]);
      return (
        await db.query<{ id: string }>(
          "select id from checkouts where request_id=$1",
          [requestId],
        )
      ).rows[0].id;
    };
    const legacy = await create();
    await db.query("select change_checkout($1,'pay',$2)", [legacy, staff]);
    const before = (
      await db.query<Record<string, unknown>>(
        "select * from checkouts where id=$1",
        [legacy],
      )
    ).rows[0];
    await db.exec(
      await readFile(
        "supabase/migrations/202610020002_payment_method.sql",
        "utf8",
      ),
    );
    assert.deepEqual(
      (
        await db.query<Record<string, unknown>>(
          "select * from checkouts where id=$1",
          [legacy],
        )
      ).rows[0],
      { ...before, payment_method: null },
    );
    await db.query("select change_checkout($1,'pay',$2,'card')", [
      legacy,
      staff,
    ]);
    assert.equal(
      (
        await db.query<{ payment_method: string | null }>(
          "select payment_method from checkouts where id=$1",
          [legacy],
        )
      ).rows[0].payment_method,
      null,
    );

    for (const method of ["card", "cash", "transfer", "other"]) {
      const id = await create();
      for (const invalid of [null, "", "bitcoin", "CARD"]) {
        await assert.rejects(
          db.query("select change_checkout($1,'pay',$2,$3)", [
            id,
            staff,
            invalid,
          ]),
          /결제 방식을 선택/,
        );
      }
      await assert.rejects(
        db.query("select change_checkout($1,'pay',$2)", [id, staff]),
        /결제 방식을 선택/,
      );
      await assert.rejects(
        db.query("select change_checkout($1,'pay',$2,$3)", [
          id,
          crypto.randomUUID(),
          method,
        ]),
      );
      assert.deepEqual(
        (
          await db.query(
            "select status,paid_at,payment_method from checkouts where id=$1",
            [id],
          )
        ).rows[0],
        { status: "pending", paid_at: null, payment_method: null },
      );
      await db.query("select change_checkout($1,'pay',$2,$3)", [
        id,
        staff,
        method,
      ]);
      const paid = (
        await db.query<Record<string, unknown>>(
          "select * from checkouts where id=$1",
          [id],
        )
      ).rows[0];
      assert.equal(paid.status, "paid");
      assert.equal(paid.payment_method, method);
      assert.ok(paid.paid_at);
      // Same or different subsequent selections must preserve the first payment.
      await Promise.all(
        [method, "other", "card"].map((value) =>
          db.query("select change_checkout($1,'pay',$2,$3)", [
            id,
            staff,
            value,
          ]),
        ),
      );
      assert.deepEqual(
        (
          await db.query<Record<string, unknown>>(
            "select * from checkouts where id=$1",
            [id],
          )
        ).rows[0],
        paid,
      );
      assert.equal(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from staff_events where target_id=$1 and action='pay'",
            [id],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        db.query("select change_checkout($1,'cancel',$2)", [id, staff]),
      );
      const listed = await db.query<{
        result: { orders: { payment_method: string }[] };
      }>("select list_checkouts($1,0,$2) result", [
        JSON.stringify({ id }),
        staff,
      ]);
      assert.equal(listed.rows[0].result.orders[0].payment_method, method);
    }
    const cancelled = await create();
    await assert.rejects(
      db.query("update checkouts set payment_method='cash' where id=$1", [
        cancelled,
      ]),
    );
    await db.query("select change_checkout($1,'cancel',$2)", [
      cancelled,
      staff,
    ]);
    await assert.rejects(
      db.query("select change_checkout($1,'pay',$2,'cash')", [
        cancelled,
        staff,
      ]),
      /결제 대기 주문만/,
    );
    assert.equal(
      (
        await db.query<{ payment_method: string | null }>(
          "select payment_method from checkouts where id=$1",
          [cancelled],
        )
      ).rows[0].payment_method,
      null,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select change_checkout($1,'pay',$2,'card')", [legacy, staff]),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    assert.equal(
      (
        await db.query<{ allowed: boolean }>(
          "select has_function_privilege('service_role', 'public.change_checkout(uuid,text,uuid,text)', 'EXECUTE') allowed",
        )
      ).rows[0].allowed,
      true,
    );
  } finally {
    await db.close();
  }
});
