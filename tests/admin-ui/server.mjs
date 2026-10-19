// Isolated UI test server. Never imported by the app; all data is fictional.
import { createServer } from "node:http";
import { createHash, randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { cp, mkdtemp, symlink, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
const root = process.cwd(),
  db = new PGlite(),
  staff = "00000000-0000-4000-8000-000000000001";
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create table auth.identities(user_id uuid references auth.users(id) on delete cascade,provider text);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users(id) values('${staff}');`,
);
for (const file of [
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
  "202610110004_customer_deletion.sql",
  "202610160001_pos_receipt.sql",
  "202610190001_fruit_notices.sql",
  "202610160002_shipping_tracking_notification.sql",
  "202610190002_shipping_delay_notifications.sql",
  "202610200001_shipping_recipient_notifications.sql",
])
  await db.exec(
    await readFile(join(root, "supabase/migrations", file), "utf8"),
  );
await db.query(
  "select provision_staff(1::smallint,$1,'owner','owner@example.test')",
  [staff],
);
await db.exec(
  `insert into products(id,category,fruit_type,weight_grams,description,price,is_active,inventory_enabled,stock_quantity,bundle_eligible) values('10000000-0000-4000-8000-000000000001','product','감귤',3000,'테스트 상품',30000,true,true,50,true),('10000000-0000-4000-8000-000000000002','product','한라봉',3000,'테스트 선물',40000,true,false,null,true);update delivery_settings set bundle_discount=3000;update shipping_settings set postal_code='00000',address='테스트 발송지';`,
);
const tabletId = "00000000-0000-4000-8000-000000000002";
const kakaoId = "00000000-0000-4000-8000-000000000003";
const secondKakaoId = "00000000-0000-4000-8000-000000000004";
await db.query(
  "insert into auth.users(id,email) values($1,'tablet-01@tablet.roots-and-fruits.invalid'),($2,null),($3,null)",
  [tabletId, kakaoId, secondKakaoId],
);
await db.query(
  "insert into auth.identities(user_id,provider) values($1,'kakao'),($2,'kakao')",
  [kakaoId, secondKakaoId],
);
await db.query(
  "select provision_tablet($1,'tablet-01','tablet-01@tablet.roots-and-fruits.invalid')",
  [tabletId],
);
const users = [
  { id: staff, email: "owner@example.test", provider: "email" },
  {
    id: tabletId,
    email: "tablet-01@tablet.roots-and-fruits.invalid",
    provider: "email",
  },
  { id: kakaoId, provider: "kakao" },
  { id: secondKakaoId, provider: "kakao" },
].map((u) => ({
  ...u,
  aud: "authenticated",
  role: "authenticated",
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  app_metadata: { provider: u.provider },
  user_metadata: {},
}));
const fixtureExpiry = Math.floor(Date.now() / 1000) + 3600;
const { privateKey: signingKey, publicKey: verificationKey } =
  generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = {
  ...verificationKey.export({ format: "jwk" }),
  kid: "isolated-test",
  alg: "ES256",
  use: "sig",
};
const issuedTokens = new Map(),
  defaultTokens = new Map(),
  authReads = new Map();
function issueToken(user, exp = fixtureExpiry, mode = "normal") {
  const header =
    mode === "legacy"
      ? { alg: "HS256", typ: "JWT" }
      : { alg: "ES256", typ: "JWT", kid: jwk.kid };
  const payload = {
    sub: user.id,
    role: "authenticated",
    aud: "authenticated",
    exp,
    jti: randomUUID(),
  };
  const input = [header, payload]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".");
  const signature =
    mode === "legacy"
      ? Buffer.from("test-only")
      : sign("sha256", Buffer.from(input), {
          key: signingKey,
          dsaEncoding: "ieee-p1363",
        });
  const token = `${input}.${signature.toString("base64url")}`;
  issuedTokens.set(token, { user, exp, mode });
  return token;
}
function tokenFor(user) {
  if (!defaultTokens.has(user.id)) defaultTokens.set(user.id, issueToken(user));
  return defaultTokens.get(user.id);
}
function sessionFor(user, mode = "normal") {
  const exp =
    mode === "expired" ? Math.floor(Date.now() / 1000) - 120 : fixtureExpiry;
  return {
    access_token:
      mode === "normal" ? tokenFor(user) : issueToken(user, exp, mode),
    refresh_token: `refresh-${user.id}`,
    expires_in: 3600,
    expires_at: exp,
    token_type: "bearer",
    user,
  };
}
const oauthCodes = new Map();
const deletedUsers = new Set();
const unlinked = new Set();
const deletionFailures = new Set();
const publicKey = "test-publishable-key",
  serviceKey = "test-service-key";
function send(res, data, status = 200, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const auth = req.headers.authorization?.slice(7);
  const issued = issuedTokens.get(auth);
  const user =
    issued &&
    issued.exp > Date.now() / 1000 &&
    issued.mode !== "revoked" &&
    !deletedUsers.has(issued.user.id)
      ? issued.user
      : undefined;
  let body = {};
  try {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (raw) body = JSON.parse(raw);
    // Local test fixtures only; this server never loads real Supabase settings.
    if (url.pathname === "/__test/customer-deletion-fixture") {
      const id = randomUUID(),
        providerId = String(100000 + users.length);
      const fixture = {
        ...users[2],
        id,
        identities: [
          {
            id: providerId,
            provider: "kakao",
            identity_data: { sub: providerId },
          },
        ],
      };
      users.push(fixture);
      await db.query("insert into auth.users(id) values($1)", [id]);
      await db.query("insert into auth.identities values($1,'kakao')", [id]);
      if (body.failDeleteOnce) deletionFailures.add(id);
      return send(res, sessionFor(fixture));
    }
    if (url.pathname === "/__test/kakao-unlink") {
      if (body.authorization !== "KakaoAK isolated-kakao-key")
        return send(res, { code: -401 }, 401);
      if (unlinked.has(body.id)) return send(res, { code: -101 }, 400);
      unlinked.add(body.id);
      return send(res, { id: Number(body.id) });
    }
    if (url.pathname.startsWith("/auth/v1/admin/users/")) {
      if (auth !== serviceKey) return send(res, {}, 403);
      const id = url.pathname.split("/").at(-1);
      const target = users.find((u) => u.id === id && !deletedUsers.has(id));
      if (!target) return send(res, { msg: "missing user" }, 404);
      if (req.method === "DELETE") {
        if (deletionFailures.delete(id))
          return send(res, { msg: "temporary test failure" }, 500);
        await db.query("delete from auth.users where id=$1", [id]);
        deletedUsers.add(id);
      }
      return send(res, { user: target });
    }
    if (
      url.pathname === "/__test/delay-enable" &&
      process.env.ADMIN_UI_DELAY_TEST === "true"
    ) {
      await db.exec(
        "update notification_settings set enabled=true,provider='aligo',test_mode=true",
      );
      return send(res, { ok: true });
    }
    if (url.pathname === "/__test/shipping-fixture" && req.method === "POST") {
      // Isolated PGlite only. No production credentials are loaded by this server.
      const count = body.count ?? 120;
      if (!Number.isInteger(count) || count < 1 || count > 1100)
        return send(res, {}, 400);
      await db.exec(`delete from order_notifications; delete from export_members; delete from order_items;
        delete from stock_movements where checkout_id is not null; delete from deliveries;
        delete from checkouts; delete from export_batches;`);
      const dates = (
        await db.query(
          "select (now() at time zone 'Asia/Seoul')::date::text as today",
        )
      ).rows[0];
      const baseNumber = (
        await db.query("select last_value from checkout_number_seq")
      ).rows[0].last_value;
      await db.query(
        `
        insert into checkouts(request_id,request_payload,category,sender,status)
        select gen_random_uuid(),jsonb_build_object('fixture',n),'product',
          '{"name":"발송 테스트","phone":"01012345678"}',
          case when n=$1+1 then 'pending' when n=$1+2 then 'cancelled' else 'paid' end
        from generate_series(1,$1+5) n`,
        [count],
      );
      await db.query(
        `
        insert into deliveries(checkout_id,position,recipient,delivery_mode,requested_date,processing_date,discount_unit,status)
        select id,1,jsonb_build_object('name','발송수령인'||(request_payload->>'fixture'),
          'phone','01012345678','postalCode','00000','address','가상 주소','addressDetail','테스트'),
          'scheduled',$2::date+5,
          $2::date + case when (request_payload->>'fixture')::int=$1+4 then 3
            when (request_payload->>'fixture')::int=$1+5 then 1
            else case (request_payload->>'fixture')::int%4 when 0 then -2 when 1 then 0 when 2 then 1 else 3 end end,
          0,case when (request_payload->>'fixture')::int=$1+3 then 'shipped' else 'waiting' end
        from checkouts`,
        [count, dates.today],
      );
      await db.exec(`insert into deliveries(checkout_id,position,recipient,delivery_mode,requested_date,processing_date,discount_unit,status)
        select id,2,'{"name":"발송된 다른 배송지","phone":"01012345678","postalCode":"00000","address":"가상 주소","addressDetail":""}',
          'regular','2026-01-02','2026-01-01',0,'shipped' from checkouts where request_payload->>'fixture'='1';
        insert into order_items(delivery_id,product_id,label,weight_grams,unit_price,quantity,bundle_eligible,inventory_deducted)
        select id,'10000000-0000-4000-8000-000000000002','가상 상품',3000,10000,1,false,false from deliveries;`);
      const ids = (
        await db.query(
          `select d.id from deliveries d join checkouts c on c.id=d.checkout_id
        where (c.request_payload->>'fixture')::int in ($1+4,$1+5)`,
          [count],
        )
      ).rows.map((r) => r.id);
      const batch = randomUUID();
      await db.query(
        "select commit_export($1,$2,'테스트_출력.xlsx','dGVzdA==',$3)",
        [batch, ids, staff],
      );
      return send(res, {
        today: dates.today,
        baseNumber,
        batch,
        ...(await db.query("select list_shipping_work($1) as result", [staff]))
          .rows[0].result,
      });
    }
    if (url.pathname === "/__test/auth-session")
      return send(
        res,
        sessionFor(
          users[Number(url.searchParams.get("user") || "0")],
          url.searchParams.get("mode") || "normal",
        ),
      );
    if (url.pathname === "/__test/auth-reads")
      return send(res, { count: authReads.get(auth) || 0 });
    if (url.pathname === "/auth/v1/.well-known/jwks.json")
      return send(res, { keys: [jwk] });
    if (url.pathname === "/auth/v1/authorize") {
      const redirect = new URL(url.searchParams.get("redirect_to"));
      if (
        redirect.origin !== "http://127.0.0.1:3110" ||
        redirect.pathname !== "/auth/callback" ||
        url.searchParams.get("provider") !== "kakao"
      )
        return send(res, {}, 400);
      const code = randomUUID();
      oauthCodes.set(code, url.searchParams.get("code_challenge"));
      redirect.searchParams.set("code", code);
      res.writeHead(302, { Location: redirect.toString() });
      return res.end();
    }
    if (url.pathname === "/auth/v1/token") {
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const refreshed = users.find(
          (u) => body.refresh_token === `refresh-${u.id}`,
        );
        return refreshed
          ? send(res, sessionFor(refreshed))
          : send(res, { msg: "Invalid refresh token" }, 400);
      }
      if (url.searchParams.get("grant_type") === "pkce") {
        const challenge = oauthCodes.get(body.auth_code);
        if (
          !challenge ||
          createHash("sha256")
            .update(body.code_verifier || "")
            .digest("base64url") !== challenge
        )
          return send(res, { msg: "Invalid code" }, 400);
        oauthCodes.delete(body.auth_code);
        return send(res, sessionFor(users[2]));
      }
      const matched = users.find((u) => u.email === body.email);
      return matched && body.password === "test-password-123"
        ? send(res, sessionFor(matched))
        : send(res, { msg: "Invalid credentials" }, 400);
    }
    if (url.pathname === "/auth/v1/user") {
      authReads.set(auth, (authReads.get(auth) || 0) + 1);
      return user ? send(res, user) : send(res, { msg: "No session" }, 401);
    }
    if (url.pathname === "/auth/v1/logout") return send(res, {});
    const rpc = url.pathname.startsWith("/rest/v1/rpc/")
      ? url.pathname.split("/").at(-1)
      : null;
    if (rpc) {
      if (rpc === "is_staff")
        return send(res, user?.id === staff && issued?.mode !== "role-removed");
      if (auth !== serviceKey)
        return send(res, { message: "forbidden", code: "42501" }, 403);
      const allowed = [
        "staff_email",
        "customer_preferences",
        "customer_deletion_ready",
        "save_customer_sender",
        "save_customer_address",
        "delete_customer_address",
        "list_customer_orders",
        "get_customer_order",
        "list_checkouts",
        "list_shipping_work",
        "preview_delivery_tracking",
        "save_delivery_tracking",
        "save_product",
        "save_fruit_notice",
        "preview_shipping_delay",
        "queue_shipping_delay",
        "claim_shipping_delay",
        "prepare_order_notification",
        "reorder_products",
        "save_settings",
        "change_checkout",
        "submit_checkout",
        "submit_reorder_checkout",
        "submit_customer_checkout",
        "account_kind",
        "tablet_email",
        "save_note",
        "commit_export",
        "mark_shipped",
        "staff_directory",
        "export_rows",
      ];
      if (!allowed.includes(rpc)) return send(res, {}, 404);
      if (rpc === "staff_directory")
        return send(
          res,
          (await db.query("select * from staff_directory()")).rows,
        );
      const keys = Object.keys(body);
      const expressions = keys.map((k, i) => `${k} => $${i + 1}`);
      if (rpc === "claim_shipping_delay") {
        const claimed = await db.query(
          `select to_jsonb(n) as result from ${rpc}(${expressions.join(",")}) n`,
          Object.values(body),
        );
        return send(
          res,
          claimed.rows.map((r) => r.result),
        );
      }
      const rows = await db.query(
        `select ${rpc}(${expressions.join(",")}) as result`,
        Object.values(body),
      );
      return send(
        res,
        rpc === "staff_directory"
          ? rows.rows.map((r) => r.result)
          : (rows.rows[0]?.result ?? null),
      );
    }
    const table = url.pathname.split("/").at(-1);
    if (
      ![
        "products",
        "fruit_notices",
        "shipping_delay_requests",
        "delivery_settings",
        "shipping_settings",
        "checkouts",
        "export_batches",
        "notification_settings",
        "order_notifications",
      ].includes(table)
    )
      return send(res, {}, 404);
    if (
      auth !== serviceKey &&
      !["products", "delivery_settings", "fruit_notices"].includes(table)
    )
      return send(res, { message: "forbidden" }, 403);
    if (
      req.method === "PATCH" &&
      table === "order_notifications" &&
      auth === serviceKey
    ) {
      const allowed = [
        "status",
        "error_code",
        "updated_at",
        "provider_id",
        "provider_code",
      ];
      const entries = Object.entries(body).filter(([key]) =>
        allowed.includes(key),
      );
      const filters = [...url.searchParams].filter(
        ([key, value]) =>
          ["id", "status", "attempts", "updated_at"].includes(key) &&
          (value.startsWith("eq.") || value.startsWith("lt.")),
      );
      const values = [
        ...entries.map(([, value]) => value),
        ...filters.map(([, value]) => value.slice(3)),
      ];
      await db.query(
        `update order_notifications set ${entries.map(([key], i) => `${key}=$${i + 1}`).join(",")} where ${filters.map(([key, value], i) => `${key}${value.startsWith("lt.") ? "<" : "="}$${entries.length + i + 1}`).join(" and ")}`,
        values,
      );
      return send(res, null);
    }
    let data;
    if (table === "checkouts")
      data = (
        await db.query("select list_checkouts('{}',0,$1) as result", [staff])
      ).rows[0].result.orders;
    else if (table === "export_batches")
      data = (
        await db.query(
          `select to_jsonb(b)||jsonb_build_object('export_members',coalesce((select jsonb_agg(jsonb_build_object('delivery_id',m.delivery_id,'deliveries',jsonb_build_object('recipient',d.recipient,'status',d.status,'processing_date',d.processing_date,'checkouts',jsonb_build_object('order_number',c.order_number)))) from export_members m join deliveries d on d.id=m.delivery_id join checkouts c on c.id=d.checkout_id where m.batch_id=b.id),'[]')) as row from export_batches b order by created_at desc`,
        )
      ).rows.map((r) => r.row);
    else
      data = (
        await db.query(
          `select * from ${table} order by ${table === "products" ? "sort_order,id" : table === "fruit_notices" ? "fruit_type" : "id"}`,
        )
      ).rows;
    for (const [field, value] of url.searchParams) {
      if (field.includes(".")) continue;
      if (value.startsWith("eq."))
        data = data.filter((d) => String(d[field]) === value.slice(3));
    }
    const selected = url.searchParams.get("deliveries.id");
    if (selected?.startsWith("in.")) {
      const ids = selected.slice(4, -1).split(",");
      data = data
        .map((c) => ({
          ...c,
          deliveries: c.deliveries.filter((d) => ids.includes(d.id)),
        }))
        .filter((c) => c.deliveries.length);
    }
    if (auth !== serviceKey && table === "products")
      data = data.filter((p) => p.is_active && !p.is_deleted);
    const count = data.length;
    const accept = req.headers.accept || "";
    if (accept.includes("application/vnd.pgrst.object"))
      return data.length === 1
        ? send(res, data[0])
        : send(
            res,
            {
              code: "PGRST116",
              details: `The result contains ${count} rows`,
              message: "JSON object requested",
            },
            406,
          );
    if (req.method === "HEAD") {
      res.writeHead(200, {
        "Content-Range": `0-${Math.max(0, count - 1)}/${count}`,
      });
      return res.end();
    }
    return send(res, data, 200, {
      "Content-Range": `0-${Math.max(0, count - 1)}/${count}`,
    });
  } catch (error) {
    send(res, { message: error.message, code: error.code || "P0001" }, 400);
  }
});
await new Promise((resolve) => server.listen(3111, "127.0.0.1", resolve));
const dir = await mkdtemp(join(tmpdir(), "roots-and-fruits-admin-ui-"));
for (const name of [
  "src",
  "public",
  "package.json",
  "tsconfig.json",
  "postcss.config.mjs",
  "next-env.d.ts",
])
  await cp(join(root, name), join(dir, name), { recursive: true });
await symlink(join(root, "node_modules"), join(dir, "node_modules"));
await writeFile(
  join(dir, "next.config.ts"),
  "export default {devIndicators:false};\n",
);
// Intercept Kakao only inside this isolated child process; no real request or key.
const mockFetch = join(dir, "mock-kakao.cjs");
await writeFile(
  mockFetch,
  `
if (process.env.ADMIN_UI_DELAY_TEST === "true") {
  const { MockAgent, setGlobalDispatcher } = require("undici");
  const mock = new MockAgent();
  mock.disableNetConnect();
  mock.enableNetConnect(host => host.startsWith("127.0.0.1:") || host.startsWith("localhost:"));
  const pool = mock.get("https://kakaoapi.aligo.in");
  pool.intercept({ path: "/akv10/template/list/", method: "POST" }).reply(200, { code: 0, list: ["UM_0746","UM_0737","UM_3439","UM_6360"].map(templtCode => ({templtCode,templtName:"가상 지연 안내",templtContent:"기상악화로 수확 및 발송이 지연됩니다.",templateEmType:"NONE",status:"A",inspStatus:"APR"})) }).persist();
  pool.intercept({ path: "/akv10/alimtalk/send/", method: "POST" }).reply(200, { code: 0, info: { mid: "123", scnt: 1, fcnt: 0 } }).persist();
  setGlobalDispatcher(mock);
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) === "https://kapi.kakao.com/v1/user/unlink") {
    const form = new URLSearchParams(String(init.body));
    return realFetch("http://127.0.0.1:3111/__test/kakao-unlink", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: form.get("target_id"), authorization: new Headers(init.headers).get("authorization") })
    });
  }
  return realFetch(url, init);
};
`,
);
const next = spawn(
  process.execPath,
  [
    resolve("node_modules/next/dist/bin/next"),
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3110",
  ],
  {
    cwd: dir,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3111",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publicKey,
      SUPABASE_SECRET_KEY: serviceKey,
      SUPABASE_SERVICE_ROLE_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
      ENABLE_ORDER_PREVIEW: "true",
      ALIGO_ENABLED:
        process.env.ADMIN_UI_DELAY_TEST === "true" ? "true" : "false",
      ...(process.env.ADMIN_UI_DELAY_TEST === "true"
        ? {
            ADMIN_UI_DELAY_TEST: "true",
            ALIGO_API_KEY: "isolated-fake",
            ALIGO_USER_ID: "isolated-fake",
            ALIGO_SENDER_KEY: "isolated-fake",
            ALIGO_SENDER_NUMBER: "01011112222",
            ALIGO_TEST_MODE: "true",
            FIXIE_URL: "",
          }
        : {}),
      KAKAO_ADMIN_KEY: "isolated-kakao-key",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require=${mockFetch}`,
    },
    stdio: "inherit",
  },
);
function stop() {
  next.kill("SIGTERM");
  server.close();
  db.close().finally(() => process.exit());
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
next.on("exit", () => server.close());
