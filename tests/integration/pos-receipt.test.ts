import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("POS receipts preserve payment, use Seoul payment day, warn duplicates and prevent stale edits", async () => {
  const db = new PGlite();
  const actor = "00000000-0000-4000-8000-000000000001";
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select null::uuid$$; insert into auth.users values('${actor}');`,
    );
    for (const file of [
      "202609200001_catalog.sql",
      "202609260001_operations.sql",
      "202610160001_pos_receipt.sql",
    ])
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    await db.exec(
      `insert into private.staff values(1,'${actor}','owner','owner@example.test');`,
    );
    const ids: string[] = [];
    for (const paid of [
      "2026-10-15T16:00:00Z",
      "2026-10-16T01:00:00Z",
      "2026-10-16T16:00:00Z",
    ]) {
      const r = await db.query<{ id: string }>(
        `insert into checkouts(request_id,request_payload,category,sender,status,paid_at) values(gen_random_uuid(),'{}','product','{}','paid',$1) returning id`,
        [paid],
      );
      ids.push(r.rows[0].id);
    }
    async function call(
      id: string,
      number: number | null = null,
      expected: number | null = null,
      allow = false,
      staff = actor,
    ) {
      const r = await db.query<{
        result: {
          date: string;
          number: number | null;
          saved?: boolean;
          duplicates?: number[];
        };
      }>("select manage_pos_receipt($1,$2,$3,$4,$5) result", [
        id,
        staff,
        number,
        expected,
        allow,
      ]);
      return r.rows[0].result;
    }
    assert.deepEqual(await call(ids[0]), { date: "2026-10-16", number: null });
    assert.equal((await call(ids[0], 26)).saved, true);
    assert.equal((await call(ids[0], 26)).saved, true);
    assert.equal((await call(ids[1], 26)).saved, false);
    assert.equal((await call(ids[1])).number, null);
    assert.equal((await call(ids[1], 26, null, true)).saved, true);
    assert.equal((await call(ids[2], 26)).saved, true);
    await assert.rejects(call(ids[0], 27, null), /다른 관리자/);
    assert.equal((await call(ids[0], 27, 26)).saved, true);
    await assert.rejects(call(ids[0], 0, 27), /1 이상/);
    await assert.rejects(
      call(ids[0], null, null, false, "00000000-0000-4000-8000-000000000099"),
      /관리자 권한/,
    );
    const row = await db.query<{ status: string; paid: string }>(
      "select status,paid_at::text paid from checkouts where id=$1",
      [ids[0]],
    );
    assert.equal(row.rows[0].status, "paid");
    assert.equal(
      new Date(row.rows[0].paid).toISOString(),
      "2026-10-15T16:00:00.000Z",
    );
    await db.exec(`set role authenticated`);
    await assert.rejects(
      db.query("select * from pos_receipts"),
      /permission denied/,
    );
    await assert.rejects(call(ids[0]), /permission denied/);
  } finally {
    await db.close();
  }
});
