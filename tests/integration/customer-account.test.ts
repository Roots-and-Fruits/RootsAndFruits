import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type {
  CustomerOrder,
  CustomerOrders,
  Preferences,
} from "../../src/features/account/schema";
const a = "00000000-0000-4000-8000-000000000011";
const b = "00000000-0000-4000-8000-000000000012";
const tablet = "00000000-0000-4000-8000-000000000013";
const staff = "00000000-0000-4000-8000-000000000014";
const product = "10000000-0000-4000-8000-000000000011";
const contact = { name: "기본 발송인", phone: "01000000000" };
const address = {
  ...contact,
  label: "집",
  postalCode: "00000",
  address: "가상 주소",
  addressDetail: "상세",
  isDefault: true,
};
const order = {
  category: "product",
  sender: { ...contact, privacyConsent: true, marketingConsent: false },
  deliveries: [1, 2].map((n) => ({
    recipient: {
      name: `수령인${n}`,
      phone: "01000000000",
      postalCode: "00000",
      address: "원본 주소",
      addressDetail: "원본 상세",
    },
    items: [{ productId: product, quantity: n }],
    deliveryMode: "regular",
    requestedDate: "",
  })),
};
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create table auth.identities(user_id uuid references auth.users(id) on delete cascade,provider text);
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;
    insert into auth.users(id) values('${a}'),('${b}'),('${tablet}'),('${staff}');
    insert into auth.identities values('${a}','kakao'),('${b}','kakao');`);
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  await db.query(
    "select provision_staff(1::smallint,$1,'owner','owner@example.test')",
    [staff],
  );
  await db.query(
    "update auth.users set email='tablet-01@tablet.roots-and-fruits.invalid' where id=$1",
    [tablet],
  );
  await db.query(
    "select provision_tablet($1,'tablet-01','tablet-01@tablet.roots-and-fruits.invalid')",
    [tablet],
  );
  await db.query(
    "insert into products(id,category,fruit_type,weight_grams,description,price,is_active) values($1,'product','감귤',3000,'가상 상품',10000,true)",
    [product],
  );
  return db;
}
async function value<T>(db: PGlite, sql: string, params: unknown[] = []) {
  return (await db.query<{ result: T }>(sql, params)).rows[0].result;
}
const preferences = (db: PGlite, member = a) =>
  value<Preferences>(db, "select customer_preferences($1) result", [member]);
test("customer preferences enforce ownership, validation, concurrent defaults and idempotent saves", async () => {
  const db = await setup();
  try {
    assert.deepEqual(await preferences(db), { sender: null, addresses: [] });
    await db.query("select save_customer_sender($1,$2)", [a, contact]);
    assert.deepEqual((await preferences(db)).sender, contact);
    assert.equal((await preferences(db, b)).sender, null);
    const first = crypto.randomUUID(),
      second = crypto.randomUUID();
    const save = (id: string, member = a, data = address) =>
      db.query("select save_customer_address($1,$2,$3)", [member, id, data]);
    await Promise.all([save(first), save(second)]);
    await save(second); // lost-response retry preserves one row for this id
    const rows = (await preferences(db)).addresses;
    assert.equal(rows.length, 2);
    assert.equal(rows.filter((r) => r.isDefault).length, 1);
    assert.equal(rows[0].id, second);
    await assert.rejects(save(first, b), /배송지를 찾을 수/);
    assert.deepEqual((await preferences(db, b)).addresses, []);
    await db.query("select delete_customer_address($1,$2)", [b, second]);
    assert.equal((await preferences(db)).addresses.length, 2);
    await assert.rejects(save(first, a, { ...address, phone: "010" }));
    assert.equal((await preferences(db)).addresses[0].id, second); // failed default change rolls back
    await assert.rejects(
      db.query("select save_customer_address($1,$2,$3)", [
        a,
        first,
        { ...address, isDefault: null },
      ]),
    );
    await db.query("select delete_customer_address($1,$2)", [a, first]);
    await db.query("select delete_customer_address($1,$2)", [a, first]);
    assert.equal((await preferences(db)).addresses.length, 1);
    for (const member of [tablet, staff, null, crypto.randomUUID()]) {
      await assert.rejects(
        preferences(db, member as string),
        /카카오 개인 회원/,
      );
      await assert.rejects(
        db.query("select save_customer_sender($1,$2)", [member, contact]),
        /카카오 개인 회원/,
      );
      await assert.rejects(
        db.query("select delete_customer_address($1,$2)", [member, second]),
        /카카오 개인 회원/,
      );
    }
    const before = await preferences(db);
    await db.exec(
      await readFile(
        "supabase/migrations/202610110002_customer_account.sql",
        "utf8",
      ),
    );
    assert.deepEqual(await preferences(db), before);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(preferences(db), /permission denied/);
      await assert.rejects(
        db.query("select * from customer_senders"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from customer_addresses"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select private.customer_order($1)", [crypto.randomUUID()]),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.deepEqual(await preferences(db), before);
    await assert.rejects(
      db.query("select * from customer_addresses"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("customer history exposes only owned original snapshots with tracking, cancellation and stable pagination", async () => {
  const db = await setup();
  try {
    const create = async (member: string | null) => {
      const request = crypto.randomUUID();
      await db.query("select submit_customer_checkout($1,$2,$3)", [
        request,
        order,
        member,
      ]);
      return (
        await db.query<{ id: string }>(
          "select id from checkouts where request_id=$1",
          [request],
        )
      ).rows[0].id;
    };
    const original = await create(a),
      other = await create(b),
      guest = await create(null),
      tabletOrder = await create(tablet);
    const read = (id: string, member = a) =>
      value<CustomerOrder | null>(
        db,
        "select get_customer_order($1,$2) result",
        [member, id],
      );
    const list = (cursor: string | null = null) =>
      value<CustomerOrders>(db, "select list_customer_orders($1,$2) result", [
        a,
        cursor,
      ]);
    assert.equal((await list()).orders.length, 1);
    for (const id of [other, guest, tabletOrder, crypto.randomUUID()])
      assert.equal(await read(id), null);
    await assert.rejects(read(original, tablet), /카카오 개인 회원/);
    await db.query(
      "update deliveries set note='INTERNAL_SECRET' where checkout_id=$1",
      [original],
    );
    const snap = await read(original);
    assert.ok(snap);
    assert.equal(snap.deliveries.length, 2);
    const serialized = JSON.stringify(snap);
    for (const secret of [
      "INTERNAL_SECRET",
      "privacyConsent",
      "marketingConsent",
      "request_id",
      "member_id",
      "created_by",
      "original_id",
      '"note"',
    ])
      assert.equal(serialized.includes(secret), false);
    await db.query("select save_customer_sender($1,$2)", [
      a,
      { ...contact, name: "다른 기본값" },
    ]);
    const addressId = crypto.randomUUID();
    await db.query("select save_customer_address($1,$2,$3)", [
      a,
      addressId,
      address,
    ]);
    await db.query("select save_customer_address($1,$2,$3)", [
      a,
      addressId,
      { ...address, address: "변경 주소" },
    ]);
    await db.query("select delete_customer_address($1,$2)", [a, addressId]);
    assert.deepEqual(await read(original), snap);
    for (const kind of ["correction", "repeat"]) {
      const request = crypto.randomUUID();
      await db.query("select submit_reorder_checkout($1,$2,$3,$4,$5)", [
        request,
        order,
        staff,
        original,
        kind,
      ]);
      const id = (
        await db.query<{ id: string }>(
          "select id from checkouts where request_id=$1",
          [request],
        )
      ).rows[0].id;
      assert.equal(await read(id), null);
      // Even an accidentally attached administrator copy must remain invisible.
      await db.query(
        "update checkouts set member_id=$1,order_source='kakao' where id=$2",
        [a, id],
      );
      assert.equal(await read(id), null);
    }
    await db.query("select change_checkout($1,'cancel',$2)", [original, staff]);
    assert.equal((await read(original))?.status, "cancelled");
    assert.equal((await list()).orders.length, 1);
    const tracked = await create(a);
    await db.query("select change_checkout($1,'pay',$2,'cash')", [
      tracked,
      staff,
    ]);
    const deliveries = (await read(tracked))!.deliveries;
    await db.query("select commit_export($1,$2,'test.xlsx','dGVzdA==',$3)", [
      crypto.randomUUID(),
      deliveries.map((d) => d.id),
      staff,
    ]);
    const current = (await read(tracked))!;
    await db.query("select save_delivery_tracking($1,$2,$3)", [
      deliveries.map((d, i) => ({
        id: d.id,
        key: `${current.order_number}-${d.position}`,
        version: 0,
        mode: "add",
        numbers: i ? ["333"] : ["001234567890", "222"],
      })),
      crypto.randomUUID(),
      staff,
    ]);
    await db.query("select mark_shipped($1,$2)", [[deliveries[0].id], staff]);
    const trackedResult = (await read(tracked))!;
    assert.deepEqual(trackedResult.deliveries[0].tracking_numbers, [
      "001234567890",
      "222",
    ]);
    assert.equal(trackedResult.deliveries[0].status, "shipped");
    assert.equal(trackedResult.deliveries[1].status, "exported");
    for (let n = 0; n < 21; n++) await create(a);
    const page1 = await list();
    assert.equal(page1.orders.length, 20);
    assert.ok(page1.nextCursor);
    const page2 = await list(page1.nextCursor);
    assert.equal(page2.orders.length, 3);
    assert.equal(page2.nextCursor, null);
    const numbers = [...page1.orders, ...page2.orders].map(
      (o) => o.order_number,
    );
    assert.equal(new Set(numbers).size, 23);
    assert.deepEqual(
      numbers,
      [...numbers].sort((x, y) => y - x),
    );
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from order_notifications",
        )
      ).rows[0].count,
      0,
    );
  } finally {
    await db.close();
  }
});

test("account deletion removes preferences, preserves order and notification snapshots, and does not reconnect new members", async () => {
  const db = await setup();
  try {
    await db.query("select save_customer_sender($1,$2)", [a, contact]);
    await db.query("select save_customer_address($1,$2,$3)", [
      a,
      crypto.randomUUID(),
      address,
    ]);
    await db.query("select save_customer_sender($1,$2)", [
      b,
      { ...contact, name: "다른 회원" },
    ]);
    await db.exec(
      "update notification_settings set enabled=true,provider='aligo',test_mode=true",
    );
    const request = crypto.randomUUID();
    await db.query("select submit_customer_checkout($1,$2,$3)", [
      request,
      order,
      a,
    ]);
    const before = (
      await db.query<{ row: Record<string, unknown> }>(
        "select to_jsonb(c) as row from checkouts c where request_id=$1",
        [request],
      )
    ).rows[0].row;
    const deliveries = await db.query(
      "select * from deliveries where checkout_id=$1 order by id",
      [before.id],
    );
    const notifications = await db.query(
      "select * from order_notifications order by id",
    );
    assert.equal(
      await value(db, "select customer_deletion_ready($1) result", [a]),
      true,
    );
    for (const other of [staff, tablet, null])
      await assert.rejects(
        db.query("select customer_deletion_ready($1)", [other]),
      );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select customer_deletion_ready($1)", [a]),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec(
      await readFile(
        "supabase/migrations/202610110004_customer_deletion.sql",
        "utf8",
      ),
    );
    assert.deepEqual((await preferences(db)).sender, contact);
    assert.equal(notifications.rows.length, 1);
    // A database failure must roll the before-delete trigger back too.
    await db.exec(
      "create table deletion_blocker(member uuid references auth.users(id))",
    );
    await db.query("insert into deletion_blocker values($1)", [a]);
    await assert.rejects(db.query("delete from auth.users where id=$1", [a]));
    assert.deepEqual(
      (
        await db.query<{ row: Record<string, unknown> }>(
          "select to_jsonb(c) as row from checkouts c where request_id=$1",
          [request],
        )
      ).rows[0].row,
      before,
    );
    assert.deepEqual((await preferences(db)).sender, contact);
    await db.exec("drop table deletion_blocker");
    // Same atomic auth-user deletion used by Supabase admin.deleteUser.
    await db.query("delete from auth.users where id=$1", [a]);
    assert.deepEqual(
      (await db.query("select * from customer_senders where member_id=$1", [a]))
        .rows,
      [],
    );
    assert.deepEqual(
      (
        await db.query("select * from customer_addresses where member_id=$1", [
          a,
        ])
      ).rows,
      [],
    );
    assert.equal((await preferences(db, b)).sender?.name, "다른 회원");
    const after = (
      await db.query<{ row: Record<string, unknown> }>(
        "select to_jsonb(c) as row from checkouts c where request_id=$1",
        [request],
      )
    ).rows[0].row;
    assert.ok(after.member_deleted_at);
    assert.deepEqual(after, {
      ...before,
      member_id: null,
      member_deleted_at: after.member_deleted_at,
    });
    assert.deepEqual(
      (
        await db.query(
          "select * from deliveries where checkout_id=$1 order by id",
          [before.id],
        )
      ).rows,
      deliveries.rows,
    );
    assert.deepEqual(
      (await db.query("select * from order_notifications order by id")).rows,
      notifications.rows,
    );
    await assert.rejects(preferences(db, a), /카카오 개인 회원/);
    // A new Kakao auth user, even with identical contact data, has no old orders.
    const newMember = crypto.randomUUID();
    await db.query("insert into auth.users(id) values($1)", [newMember]);
    await db.query("insert into auth.identities values($1,'kakao')", [
      newMember,
    ]);
    assert.deepEqual(
      (
        await value<CustomerOrders>(
          db,
          "select list_customer_orders($1) result",
          [newMember],
        )
      ).orders,
      [],
    );
    await assert.rejects(
      db.query("update checkouts set member_id=$1 where request_id=$2", [
        newMember,
        request,
      ]),
    );
  } finally {
    await db.close();
  }
});
