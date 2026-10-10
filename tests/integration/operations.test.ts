import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  aligoVariables,
  type NotificationJob,
} from "../../src/features/notifications/messages";
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
  includeCancellationMigration = includePaymentMigration,
  includeAligoOnlyMigration = true,
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
    "202610030002_cancel_before_export.sql",
    "202610050001_shipping_worklist.sql",
    "202610050002_delivery_tracking.sql",
    "202610060001_aligo_notifications.sql",
    "202610070001_sender_only_notifications.sql",
    "202610100001_aligo_only_notifications.sql",
    "202610110001_reorder_kind.sql",
  ])
    if (
      (includeExperienceMigration ||
        f !== "202610020001_experience_products.sql") &&
      (includePaymentMigration || f !== "202610020002_payment_method.sql") &&
      (includeCancellationMigration ||
        f !== "202610030002_cancel_before_export.sql") &&
      (includeAligoOnlyMigration ||
        f !== "202610100001_aligo_only_notifications.sql")
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
test("Postgres: reorder kinds preserve originals, requests, stock and notification uniqueness", async () => {
  const db = await setup();
  try {
    await db.query(
      "select configure_notification_delivery(true,'aligo',true,$1)",
      [staff],
    );
    await db.exec(
      "update products set stock_quantity=100 where inventory_enabled",
    );
    const order = payload([delivery([{ productId: p1, quantity: 2 }])]);
    await db.query("select submit_checkout($1,$2::jsonb)", [
      crypto.randomUUID(),
      JSON.stringify(order),
    ]);
    const original = (
      await db.query<{ id: string }>("select id from checkouts")
    ).rows[0].id;
    const before = (
      await db.query("select to_jsonb(c) value from checkouts c where id=$1", [
        original,
      ])
    ).rows;
    const submit = (
      request: string,
      kind: string | null,
      actor = staff,
      source: string | null = original,
      data = order,
    ) =>
      db.query<{ result: { orderNumber: number } }>(
        "select submit_reorder_checkout($1,$2::jsonb,$3,$4,$5) as result",
        [request, JSON.stringify(data), actor, source, kind],
      );
    for (const kind of ["correction", "repeat"]) {
      const request = crypto.randomUUID();
      const [first, retry] = await Promise.all([
        submit(request, kind),
        submit(request, kind),
      ]);
      assert.deepEqual(first.rows, retry.rows);
      const created = (
        await db.query<{
          id: string;
          reorder_kind: string;
          status: string;
          original_id: string;
        }>(
          "select id,reorder_kind,status,original_id from checkouts where request_id=$1",
          [request],
        )
      ).rows[0];
      assert.equal(created.reorder_kind, kind);
      assert.equal(created.status, "pending");
      assert.equal(created.original_id, original);
      const events = (
        await db.query<{ details: { kind: string; original_id: string } }>(
          "select details from staff_events where target_id=$1 and action='reorder'",
          [created.id],
        )
      ).rows;
      assert.equal(events.length, 1);
      assert.deepEqual(events[0].details, { kind, original_id: original });
      await assert.rejects(
        submit(request, kind === "repeat" ? "correction" : "repeat"),
        /구분이 변경/,
      );
      await assert.rejects(
        submit(request, kind, staff, created.id),
        /내용이 변경/,
      );
      await assert.rejects(
        submit(request, kind, staff, original, {
          ...order,
          sender: { ...sender, name: "다른 이름" },
        }),
        /내용이 변경/,
      );
      const listed = (
        await db.query<{ result: { orders: { reorder_kind: string }[] } }>(
          "select list_checkouts($1::jsonb,0,$2) result",
          [JSON.stringify({ id: created.id }), staff],
        )
      ).rows[0].result;
      assert.equal(listed.orders[0].reorder_kind, kind);
      await db.query("select change_checkout($1,'pay',$2,'cash')", [
        created.id,
        staff,
      ]);
      const shipping = (
        await db.query<{
          result: { orders: { id: string; reorder_kind: string }[] };
        }>("select list_shipping_work($1) result", [staff])
      ).rows[0].result;
      assert.equal(
        shipping.orders.find((c) => c.id === created.id)?.reorder_kind,
        kind,
      );
    }
    assert.deepEqual(
      (
        await db.query(
          "select to_jsonb(c) value from checkouts c where id=$1",
          [original],
        )
      ).rows,
      before,
    );
    assert.equal(
      (
        await db.query<{ stock_quantity: number }>(
          "select stock_quantity from products where id=$1",
          [p1],
        )
      ).rows[0].stock_quantity,
      94,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from order_notifications where event='received'",
        )
      ).rows[0].n,
      3,
    );
    for (const kind of [null, "other"])
      await assert.rejects(submit(crypto.randomUUID(), kind), /재접수 구분/);
    await assert.rejects(
      submit(crypto.randomUUID(), "repeat", crypto.randomUUID()),
      /관리자/,
    );
    await assert.rejects(
      submit(crypto.randomUUID(), "repeat", staff, null),
      /원본 주문/,
    );
    await assert.rejects(
      submit(crypto.randomUUID(), "repeat", staff, crypto.randomUUID()),
      /원본 주문/,
    );
    const legacyRequest = crypto.randomUUID();
    const legacyArgs = [legacyRequest, JSON.stringify(order), staff, original];
    const legacy = await db.query(
      "select submit_checkout($1,$2::jsonb,$3,$4) result",
      legacyArgs,
    );
    await assert.rejects(submit(legacyRequest, "repeat"), /구분이 변경/);
    assert.deepEqual(
      (
        await db.query(
          "select submit_checkout($1,$2::jsonb,$3,$4) result",
          legacyArgs,
        )
      ).rows,
      legacy.rows,
    );
    assert.equal(
      (
        await db.query<{ reorder_kind: string | null }>(
          "select reorder_kind from checkouts where request_id=$1",
          [legacyRequest],
        )
      ).rows[0].reorder_kind,
      null,
    );
    await db.exec(
      await readFile(
        "supabase/migrations/202610110001_reorder_kind.sql",
        "utf8",
      ),
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from checkouts where reorder_kind is not null",
        )
      ).rows[0].n,
      2,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        submit(crypto.randomUUID(), "repeat"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("Postgres: Aligo-only migration retires SMS work without resending history or enabling delivery", async () => {
  const migration = await readFile(
    "supabase/migrations/202610100001_aligo_only_notifications.sql",
    "utf8",
  );
  for (const legacyConnection of [false, true]) {
    const db = await setup(true, true, true, false);
    try {
      await db.query(
        "select configure_notification_delivery(true,'aligo',false,$1)",
        [staff],
      );
      const legacy = [];
      for (const status of [
        "pending",
        "failed",
        "sending",
        "accepted",
        "unknown",
      ]) {
        const request = crypto.randomUUID();
        await db.query("select submit_checkout($1,$2::jsonb)", [
          request,
          JSON.stringify(payload([delivery([{ productId: p2, quantity: 1 }])])),
        ]);
        const row = (
          await db.query<{ id: string }>(
            "select n.id from order_notifications n join checkouts c on c.id=n.checkout_id where c.request_id=$1",
            [request],
          )
        ).rows[0];
        await db.query(
          "update order_notifications set provider='solapi',status=$2,provider_id='old-message',prepared_message=$3 where id=$1",
          [
            row.id,
            status,
            JSON.stringify({ text: "보존할 이전 본문", subject: "이전 안내" }),
          ],
        );
        legacy.push({ id: row.id, status });
      }
      await db.query("select submit_checkout($1,$2::jsonb)", [
        crypto.randomUUID(),
        JSON.stringify(payload([delivery([{ productId: p2, quantity: 1 }])])),
      ]);
      const aligoBefore = (
        await db.query(
          "select * from order_notifications where provider='aligo'",
        )
      ).rows;
      const ordersBefore = (
        await db.query("select * from checkouts order by id")
      ).rows;
      if (legacyConnection)
        await db.exec(
          "update notification_settings set provider='solapi',enabled=true,test_mode=false where id=1",
        );
      await db.exec(migration);
      const settings = (
        await db.query<{
          provider: string;
          enabled: boolean;
          test_mode: boolean;
        }>("select * from notification_settings")
      ).rows[0];
      assert.equal(settings.provider, "aligo");
      assert.equal(settings.enabled, !legacyConnection);
      assert.equal(settings.test_mode, legacyConnection);
      assert.deepEqual(
        (await db.query("select * from checkouts order by id")).rows,
        ordersBefore,
      );
      assert.deepEqual(
        (
          await db.query(
            "select * from order_notifications where provider='aligo'",
          )
        ).rows,
        aligoBefore,
      );
      for (const original of legacy) {
        const row = (
          await db.query<{
            status: string;
            provider_id: string;
            prepared_message: { text: string };
          }>("select * from order_notifications where id=$1", [original.id])
        ).rows[0];
        assert.equal(
          row.status,
          ["pending", "failed"].includes(original.status)
            ? "skipped"
            : original.status === "sending"
              ? "unknown"
              : original.status,
        );
        assert.equal(row.provider_id, "old-message");
        assert.equal(row.prepared_message.text, "보존할 이전 본문");
      }
      const after = (
        await db.query("select * from order_notifications order by id")
      ).rows;
      await db.exec(migration);
      assert.deepEqual(
        (await db.query("select * from order_notifications order by id")).rows,
        after,
      );
      assert.equal(
        (
          await db.query<{ name: string | null }>(
            "select to_regprocedure('public.claim_order_notifications(integer)') as name",
          )
        ).rows[0].name,
        null,
      );
      await assert.rejects(
        db.query(
          "select configure_notification_delivery(true,'solapi',false,$1)",
          [staff],
        ),
        /연결 설정/,
      );
      // Settings changes and old request retries cannot revive the retired queue.
      await db.query(
        "select configure_notification_delivery(true,'aligo',false,$1)",
        [staff],
      );
      await assert.rejects(
        db.query("select retry_order_notification($1,$2)", [
          legacy[1].id,
          staff,
        ]),
        /이전 문자 서비스/,
      );
      const claimed = (
        await db.query<NotificationJob>(
          "select * from claim_notification_delivery('aligo',false,10)",
        )
      ).rows;
      assert.equal(claimed.length, 1);
      assert.ok(
        claimed.every(
          (row) => row.provider === "aligo" && row.recipient_role === "sender",
        ),
      );
      assert.equal(
        (
          await db.query(
            "select * from claim_notification_delivery('solapi',false,10)",
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select * from claim_notification_delivery('aligo',false,10)",
          )
        ).rows.length,
        0,
      );
    } finally {
      await db.close();
    }
  }
});

test("Postgres: historical Aligo migration isolates providers/test mode and preserves history", async () => {
  const db = await setup(true, true, true, false);
  try {
    const configure = (provider: string, testMode: boolean, enabled = true) =>
      db.query("select configure_notification_delivery($1,$2,$3,$4)", [
        enabled,
        provider,
        testMode,
        staff,
      ]);
    const submit = async () => {
      const requestId = crypto.randomUUID();
      await db.query("select submit_checkout($1,$2::jsonb)", [
        requestId,
        JSON.stringify(
          payload([
            delivery([{ productId: p2, quantity: 1 }]),
            delivery([{ productId: p2, quantity: 2 }]),
          ]),
        ),
      ]);
      return (
        await db.query<{ id: string }>(
          "select id from checkouts where request_id=$1",
          [requestId],
        )
      ).rows[0].id;
    };
    await configure("solapi", false);
    await submit();
    await configure("aligo", true);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from order_notifications",
        )
      ).rows[0].status,
      "skipped",
    );
    const first = await submit();
    const claim = (testMode = true) =>
      db.query<NotificationJob>(
        "select * from claim_notification_delivery('aligo',$1,10)",
        [testMode],
      );
    assert.equal(
      (await db.query("select * from claim_order_notifications(10)")).rows
        .length,
      0,
    );
    assert.equal((await claim(false)).rows.length, 0);
    const job = (await claim()).rows[0];
    assert.equal(job.provider, "aligo");
    assert.equal(job.test_mode, true);
    assert.equal(job.phone, sender.phone);
    const vars = aligoVariables(job);
    assert.equal(vars.주문금액, "57,000");
    assert.match(vars.배송지정보, /가상 주소 테스트/);
    assert.match(vars.배송지정보, /한라봉 3kg.*× 2/);
    assert.equal((await claim()).rows.length, 0);
    await assert.rejects(configure("aligo", false), /전송 중/);
    const prepared = {
      text: "정확한 등록 본문\n시험",
      subject: "주문접수",
      templateCode: "UM_0746",
    };
    const prepare = (attempt: number) =>
      db.query<{ ready: boolean }>(
        "select prepare_order_notification($1,$2,'aligo',true,$3) as ready",
        [job.id, attempt, JSON.stringify(prepared)],
      );
    assert.equal((await prepare(job.attempts + 1)).rows[0].ready, false);
    assert.equal((await prepare(job.attempts)).rows[0].ready, true);
    await db.query(
      "update order_notifications set status='tested',provider_code='0' where id=$1",
      [job.id],
    );
    await db.query("select retry_order_notification($1,$2)", [job.id, staff]);
    assert.equal((await claim()).rows.length, 0);
    await configure("aligo", false);
    await db.query("select retry_order_notification($1,$2)", [job.id, staff]);
    assert.equal((await claim(false)).rows.length, 0);
    const ids = (
      await db.query<{ id: string }>(
        "select id from deliveries where checkout_id=$1",
        [first],
      )
    ).rows.map((r) => r.id);
    await db.query("select change_checkout($1,'pay',$2,'cash')", [
      first,
      staff,
    ]);
    await db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
      crypto.randomUUID(),
      ids,
      staff,
    ]);
    assert.equal((await claim(false)).rows.length, 0);
    await db.query("select mark_shipped($1,$2)", [ids, staff]);
    await db.query("select mark_shipped($1,$2)", [ids, staff]);
    const shipped = (await claim(false)).rows;
    assert.equal(shipped.length, 2);
    assert.ok(shipped.every((j) => aligoVariables(j).보내는분 === sender.name));
    await db.query(
      "update order_notifications set status='unknown' where id=$1",
      [shipped[0].id],
    );
    await db.query("select retry_order_notification($1,$2)", [
      shipped[0].id,
      staff,
    ]);
    assert.equal((await claim(false)).rows.length, 0);
    await db.query(
      "update order_notifications set status='failed' where id=$1",
      [shipped[1].id],
    );
    await configure("solapi", false);
    await assert.rejects(
      db.query("select retry_order_notification($1,$2)", [
        shipped[1].id,
        staff,
      ]),
      /현재 연결과 다른/,
    );
    await configure("aligo", false);
    await db.query("select retry_order_notification($1,$2)", [
      shipped[1].id,
      staff,
    ]);
    assert.equal((await claim(false)).rows.length, 1);
    await db.query(
      "update order_notifications set updated_at=now()-interval '6 minutes' where id=$1",
      [shipped[1].id],
    );
    await configure("solapi", false);
    assert.equal(
      (
        await db.query<{ status: string }>(
          "select status from order_notifications where id=$1",
          [shipped[1].id],
        )
      ).rows[0].status,
      "unknown",
    );
    await configure("aligo", true);
    await submit();
    const disableJob = (await claim()).rows[0];
    await configure("aligo", true, false);
    assert.equal(
      (
        await db.query<{ ready: boolean }>(
          "select prepare_order_notification($1,$2,'aligo',true,$3) as ready",
          [disableJob.id, disableJob.attempts, JSON.stringify(prepared)],
        )
      ).rows[0].ready,
      false,
    );
    const history = (
      await db.query("select * from order_notifications order by id")
    ).rows;
    await db.exec(
      await readFile(
        "supabase/migrations/202610060001_aligo_notifications.sql",
        "utf8",
      ),
    );
    assert.deepEqual(
      (await db.query("select * from order_notifications order by id")).rows,
      history,
    );
    assert.deepEqual(
      (
        await db.query<{ prepared_message: unknown }>(
          "select prepared_message from order_notifications where id=$1",
          [job.id],
        )
      ).rows[0].prepared_message,
      prepared,
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select * from claim_notification_delivery('aligo',true,3)"),
      );
      await assert.rejects(
        db.query(
          "select configure_notification_delivery(true,'aligo',true,$1)",
          [staff],
        ),
      );
      await assert.rejects(
        db.query("select prepare_order_notification($1,1,'aligo',true,'{}')", [
          job.id,
        ]),
      );
      await db.exec("reset role");
    }
  } finally {
    await db.close();
  }
});

