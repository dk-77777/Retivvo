import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { buildApp } from "../server/app.ts";
import { getResources } from "../server/config.ts";
import { registerWeb } from "../server/web.ts";
import { bootstrap, localConfig, prepare } from "../scripts/prepare.mjs";
import { mailedUrl, totp } from "./local-mail.ts";

const port = Number(process.env.RETIVVO_TEST_PORT ?? 3337);
const origin = "http://127.0.0.1:" + port;
const suffix = randomBytes(8).toString("hex");
const dbName = "retivvo_test_" + suffix;
let cleanup: (() => Promise<unknown>)[] = [];

test.beforeAll(async () => {
  const config = await localConfig();
  const admin = await bootstrap("postgres");
  await admin.connect();
  cleanup.push(() => admin.end());
  await admin.query("CREATE DATABASE " + dbName);
  cleanup.push(() => admin.query("DROP DATABASE " + dbName));
  await prepare(dbName, config);
  const resources = getResources({
    ...config,
    PGHOST: "127.0.0.1",
    PGPORT: "5432",
    PGDATABASE: dbName,
    APP_ORIGIN: origin,
    SMTP_URL: "smtp://127.0.0.1:1025",
  });
  cleanup.push(() =>
    Promise.all([resources.appDb.end(), resources.authDb.end()]),
  );
  const app = await buildApp(resources);
  cleanup.push(() => app.close());
  await registerWeb(app);
  await app.listen({ port, host: "127.0.0.1" });
});

test.afterAll(async () => {
  const results = [];
  for (const close of cleanup.reverse()) {
    try {
      await close();
    } catch (error) {
      results.push(error);
    }
  }
  cleanup = [];
  if (results.length) throw new AggregateError(results);
});

test("cadastro, MFA e jornada comercial persistida pelo navegador", async ({
  page,
}) => {
  const address = "fluxo-" + suffix + "@example.test";
  const password = randomBytes(24).toString("hex");
  await page.goto(origin);
  await page.getByRole("link", { name: "Criar conta" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Operador de teste");
  await page.getByLabel("E-mail").fill(address);
  await page.getByLabel("Nova senha").fill(password);
  await page.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("status")).toContainText("confirmar o cadastro", {
    timeout: 10000,
  });
  const mail = await mailedUrl(address, "Confirmar e-mail no Retivvo");
  expect(mail.origin).toBe(origin);
  await page.goto(mail.href);
  await page
    .getByRole("textbox", { name: "E-mail", exact: true })
    .fill(address);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  const navigation = page.getByRole("navigation", { name: "Principal" });
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Tab");
  await page
    .getByRole("link", { name: "Ir para o conteúdo principal" })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await navigation.getByRole("link", { name: "Visão geral" }).focus();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  async function goTo(name: string) {
    if (await menu.isVisible()) await menu.click();
    await navigation.getByRole("link", { name, exact: true }).click();
    if (await menu.isVisible())
      await expect(menu).toHaveAttribute("aria-expanded", "false");
  }
  await goTo("Minha conta");
  await page
    .getByRole("group")
    .filter({ hasText: "Configurar autenticador" })
    .getByLabel("Senha", { exact: true })
    .fill(password);
  await page.getByRole("button", { name: "Configurar autenticador" }).click();
  const key = await page
    .locator("p")
    .filter({ hasText: /^Chave/ })
    .locator("code")
    .textContent();
  await page
    .getByLabel("Código do autenticador")
    .fill(totp("otpauth://totp/test?secret=" + key));
  await page.getByRole("button", { name: "Confirmar autenticador" }).click();
  await expect(
    page.getByText("Segundo fator confirmado nesta sessão."),
  ).toBeVisible();
  await goTo("Organizações");
  await page.getByLabel("Nome da organização").fill("Climatização de teste");
  await page.getByRole("button", { name: "Criar organização" }).click();
  await goTo("Clientes");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  await page.getByLabel("Nome do cliente").fill("Oficina de teste");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByText("Oficina de teste", { exact: true }),
  ).toBeVisible();

  await goTo("Propostas");
  await page.getByRole("button", { name: "Nova proposta" }).click();
  await page.getByLabel("Título").fill("Instalação");
  await page
    .locator("select[name=clientId]")
    .selectOption({ label: "Oficina de teste" });
  await page.getByLabel("Valor em reais").fill("1234,56");
  await page.getByLabel("Data de envio").fill("2026-11-18");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Instalação", { exact: true })).toBeVisible();
  await goTo("Acompanhamentos");
  await page.getByRole("button", { name: "Novo acompanhamento" }).click();
  await page
    .locator("select[name=proposalId]")
    .selectOption({ label: "Instalação" });
  await page.getByLabel("Próxima ação").fill("Ligar para confirmar");
  await page.getByLabel("Prazo").fill("2026-11-24");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByText("Ligar para confirmar", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Ligar para confirmar", { exact: true }),
  ).toBeVisible();
  const editFollowup = page.getByRole("button", {
    name: "Editar Ligar para confirmar",
    exact: true,
  });
  await editFollowup.click();
  await expect(
    page.getByRole("heading", { name: "Editar Ligar para confirmar" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  await expect(editFollowup).toBeFocused();
  await editFollowup.click();
  await page.getByLabel("Situação").selectOption("yes");
  await page.getByLabel("Resultado do contato").fill("Cliente aceitou");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByText("Cliente aceitou", { exact: true }),
  ).toBeVisible();
  await goTo("Propostas");
  await page
    .getByRole("button", { name: "Editar Instalação", exact: true })
    .click();
  await page.locator("select[name=status]").selectOption("won");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText(/Ganha ·/)).toBeVisible();
  const exclude = page.getByRole("button", {
    name: "Excluir Instalação",
    exact: true,
  });
  await exclude.click();
  const cancel = page.getByRole("button", { name: "Cancelar", exact: true });
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(exclude).toBeFocused();
  const longName = "W".repeat(160);
  await page
    .getByRole("button", { name: "Editar Instalação", exact: true })
    .click();
  await page.getByLabel("Título").fill(longName);
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: longName, exact: true }),
  ).toBeVisible();
  for (const width of [320, 390, 640, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    const height = await page
      .getByRole("button", { name: "Nova proposta" })
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(44);
  }
  await goTo("Relatórios");
  await expect(page.getByText(/1\.234,56/)).toBeVisible();
  await page.getByLabel("De", { exact: true }).fill("2026-11-19");
  await page.getByRole("button", { name: "Aplicar período de envio" }).click();
  await expect(page.getByText("Nenhuma proposta no período.")).toBeVisible();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});
