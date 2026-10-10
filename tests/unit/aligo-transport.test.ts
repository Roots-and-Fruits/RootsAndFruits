import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { getGlobalDispatcher } from "undici";
import {
  createAligoTransport,
  validFixieUrl,
} from "../../src/features/notifications/aligo-transport";

test("Fixie URLs require HTTP/S proxy credentials and never expose invalid values", () => {
  for (const value of [
    "",
    "secret",
    "socks5://user:pass@proxy.example",
    "http://proxy.example",
    "http://user:pass@proxy.example/?key=private",
    "http://user:%zz@proxy.example",
  ])
    assert.equal(validFixieUrl(value), false);
  assert.equal(validFixieUrl("http://user:p%40ss@proxy.example:80"), true);
  assert.equal(validFixieUrl("https://user:pass@proxy.example:443"), true);
  assert.throws(() => createAligoTransport("secret"), {
    message: "ALIGO_PROXY_INVALID",
  });
});

test("template and send requests use authenticated CONNECT without a global proxy or direct fallback", async () => {
  const connects: { host?: string; auth?: string }[] = [];
  const proxy = createServer();
  // This server never forwards traffic: no provider requests or messages are sent.
  proxy.on("connect", (request, socket) => {
    connects.push({
      host: request.url,
      auth: request.headers["proxy-authorization"],
    });
    socket.end(
      "HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
    );
  });
  proxy.listen(0, "127.0.0.1");
  await once(proxy, "listening");
  const address = proxy.address();
  assert.ok(address && typeof address !== "string");
  const globalDispatcher = getGlobalDispatcher();
  const transport = createAligoTransport(
    `http://fake-user:p%40ss@127.0.0.1:${address.port}`,
  );
  const options = () => ({
    method: "POST" as const,
    body: new URLSearchParams({ apikey: "fake-key" }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    redirect: "error" as const,
    cache: "no-store" as const,
    signal: AbortSignal.timeout(2000),
  });
  try {
    for (const path of ["template/list", "alimtalk/send"]) {
      await assert.rejects(
        transport.request(
          `https://kakaoapi.aligo.in/akv10/${path}/`,
          options(),
        ),
        { message: "ALIGO_CONNECTION_FAILED" },
      );
    }
    assert.deepEqual(
      connects,
      [0, 1].map(() => ({
        host: "kakaoapi.aligo.in:443",
        auth: `Basic ${Buffer.from("fake-user:p@ss").toString("base64")}`,
      })),
    );
    assert.equal(getGlobalDispatcher(), globalDispatcher);
    await assert.rejects(
      transport.request("https://unrelated.example/", options()),
      /ENDPOINT_INVALID/,
    );
    assert.equal(connects.length, 2);
  } finally {
    await transport.close();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});