test("Postgres: Aligo only notifies sender for different/same recipient phones and keeps sender retries idempotent", async () => {
  const db = await setup();
  try {
    await db.query(
      "select configure_notification_delivery(true,'aligo',true,$1)",
      [staff],
    );
    const request = crypto.randomUUID();
    await db.query("select submit_checkout($1,$2::jsonb)", [
      request,
      JSON.stringify(
        payload([
          {
            ...delivery([{ productId: p2, quantity: 2 }]),
            recipient: { ...recipient, phone: "01099998888" },
          },
          delivery([{ productId: p2, quantity: 1 }]),
        ]),
      ),
    ]);
    const receipt = (
      await db.query<NotificationJob & { checkout_id: string }>(
        "select * from order_notifications",
      )
    ).rows;
    assert.equal(receipt.length, 1);
    assert.equal(receipt[0].event, "received");
    assert.equal(receipt[0].phone, sender.phone);
    assert.equal(receipt[0].recipient_role, "sender");
    await db.query(
      "update order_notifications set status='tested' where id=$1",
      [receipt[0].id],
    );
    const order = receipt[0].checkout_id;
    const ids = (
      await db.query<{ id: string }>(
        "select id from deliveries where checkout_id=$1 order by position",
        [order],
      )
    ).rows.map((row) => row.id);
    await db.query("select change_checkout($1,'pay',$2,'card')", [
      order,
      staff,
    ]);
    await db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
      crypto.randomUUID(),
      ids,
      staff,
    ]);
    await db.query("select mark_shipped($1,$2)", [ids, staff]);
    await db.query("select mark_shipped($1,$2)", [ids, staff]);
    const jobs = (
      await db.query<NotificationJob & { delivery_id: string }>(
        "select * from claim_notification_delivery('aligo',true,10)",
      )
    ).rows;
    assert.equal(jobs.length, 2);
    assert.ok(
      jobs.every(
        (job) => job.recipient_role === "sender" && job.phone === sender.phone,
      ),
    );
    const first = jobs.filter((job) => job.delivery_id === ids[0]);
    assert.deepEqual(first.map((job) => job.phone).sort(), [sender.phone]);
    assert.equal(jobs.filter((job) => job.delivery_id === ids[1]).length, 1);
    const failed = jobs[0];
    assert.equal(failed.phone, sender.phone);
    await db.query(
      "update order_notifications set status=case when id=$1 then 'failed' else 'tested' end where event='shipped'",
      [failed.id],
    );
    await db.query("select retry_order_notification($1,$2)", [
      failed.id,
      staff,
    ]);
    const retry = (
      await db.query<NotificationJob>(
        "select * from claim_notification_delivery('aligo',true,10)",
      )
    ).rows;
    assert.equal(retry.length, 1);
    assert.equal(retry[0].id, failed.id);
    assert.equal(retry[0].attempts, 2);
    assert.equal(
      (
        await db.query(
          "select * from claim_notification_delivery('aligo',true,10)",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select * from order_notifications where event='shipped'",
        )
      ).rows.length,
      2,
    );
  } finally {
    await db.close();
  }
});

