import Fastify from "fastify";
import { expect, test } from "@playwright/test";
import { registerWeb } from "../server/web.ts";

for (const origin of [undefined, "https://retivvo.example"]) {
  test(`publicação web com ${origin ? "indexação habilitada" : "indexação protegida"}`, async ({
    browser,
  }) => {
    const app = Fastify();
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 320, height: 800 },
    });
    try {
      await registerWeb(app, origin);
      const url = await app.listen({ host: "127.0.0.1", port: 0 });
      const page = await context.newPage();
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Transforme propostas em novas oportunidades.",
      );
      await expect(
        page.getByRole("link", { name: "Criar conta" }),
      ).toBeInViewport();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(320);
      const html = await (await app.inject("/")).body;
      expect(html).not.toContain("<script");
      if (origin) {
        expect(html).toContain(`rel="canonical" href="${origin}/"`);
        expect(html).toContain(
          `content="${origin}/retivvo-compartilhamento.jpg"`,
        );
        const sitemap = await app.inject("/sitemap.xml");
        expect(sitemap.statusCode).toBe(200);
        expect(sitemap.body).toContain(`<loc>${origin}/</loc>`);
        expect(sitemap.body).not.toContain("/app");
      } else {
        expect(html).toContain("noindex, nofollow");
        expect((await app.inject("/robots.txt")).body).toContain("Disallow: /");
        expect((await app.inject("/sitemap.xml")).statusCode).toBe(404);
      }
      expect((await app.inject("/app/painel")).headers["x-robots-tag"]).toBe(
        "noindex, nofollow",
      );
      expect((await app.inject("/entrar")).headers["x-robots-tag"]).toBe(
        "noindex, nofollow",
      );
      for (const title of ["Política de privacidade", "Termos de uso"]) {
        await page.getByRole("link", { name: title }).click();
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          "content",
          "noindex, nofollow",
        );
        expect(
          (await app.inject(new URL(page.url()).pathname)).headers[
            "x-robots-tag"
          ],
        ).toContain("noindex");
        await page.getByRole("link", { name: "Retivvo", exact: true }).click();
      }
      expect(
        (await app.inject("/favicon.png")).headers["content-type"],
      ).toContain("image/png");
      expect(
        (await app.inject("/retivvo-compartilhamento.jpg")).headers[
          "content-type"
        ],
      ).toContain("image/jpeg");
      expect((await page.goto(url + "/rota-errada"))?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Página indisponível",
      );
      await page.getByRole("link", { name: "Ir para o início" }).click();
      await expect(
        page.getByRole("link", { name: "Criar conta" }),
      ).toBeVisible();
    } finally {
      await context.close();
      await app.close();
    }
  });
}
