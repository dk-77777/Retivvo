import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { localConfig } from "../scripts/prepare.mjs";

const env = {
  ...process.env,
  ...(await localConfig()),
  NODE_ENV: "development",
  PORT: "0",
};
const child = spawn(process.execPath, ["server/start.ts"], {
  env,
  stdio: ["ignore", "pipe", "inherit"],
});
const exit = once(child, "exit");
const lines = createInterface({ input: child.stdout });
const startup = awaitableAddress();
try {
  const origin = await startup;
  const request = (route, options = {}) =>
    fetch(origin + route, {
      signal: AbortSignal.timeout(5000),
      ...options,
    });
  for (const path of ["/api/live", "/api/health"]) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  }
  const home = await request("/");
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /Transforme propostas em novas oportunidades/);
  const css = html.match(/href="(\/assets\/[^"]+\.css)"/)?.[1];
  assert.ok(css);
  const stylesheet = await request(css);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get("content-type"), /text\/css/);
  await stylesheet.arrayBuffer();
  const session = await request("/app");
  assert.match(session.headers.get("x-robots-tag"), /noindex/);
  assert.match(
    session.headers.get("content-security-policy"),
    /frame-ancestors 'self'/,
  );
  await session.text();
  const privateApi = await request("/api/organizations");
  assert.equal(privateApi.status, 401);
  await privateApi.text();
} finally {
  lines.close();
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGTERM");
  const shutdown = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    assert.deepEqual(
      await exit,
      [0, null],
      "O processo deve encerrar normalmente com SIGTERM",
    );
  } finally {
    clearTimeout(shutdown);
  }
}
console.log(
  "Ensaio aprovado: entrada real, build web, sondas, autenticação e encerramento.",
);

function awaitableAddress() {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(
      () => reject(new Error("Prazo de início excedido")),
      12000,
    );
    lines.on("line", (line) => {
      const origin = line.match(
        /^API Retivvo em (http:\/\/127\.0\.0\.1:\d+)$/,
      )?.[1];
      if (origin) {
        clearTimeout(deadline);
        resolve(origin);
      }
    });
    exit.then(() => {
      clearTimeout(deadline);
      reject(new Error("O processo encerrou antes de responder"));
    }, reject);
  });
}
