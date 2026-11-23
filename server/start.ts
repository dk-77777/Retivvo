import { registerWeb } from "./web.ts";
import { buildApp } from "./app.ts";
import { getResources } from "./config.ts";

const resources = getResources(process.env);
const app = await buildApp({
  ...resources,
  logOperations: process.env.NODE_ENV === "production",
  trustLoopbackProxy: process.env.TRUST_LOOPBACK_PROXY === "1",
});
await registerWeb(
  app,
  process.env.NODE_ENV === "production" && process.env.SEO_INDEXABLE === "1"
    ? resources.origin
    : undefined,
);
app.addHook("onClose", async () => {
  await Promise.all([resources.authDb.end(), resources.appDb.end()]);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    void app.close();
  });
const url = await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
});
console.log("API Retivvo em " + url);
