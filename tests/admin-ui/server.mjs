// Isolated UI test server. Never imported by the app; all data is fictional.
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdtemp, symlink, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
const root = process.cwd(),
  db = new PGlite(),
  staff = "00000000-0000-4000-8000-000000000001";
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create table auth.identities(user_id uuid references auth.users(id),provider text);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users(id) values('${staff}');`,
);
for (const file of [
  "202609200001_catalog.sql",
  "202609260001_operations.sql",
  "202609260002_product_order.sql",
  "202609290001_customer_auth.sql",
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
await db.query(
  "insert into auth.users(id,email) values($1,'tablet-01@tablet.roots-and-fruits.invalid'),($2,null)",
  [tabletId, kakaoId],
);
await db.query(
  "insert into auth.identities(user_id,provider) values($1,'kakao')",
  [kakaoId],
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
function tokenFor(user) {
  return [
    { alg: "HS256", typ: "JWT" },
    {
      sub: user.id,
      role: "authenticated",
      aud: "authenticated",
      exp: fixtureExpiry,
    },
    "test-only",
  ]
    .map((x) =>
      Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString(
        "base64url",
      ),
    )
    .join(".");
}
function sessionFor(user) {
  return {
    access_token: tokenFor(user),
    refresh_token: `refresh-${user.id}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
}
const oauthCodes = new Map();
const publicKey = "test-publishable-key",
  serviceKey = "test-service-key";
function send(res, data, status = 200, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(data));
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const auth = req.headers.authorization?.slice(7);
  const user = users.find((u) => tokenFor(u) === auth);
  let body = {};
  try {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (raw) body = JSON.parse(raw);
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
    if (url.pathname === "/auth/v1/user")
      return user ? send(res, user) : send(res, { msg: "No session" }, 401);
    if (url.pathname === "/auth/v1/logout") return send(res, {});
    const rpc = url.pathname.startsWith("/rest/v1/rpc/")
      ? url.pathname.split("/").at(-1)
      : null;
    if (rpc) {
      if (rpc === "is_staff") return send(res, user?.id === staff);
      if (auth !== serviceKey)
        return send(res, { message: "forbidden", code: "42501" }, 403);
      const allowed = [
        "staff_email",
        "list_checkouts",
        "save_product",
        "reorder_products",
        "save_settings",
        "change_checkout",
        "submit_checkout",
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
        "delivery_settings",
        "shipping_settings",
        "checkouts",
        "export_batches",
      ].includes(table)
    )
      return send(res, {}, 404);
    if (
      auth !== serviceKey &&
      !["products", "delivery_settings"].includes(table)
    )
      return send(res, { message: "forbidden" }, 403);
    let data;
    if (table === "checkouts")
      data = (
        await db.query("select list_checkouts('{}',0,$1) as result", [staff])
      ).rows[0].result.orders;
    else if (table === "export_batches")
      data = (
        await db.query(
          `select to_jsonb(b)||jsonb_build_object('export_members',coalesce((select jsonb_agg(jsonb_build_object('delivery_id',m.delivery_id,'deliveries',jsonb_build_object('recipient',d.recipient,'status',d.status,'checkouts',jsonb_build_object('order_number',c.order_number)))) from export_members m join deliveries d on d.id=m.delivery_id join checkouts c on c.id=d.checkout_id where m.batch_id=b.id),'[]')) as row from export_batches b order by created_at desc`,
        )
      ).rows.map((r) => r.row);
    else
      data = (
        await db.query(
          `select * from ${table} order by ${table === "products" ? "sort_order,id" : "id"}`,
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
