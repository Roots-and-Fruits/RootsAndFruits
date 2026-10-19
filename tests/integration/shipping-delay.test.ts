import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const actor = "00000000-0000-4000-8000-000000000001";
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create table auth.identities(user_id uuid references auth.users(id),provider text);create function auth.uid() returns uuid language sql as $$select null::uuid$$;insert into auth.users(id) values('${actor}');`,
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
    "202610110002_customer_account.sql",
    "202610110003_notification_recipient_phone.sql",
    "202610190002_shipping_delay_notifications.sql",
  ])
    await db.exec(await readFile(`supabase/migrations/${f}`, "utf8"));
  await db.exec(
    `insert into private.staff values(1,'${actor}','owner','owner@example.test');`,
  );
  const ids: string[] = [];
  for (const phone of ["01012345678", "01012345678", "01099998888"]) {
    const c = (
      await db.query<{ id: string }>(
        `insert into checkouts(request_id,request_payload,category,sender,status) values(gen_random_uuid(),'{}','product',jsonb_build_object('name','보내는 분','phone',$1::text),'paid') returning id`,
        [phone],
      )
    ).rows[0].id;
    ids.push(
      (
        await db.query<{ id: string }>(
          `insert into deliveries(checkout_id,position,recipient,delivery_mode,requested_date,processing_date,status,discount_unit) values($1,1,'{"name":"받는 분","phone":"01000000000"}','regular',current_date,current_date,$2,0) returning id`,
          [c, ids.length === 1 ? "exported" : "waiting"],
        )
      ).rows[0].id,
    );
  }
  await db.exec(
    `update notification_settings set enabled=true,provider='aligo',test_mode=true`,
  );
  return { db, ids };
}

test("delay: recipient dedup, history review, replay, stale selection, authorization and send-time eligibility", async () => {
  const { db, ids } = await setup();
  const preview = async (selected = ids) =>
    (
      await db.query<{
        value: {
          recipients: {
            phone: string;
            latestId: string | null;
            historyCount: number;
          }[];
        };
      }>("select preview_shipping_delay($1,$2) value", [selected, actor])
    ).rows[0].value;
  const expected = async (selected = ids) =>
    (await preview(selected)).recipients.map(({ phone, latestId }) => ({
      phone,
      latestId,
    }));
  const queue = (
    id: string,
    selected: string[],
    history: unknown,
    user: string | null = actor,
  ) =>
    db.query("select queue_shipping_delay($1,$2,$3,true,$4)", [
      id,
      selected,
      JSON.stringify(history),
      user,
    ]);
  try {
    assert.equal((await preview()).recipients.length, 2);
    const history = await expected();
    const request = crypto.randomUUID();
    await assert.rejects(queue(request, ids, history, null), /관리자 권한/);
    await db.exec("set role anon");
    await assert.rejects(queue(request, ids, history), /permission denied/);
    await db.exec("reset role");
    await queue(request, ids, history);
    await queue(request, [...ids].reverse(), history);
    assert.equal(
      (
        await db.query(
          "select * from order_notifications where event='delayed'",
        )
      ).rows.length,
      2,
    );
    await assert.rejects(queue(request, [ids[0]], history), /대상이 다릅니다/);
    await assert.rejects(
      queue(crypto.randomUUID(), ids, history),
      /이력이 변경/,
    );
    await queue(crypto.randomUUID(), ids, await expected());
    assert.equal(
      (
        await db.query(
          "select * from order_notifications where event='delayed'",
        )
      ).rows.length,
      4,
    );
    assert.equal((await preview()).recipients[0].historyCount, 2);
    await assert.rejects(preview([ids[0], ids[0]]), /선택/);
    await db.exec("set role authenticated");
    await assert.rejects(preview(), /permission denied/);
    await db.exec("reset role");
    const claimed = (
      await db.query<{ id: string; attempts: number; phone: string }>(
        "select * from claim_shipping_delay($1,'aligo',true,3)",
        [request],
      )
    ).rows;
    assert.equal(claimed.length, 2);
    const first = claimed.find((n) => n.phone === "01012345678")!;
    // Cancelling the representative checkout must not suppress other selected active deliveries for the same phone.
    await db.query(
      "update checkouts set status='cancelled' where id=(select checkout_id from order_notifications where id=$1)",
      [first.id],
    );
    const prep = async (id: string, attempt: number) =>
      (
        await db.query<{ ok: boolean }>(
          "select prepare_order_notification($1,$2,'aligo',true,$3) ok",
          [id, attempt, JSON.stringify({ text: "지연 안내" })],
        )
      ).rows[0].ok;
    assert.equal(await prep(first.id, first.attempts), true);
    await db.exec("update checkouts set status='cancelled'");
    assert.equal(await prep(first.id, first.attempts), false);
    await assert.rejects(
      queue(crypto.randomUUID(), ids, history),
      /대상이 변경/,
    );
  } finally {
    await db.close();
  }
});