test("Postgres: sender-only migration skips old recipient work, preserves sent history and blocks prepare/retry", async () => {
  const db = await setup();
  try {
    // Reproduce an installation that already ran the previous recipient policy.
    await db.exec(
      await readFile(
        "supabase/migrations/202610060001_aligo_notifications.sql",
        "utf8",
      ),
    );
    await db.query(
      "select configure_notification_delivery(true,'aligo',true,$1)",
      [staff],
    );
    const request = crypto.randomUUID();
    await db.query("select submit_checkout($1,$2::jsonb)", [
      request,
      JSON.stringify(
        payload(
          Array.from({ length: 4 }, () => ({
            ...delivery([{ productId: p2, quantity: 1 }]),
            recipient: { ...recipient, phone: "01099998888" },
          })),
        ),
      ),
    ]);
    const order = (
      await db.query<{ id: string }>(
        "select id from checkouts where request_id=$1",
        [request],
      )
    ).rows[0].id;
    const ids = (
      await db.query<{ id: string }>(
        "select id from deliveries where checkout_id=$1 order by position",
        [order],
      )
    ).rows.map((row) => row.id);
    await db.query("select change_checkout($1,'pay',$2,'card')", [
      order,
      staff,
    ]);
    await db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
      crypto.randomUUID(),
      ids,
      staff,
    ]);
    await db.query("select mark_shipped($1,$2)", [ids, staff]);
    const oldRecipients = (
      await db.query<NotificationJob>(
        "select * from order_notifications where recipient_role='recipient' order by delivery_id",
      )
    ).rows;
    assert.equal(oldRecipients.length, 4);
    for (const [index, status] of [
      "pending",
      "failed",
      "accepted",
      "sending",
    ].entries()) {
      await db.query(
        "update order_notifications set status=$1,attempts=1 where id=$2",
        [status, oldRecipients[index].id],
      );
    }
    const kept = (
      await db.query(
        "select * from order_notifications where recipient_role='sender' or status='accepted' order by id",
      )
    ).rows;
    const settings = (await db.query("select * from notification_settings"))
      .rows;
    const sql = await readFile(
      "supabase/migrations/202610070001_sender_only_notifications.sql",
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
    assert.deepEqual(
      (await db.query("select * from notification_settings")).rows,
      settings,
    );
    assert.deepEqual(
      (
        await db.query(
          "select * from order_notifications where recipient_role='sender' or status='accepted' order by id",
        )
      ).rows,
      kept,
    );
    assert.deepEqual(
      (
        await db.query<{ status: string }>(
          "select status from order_notifications where id=any($1) order by id",
          [[oldRecipients[0].id, oldRecipients[1].id]],
        )
      ).rows.map((row) => row.status),
      ["skipped", "skipped"],
    );
    await assert.rejects(
      db.query("select retry_order_notification($1,$2)", [
        oldRecipients[1].id,
        staff,
      ]),
      /받는 분 대상/,
    );
    assert.equal(
      (
        await db.query<{ ready: boolean }>(
          "select prepare_order_notification($1,1,'aligo',true,'{\"text\":\"test\"}') as ready",
          [oldRecipients[3].id],
        )
      ).rows[0].ready,
      false,
    );
    // Covers an obsolete worker putting a recipient job back in pending.
    await db.query(
      "update order_notifications set status='pending' where id=$1",
      [oldRecipients[0].id],
    );
    const jobs = (
      await db.query<NotificationJob>(
        "select * from claim_notification_delivery('aligo',true,10)",
      )
    ).rows;
    assert.equal(jobs.length, 5);
    assert.ok(
      jobs.every(
        (job) => job.recipient_role === "sender" && job.phone === sender.phone,
      ),
    );
  } finally {
    await db.close();
  }
});

