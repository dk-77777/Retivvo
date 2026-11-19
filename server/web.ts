import type { FastifyInstance } from "fastify";
import staticFiles from "@fastify/static";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function registerWeb(app: FastifyInstance) {
  const directory = fileURLToPath(new URL("../dist/", import.meta.url));
  await access(directory + "index.html");
  await app.register(staticFiles, { root: directory, serve: false });
  await app.register(staticFiles, {
    root: directory + "assets",
    prefix: "/assets/",
    decorateReply: false,
    index: false,
  });
  for (const path of [
    "/",
    "/entrar",
    "/cadastro",
    "/recuperar",
    "/app",
    "/app/:page",
  ]) {
    app.get(path, (_req, reply) =>
      reply.sendFile("index.html", { cacheControl: false }),
    );
  }
}
