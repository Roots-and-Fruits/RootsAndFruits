import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("fruit notices are shared by fruit, publicly readable and writable only by guarded staff RPC", async () => {
  const db = new PGlite();
  const actor = "00000000-0000-4000-8000-000000000001";
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select null::uuid$$; insert into auth.users values('${actor}');`,
    );
    for (const file of [
      "202609200001_catalog.sql",
      "202609260001_operations.sql",
      "202610190001_fruit_notices.sql",
    ])
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    await db.exec(
      `insert into private.staff values(1,'${actor}','owner','owner@example.test'); insert into products(category,fruit_type,weight_grams,price) values('product','감귤',3000,10000),('product','감귤',5000,15000),('product','한라봉',3000,20000);`,
    );
    const save = (
      fruit: string,
      notice: string,
      staff: string | null = actor,
    ) => db.query("select save_fruit_notice($1,$2,$3)", [fruit, notice, staff]);
    await assert.rejects(save("감귤", "권한 없음", null), /관리자 권한/);
    await assert.rejects(save("없는 과일", "안내"), /과일 목록/);
    await assert.rejects(save("감귤", "가".repeat(501)), /확인/);
    await save("감귤", "  보관 안내  ");
    await save("한라봉", "한라봉 안내");
    await save("감귤", "변경된 안내");
    assert.equal(
      (await db.query("select * from fruit_notices")).rows.length,
      2,
    );
    assert.equal(
      (
        await db.query(
          "select p.id from products p join fruit_notices n using(fruit_type) where n.notice='변경된 안내'",
        )
      ).rows.length,
      2,
    );
    await db.exec("set role anon");
    assert.equal(
      (await db.query("select * from fruit_notices")).rows.length,
      2,
    );
    await assert.rejects(
      db.query("insert into fruit_notices values('침입','안내')"),
      /permission denied/,
    );
    await assert.rejects(save("감귤", "침입"), /permission denied/);
    await db.exec("reset role; set role authenticated");
    await assert.rejects(save("감귤", "침입"), /permission denied/);
    await db.exec("reset role; set role service_role");
    await save("감귤", "  ");
    assert.deepEqual(
      (await db.query("select fruit_type from fruit_notices")).rows,
      [{ fruit_type: "한라봉" }],
    );
  } finally {
    await db.close();
  }
});