test("Postgres: tracking import handles multiple numbers, replacement, concurrency, permissions and notifications", async () => {
  const db = await setup();
  try {
    await db.query("select configure_order_notifications(true,$1)", [staff]);
    const request = crypto.randomUUID();
    await db.query("select submit_checkout($1,$2::jsonb)", [
      request,
      JSON.stringify(
        payload([
          delivery([{ productId: p1, quantity: 2 }]),
          delivery([{ productId: p2, quantity: 1 }]),
        ]),
      ),
    ]);
    const order = (
      await db.query<{ id: string; order_number: number }>(
        "select id,order_number from checkouts where request_id=$1",
        [request],
      )
    ).rows[0];
    const deliveries = (
      await db.query<{ id: string }>(
        "select id from deliveries where checkout_id=$1 order by position",
        [order.id],
      )
    ).rows;
    const first = deliveries[0].id,
      second = deliveries[1].id;
    const keys = [`${order.order_number}-1`, `${order.order_number}-2`];
    const preview = async () =>
      (
        await db.query<{
          result: {
            id: string;
            key: string;
            version: number;
            tracking_numbers: string[];
            status: string;
          }[];
        }>("select preview_delivery_tracking($1,$2) result", [keys, staff])
      ).rows[0].result;
    const save = (
      changes: unknown[],
      id = crypto.randomUUID(),
      actor = staff,
    ) =>
      db.query<{
        result: { id: string; status: string; tracking_numbers: string[] }[];
      }>("select save_delivery_tracking($1::jsonb,$2,$3) result", [
        JSON.stringify(changes),
        id,
        actor,
      ]);
    const change = (
      version: number,
      numbers: string[],
      mode = "add",
      id = first,
      key = keys[0],
    ) => ({ id, key, version, numbers, mode });
    await assert.rejects(save([change(0, ["001234567890"])]), /주문 상태/);
    await db.query("select change_checkout($1,'pay',$2,'card')", [
      order.id,
      staff,
    ]);
    await assert.rejects(save([change(0, ["001234567890"])]), /주문 상태/);
    await db.query("select commit_export($1,$2,$3,$4,$5)", [
      crypto.randomUUID(),
      [first, second],
      "test.xlsx",
      "",
      staff,
    ]);
    const initial = [
      change(0, ["001234567890", "001234567891", "001234567890"]),
      change(0, ["002222222222"], "add", second, keys[1]),
    ];
    const saveRequest = crypto.randomUUID();
    const saved = await save(initial, saveRequest);
    assert.equal(saved.rows[0].result.length, 2);
    assert.deepEqual((await preview())[0].tracking_numbers, [
      "001234567890",
      "001234567891",
    ]);
    assert.equal((await preview())[0].version, 1);
    assert.equal(
      (
        await db.query(
          "select * from order_notifications where event='shipped'",
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from staff_events where action='tracking'"))
        .rows.length,
      2,
    );
    assert.deepEqual(await save(initial, saveRequest), saved);
    await assert.rejects(save([change(0, ["9"])], saveRequest), /같은 송장/);
    await assert.rejects(save([change(0, ["9"])]), /다른 관리자/);
    await assert.rejects(
      save([change(1, ["9"], "replace", first, keys[1])]),
      /주문 상태/,
    );
    await assert.rejects(
      save([change(1, ["9"])], crypto.randomUUID(), crypto.randomUUID()),
      /관리자/,
    );
    await assert.rejects(save([change(1, ["invalid"])]), /숫자로/);
    // Fresh repeat is a no-op and does not increment versions or audit events.
    await save([change(1, ["001234567890", "001234567891"])]);
    assert.equal((await preview())[0].version, 1);
    assert.equal(
      (await db.query("select * from staff_events where action='tracking'"))
        .rows.length,
      2,
    );
    // A stale second row rolls back the whole save, including the first row.
    await assert.rejects(
      save([
        change(1, ["003333333333"]),
        change(0, ["4"], "replace", second, keys[1]),
      ]),
      /다른 관리자/,
    );
    assert.equal((await preview())[0].version, 1);
    const replacement = [change(1, ["000000000009"], "replace")];
    const replacementRequest = crypto.randomUUID();
    await save(replacement, replacementRequest);
    assert.deepEqual((await preview())[0].tracking_numbers, ["000000000009"]);
    await save([change(2, ["000000000008"])]);
    await save(replacement, replacementRequest); // Lost response must not undo a later addition.
    assert.deepEqual((await preview())[0].tracking_numbers, [
      "000000000008",
      "000000000009",
    ]);
    const list = (
      await db.query<{
        result: { orders: { deliveries: { tracking_numbers: string[] }[] }[] };
      }>("select list_checkouts('{}',0,$1) result", [staff])
    ).rows[0].result;
    assert.deepEqual(list.orders[0].deliveries[0].tracking_numbers, [
      "000000000008",
      "000000000009",
    ]);
    const work = (
      await db.query<{
        result: { orders: { deliveries: { tracking_numbers: string[] }[] }[] };
      }>("select list_shipping_work($1) result", [staff])
    ).rows[0].result;
    assert.deepEqual(
      work.orders[0].deliveries[0].tracking_numbers,
      list.orders[0].deliveries[0].tracking_numbers,
    );
    await db.query("select mark_shipped($1,$2)", [[first, second], staff]);
    await db.query("select mark_shipped($1,$2)", [[first, second], staff]);
    await save([change(3, ["777777777777"], "replace")]);
    assert.equal((await preview())[0].status, "shipped");
    assert.equal(
      (
        await db.query(
          "select * from order_notifications where event='shipped'",
        )
      ).rows.length,
      2,
    );
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from delivery_tracking_numbers"),
      /permission/,
    );
    await assert.rejects(
      db.query("select preview_delivery_tracking($1,$2)", [keys, staff]),
      /permission/,
    );
    await db.exec("reset role");
    // Re-applying SQL preserves tracking and notification history.
    await db.exec(
      await readFile(
        "supabase/migrations/202610050002_delivery_tracking.sql",
        "utf8",
      ),
    );
    assert.deepEqual((await preview())[0].tracking_numbers, ["777777777777"]);
  } finally {
    await db.close();
  }
});
test("Postgres: cancellation upgrade preserves history, accepts paid orders and restores stock once", async () => {
  const db = await setup(true, true, false);
  try {
    await db.query("select configure_order_notifications(true,$1)", [staff]);
    const ids: string[] = [];
    for (const method of [
      "card",
      "cash",
      "transfer",
      "other",
      "legacy",
      "pending",
    ]) {
      const requestId = crypto.randomUUID();
      await db.query("select submit_checkout($1,$2::jsonb)", [
        requestId,
        JSON.stringify(
          payload([
            delivery([{ productId: p1, quantity: 1 }]),
            delivery([{ productId: p2, quantity: 1 }]),
          ]),
        ),
      ]);
      const id = (
        await db.query<{ id: string }>(
          "select id from checkouts where request_id=$1",
          [requestId],
        )
      ).rows[0].id;
      ids.push(id);
      if (method !== "pending") {
        await db.query("select change_checkout($1,'pay',$2,$3)", [
          id,
          staff,
          method === "legacy" ? "card" : method,
        ]);
        if (method === "legacy")
          await db.query(
            "update checkouts set payment_method=null where id=$1",
            [id],
          );
        await assert.rejects(
          db.query("select change_checkout($1,'cancel',$2)", [id, staff]),
          /결제 전 주문만/,
        );
      }
    }
    const snapshot = async () => ({
      orders: (await db.query("select * from checkouts order by id")).rows,
      deliveries: (await db.query("select * from deliveries order by id")).rows,
      items: (await db.query("select * from order_items order by id")).rows,
      stock: (await db.query("select * from stock_movements order by id")).rows,
      events: (await db.query("select * from staff_events order by id")).rows,
      sequence: (
        await db.query("select last_value,is_called from checkout_number_seq")
      ).rows,
    });
    const before = await snapshot();
    await db.exec(
      await readFile(
        "supabase/migrations/202610030002_cancel_before_export.sql",
        "utf8",
      ),
    );
    assert.deepEqual(await snapshot(), before);
    await db.query("update products set inventory_enabled=false where id=$1", [
      p1,
    ]);
    for (const id of ids) {
      const original = (
        await db.query<Record<string, unknown>>(
          "select * from checkouts where id=$1",
          [id],
        )
      ).rows[0];
      await assert.rejects(
        db.query("select change_checkout($1,'cancel',$2)", [
          id,
          crypto.randomUUID(),
        ]),
      );
      await db.query("select change_checkout($1,'cancel',$2)", [id, staff]);
      const cancelled = (
        await db.query<Record<string, unknown>>(
          "select * from checkouts where id=$1",
          [id],
        )
      ).rows[0];
      assert.ok(cancelled.cancelled_at);
      assert.deepEqual(cancelled, {
        ...original,
        status: "cancelled",
        cancelled_at: cancelled.cancelled_at,
      });
      await db.query("select change_checkout($1,'cancel',$2)", [id, staff]);
      assert.deepEqual(
        (await db.query("select * from checkouts where id=$1", [id])).rows[0],
        cancelled,
      );
      assert.equal(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from staff_events where target_id=$1 and action='cancel'",
            [id],
          )
        ).rows[0].n,
        1,
      );
      assert.deepEqual(
        (
          await db.query(
            "select product_id,delta from stock_movements where checkout_id=$1 and reason='cancel'",
            [id],
          )
        ).rows,
        [{ product_id: p1, delta: 1 }],
      );
      await assert.rejects(
        db.query("select change_checkout($1,'pay',$2,'cash')", [id, staff]),
        /결제 대기 주문만/,
      );
    }
    assert.deepEqual(
      (
        await db.query(
          "select id,stock_quantity from products where id=any($1) order by id",
          [[p1, p2]],
        )
      ).rows,
      [
        { id: p1, stock_quantity: 2 },
        { id: p2, stock_quantity: null },
      ],
    );
    const after = await snapshot();
    assert.deepEqual(after.deliveries, before.deliveries);
    assert.deepEqual(after.items, before.items);
    assert.deepEqual(after.sequence, before.sequence);
    assert.equal(
      (
        await db.query(
          "select * from claim_notification_delivery('aligo',true,10)",
        )
      ).rows.length,
      0,
    );
    assert.ok(
      (
        await db.query<{ status: string }>(
          "select status from order_notifications",
        )
      ).rows.every((n) => n.status === "skipped"),
    );
    for (const role of ["anon", "authenticated"]) {
      const privileges = (
        await db.query<{ cancel: boolean; export: boolean }>(
          "select has_function_privilege($1,'public.change_checkout(uuid,text,uuid,text)','EXECUTE') as cancel,has_function_privilege($1,'public.commit_export(uuid,uuid[],text,text,uuid)','EXECUTE') as export",
          [role],
        )
      ).rows[0];
      assert.deepEqual(privileges, { cancel: false, export: false });
    }
  } finally {
    await db.close();
  }
});

