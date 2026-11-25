import type { FastifyInstance } from "fastify";
import staticFiles from "@fastify/static";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const appPages = [
  "/app",
  "/app/painel",
  "/app/clientes",
  "/app/propostas",
  "/app/acompanhamentos",
  "/app/relatorios",
  "/app/organizacoes",
  "/app/conta",
];
const privatePages = new Map([
  ["/entrar", "Entrar"],
  ["/cadastro", "Criar conta"],
  ["/recuperar", "Recuperar acesso"],
  ...appPages.map((path) => [path, "Área de trabalho"] as const),
]);
const description =
  "Organize propostas, acompanhe clientes e mantenha suas oportunidades comerciais em movimento.";
const blocked = "noindex, nofollow";
export async function registerWeb(
  app: FastifyInstance,
  canonicalOrigin?: string,
) {
  const published = canonicalOrigin && new URL(canonicalOrigin);
  if (
    published &&
    (published.protocol !== "https:" || published.origin !== canonicalOrigin)
  ) {
    throw new Error("A indexação exige uma origem HTTPS pública.");
  }
  const directory = fileURLToPath(new URL("../dist/", import.meta.url));
  const [appHtml, landingTemplate, notFound] = await Promise.all(
    ["index.html", "landing.html", "404.html"].map((file) =>
      readFile(directory + file, "utf8"),
    ),
  );
  const landing = landingTemplate.replace(
    "<!-- RETIVVO_PUBLIC_META -->",
    published
      ? `
    <link rel="canonical" href="${published.origin}/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Retivvo" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:url" content="${published.origin}/" />
    <meta property="og:title" content="Retivvo | Acompanhamento de propostas e orçamentos" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${published.origin}/retivvo-compartilhamento.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Retivvo. Transforme propostas em novas oportunidades." />
    <meta name="twitter:card" content="summary_large_image" />
  `
      : '<meta name="robots" content="noindex, nofollow" />',
  );
  await app.register(staticFiles, { root: directory, serve: false });
  await app.register(staticFiles, {
    root: directory + "assets",
    prefix: "/assets/",
    decorateReply: false,
    index: false,
  });
  app.get("/", (_req, reply) => {
    if (!published) reply.header("X-Robots-Tag", blocked);
    return reply.type("text/html; charset=utf-8").send(landing);
  });
  for (const [path, title] of privatePages) {
    const html = appHtml.replace(
      "<title>Retivvo</title>",
      `<title>${title} | Retivvo</title>`,
    );
    app.get(path, (_req, reply) =>
      reply
        .header("X-Robots-Tag", blocked)
        .type("text/html; charset=utf-8")
        .send(html),
    );
  }
  for (const page of ["privacidade", "termos"]) {
    app.get("/" + page, (_req, reply) =>
      reply
        .header("X-Robots-Tag", blocked)
        .sendFile(page + ".html", { cacheControl: false }),
    );
  }
  for (const file of ["favicon.png", "retivvo-compartilhamento.jpg"]) {
    app.get("/" + file, (_req, reply) =>
      reply.sendFile(file, { cacheControl: false }),
    );
  }
  app.get("/robots.txt", (_req, reply) =>
    reply
      .type("text/plain; charset=utf-8")
      .send(
        published
          ? `User-agent: *\nAllow: /\nSitemap: ${published.origin}/sitemap.xml\n`
          : "User-agent: *\nDisallow: /\n",
      ),
  );
  if (published) {
    app.get("/sitemap.xml", (_req, reply) =>
      reply
        .type("application/xml; charset=utf-8")
        .send(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${published.origin}/</loc></url></urlset>`,
        ),
    );
  }
  app.setNotFoundHandler((req, reply) => {
    const html =
      req.headers.accept?.includes("text/html") &&
      !/^\/(api|assets)(\/|\?|$)/.test(req.url);
    reply.header("X-Robots-Tag", blocked).code(404);
    return html
      ? reply.type("text/html; charset=utf-8").send(notFound)
      : reply.send({ error: "Rota inexistente." });
  });
}