test("Postgres: cancellation/export ordering is atomic across multiple orders and shipments", async () => {
  const db = await setup();
  try {
    const create = async () => {
      const key = crypto.randomUUID();
      await db.query("select submit_checkout($1,$2::jsonb)", [
        key,
        JSON.stringify(
          payload([
            delivery([{ productId: p1, quantity: 1 }]),
            delivery([{ productId: p2, quantity: 1 }]),
          ]),
        ),
      ]);
      const id = (
        await db.query<{ id: string }>(
          "select id from checkouts where request_id=$1",
          [key],
        )
      ).rows[0].id;
      await db.query("select change_checkout($1,'pay',$2,'card')", [id, staff]);
      const shipments = (
        await db.query<{ id: string }>(
          "select id from deliveries where checkout_id=$1 order by position",
          [id],
        )
      ).rows.map((d) => d.id);
      return { id, shipments };
    };
    const a = await create(),
      b = await create();
    // A file can be prepared from an earlier snapshot; commit must recheck the locked orders.
    const selected = [a.shipments[0], b.shipments[0]];
    const rows = await db.query<{ data: unknown[] }>(
      "select export_rows($1,$2) as data",
      [selected, staff],
    );
    assert.equal(rows.rows[0].data.length, 2);
    await db.query("select change_checkout($1,'cancel',$2)", [a.id, staff]);
    const failedBatch = crypto.randomUUID();
    await assert.rejects(
      db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
        failedBatch,
        selected,
        staff,
      ]),
      /출력 대상 상태/,
    );
    assert.equal(
      (await db.query("select * from export_batches")).rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from export_members")).rows.length,
      0,
    );
    assert.ok(
      (
        await db.query<{ status: string }>("select status from deliveries")
      ).rows.every((d) => d.status === "waiting"),
    );
    await assert.rejects(
      db.query("select mark_shipped($1,$2)", [a.shipments, staff]),
    );

    const batch = crypto.randomUUID();
    await db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
      batch,
      [b.shipments[0]],
      staff,
    ]);
    const before = (
      await db.query("select * from checkouts where id=$1", [b.id])
    ).rows;
    await assert.rejects(
      db.query("select change_checkout($1,'cancel',$2)", [b.id, staff]),
      /엑셀 출력된 배송지/,
    );
    assert.deepEqual(
      (await db.query("select * from checkouts where id=$1", [b.id])).rows,
      before,
    );
    assert.equal(
      (
        await db.query(
          "select * from stock_movements where checkout_id=$1 and reason='cancel'",
          [b.id],
        )
      ).rows.length,
      0,
    );
    assert.deepEqual(
      (
        await db.query(
          "select status from deliveries where checkout_id=$1 order by position",
          [b.id],
        )
      ).rows,
      [{ status: "exported" }, { status: "waiting" }],
    );
    await db.query("select commit_export($1,$2,'test.xlsx','file',$3)", [
      batch,
      [b.shipments[0]],
      staff,
    ]);
    assert.equal(
      (await db.query("select * from export_members")).rows.length,
      1,
    );
    await db.query("select mark_shipped($1,$2)", [[b.shipments[0]], staff]);
    await assert.rejects(
      db.query("select change_checkout($1,'cancel',$2)", [b.id, staff]),
      /엑셀 출력된 배송지/,
    );
    // An export history still blocks cancellation if a delivery status was manually reset.
    await db.query("update deliveries set status='waiting' where id=$1", [
      b.shipments[0],
    ]);
    await assert.rejects(
      db.query("select change_checkout($1,'cancel',$2)", [b.id, staff]),
      /엑셀 출력된 배송지/,
    );
  } finally {
    await db.close();
  }
});

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
      db.query<{ id: string }>(
        "select * from claim_notification_delivery('aligo',true,10)",
      );
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
      db.query("select * from claim_notification_delivery('aligo',true,1)"),
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
test("Postgres: exported cancellation blocked, export transaction, shipment retry and RLS", async () => {
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
    await assert.rejects(
      db.query("select change_checkout($1,'cancel',$2)", [c, staff]),
      /엑셀 출력된 배송지/,
    );
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

test("Postgres: shipping worklist has no page cap, keeps full order detail and excludes non-work", async () => {
  const db = await setup();
  try {
    await db.exec(`
      insert into checkouts(request_id,request_payload,category,sender,status)
      select gen_random_uuid(),'{}','product','{"name":"가상 발송인","phone":"01012345678"}',
        case when n=351 then 'pending' when n=352 then 'cancelled' else 'paid' end
      from generate_series(1,353) n;
      insert into deliveries(checkout_id,position,recipient,delivery_mode,requested_date,processing_date,discount_unit,status)
      select id,1,'{"name":"가상 수령인"}','scheduled','2026-10-09',
        '2026-10-03'::date+(order_number%6)::integer,0,
        case when order_number=353 then 'shipped' when order_number%2=0 then 'exported' else 'waiting' end
      from checkouts;
      insert into deliveries(checkout_id,position,recipient,delivery_mode,requested_date,processing_date,discount_unit,status)
      select id,2,'{"name":"발송된 다른 배송지"}','regular','2026-10-02','2026-10-01',0,'shipped'
      from checkouts where order_number=1;
    `);
    type Result = {
      count: number;
      orders: {
        order_number: number;
        deliveries: { id: string; status: string; processing_date: string }[];
        request_payload?: unknown;
      }[];
    };
    const result = (
      await db.query<{ result: Result }>(
        "select list_shipping_work($1) as result",
        [staff],
      )
    ).rows[0].result;
    assert.equal(result.count, 350);
    assert.equal(result.orders.length, 350);
    assert.equal(result.orders[0].deliveries.length, 2);
    assert.equal(result.orders[0].deliveries[1].status, "shipped");
    assert.equal(
      result.orders.some((c) => c.order_number > 350),
      false,
    );
    assert.equal(result.orders[0].request_payload, undefined);
    await assert.rejects(
      db.query("select list_shipping_work($1)", [crypto.randomUUID()]),
    );
    const ids = result.orders.flatMap((c) => c.deliveries.map((d) => d.id));
    const exported = (
      await db.query<{ result: { delivery: { processing_date: string } }[] }>(
        "select export_rows($1,$2) as result",
        [ids, staff],
      )
    ).rows[0].result;
    const dates = exported.map((r) => r.delivery.processing_date);
    assert.deepEqual(dates, [...dates].sort().reverse());
    await db.exec("set role authenticated");
    await assert.rejects(
      db.query("select list_shipping_work($1)", [staff]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
