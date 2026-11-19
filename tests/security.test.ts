import { totp, mailedUrl } from "./local-mail.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { buildApp } from "../server/app.ts";
import { getResources } from "../server/config.ts";
import { bootstrap, localConfig, prepare } from "../scripts/prepare.mjs";

test("segurança integrada com banco temporário e SMTP local", async (t) => {
  const config = await localConfig();
  const dbName = "retivvo_test_" + randomBytes(8).toString("hex");
  const admin = await bootstrap("postgres");
  await admin.connect();
  await admin.query("CREATE DATABASE " + dbName);
  const cleanup: Array<() => Promise<unknown>> = [];
  t.after(async () => {
    try {
      for (const close of cleanup.reverse()) await close();
      await admin.query("DROP DATABASE " + dbName);
    } finally {
      await admin.end();
    }
  });
  await prepare(dbName, config);
  const resources = getResources({
    ...config,
    PGDATABASE: dbName,
    PGHOST: "127.0.0.1",
    PGPORT: "5432",
    APP_ORIGIN: "http://127.0.0.1:3000",
    SMTP_URL: "smtp://127.0.0.1:1025",
  });
  cleanup.push(() =>
    Promise.all([resources.appDb.end(), resources.authDb.end()]),
  );
  const app = await buildApp(resources);
  cleanup.push(() => app.close());
  const origin = resources.origin;
  let peer = 0;
  function browser() {
    const address = "192.0.2." + ++peer;
    const jar = new Map<string, string>();
    return {
      jar,
      async send(
        method: "GET" | "POST" | "PATCH" | "DELETE",
        url: string,
        body?: Record<string, unknown>,
        source = origin,
      ) {
        const res = await app.inject({
          method,
          url,
          remoteAddress: address,
          headers: {
            origin: source,
            cookie: Array.from(jar, ([k, v]) => k + "=" + v).join("; "),
          },
          payload: body,
        });
        for (const c of res.cookies) {
          if (c.value) jar.set(c.name, c.value);
          else jar.delete(c.name);
        }
        return res;
      },
    };
  }
  const password = randomBytes(24).toString("hex");
  const auth = "/api/auth/";
  const orgs = "/api/organizations";
  async function account(b: ReturnType<typeof browser>) {
    const email = "ensaio-" + randomUUID() + "@example.test";
    const signup = await b.send("POST", auth + "sign-up/email", {
      email,
      password,
      name: "Teste de integração",
    });
    assert.equal(signup.statusCode, 200);
    const unverified = await b.send("POST", auth + "sign-in/email", {
      email,
      password,
    });
    assert.equal(unverified.statusCode, 403);
    const url = await mailedUrl(email, "Confirmar e-mail no Retivvo");
    assert.ok(
      [200, 302].includes(
        (await b.send("GET", url.pathname + url.search)).statusCode,
      ),
    );
    const login = await b.send("POST", auth + "sign-in/email", {
      email,
      password,
    });
    assert.equal(login.statusCode, 200);
    assert.ok(login.cookies.some((c) => c.httpOnly && c.sameSite === "Lax"));
    return { email, id: login.json().user.id as string };
  }
  async function adminOrg(
    b: ReturnType<typeof browser>,
    email: string,
    name: string,
  ) {
    assert.equal((await b.send("POST", orgs, { name })).statusCode, 403);
    const old = browser();
    assert.equal(
      (await old.send("POST", auth + "sign-in/email", { email, password }))
        .statusCode,
      200,
    );
    const enroll = await b.send("POST", auth + "two-factor/enable", {
      password,
    });
    assert.equal(enroll.statusCode, 200);
    const uri = enroll.json().totpURI;
    const verified = await b.send("POST", auth + "two-factor/verify-totp", {
      code: totp(uri),
    });
    assert.equal(verified.statusCode, 200);
    assert.equal((await old.send("GET", orgs)).statusCode, 401);
    const created = await b.send("POST", orgs, { name });
    assert.equal(created.statusCode, 201);
    return {
      id: created.json().id as string,
      uri,
      backup: enroll.json().backupCodes[0] as string,
    };
  }
  const a = browser(),
    b = browser(),
    member = browser();
  const alice = await account(a),
    bob = await account(b),
    maria = await account(member);
  const alpha = await adminOrg(a, alice.email, "Organização A");
  const beta = await adminOrg(b, bob.email, "Organização B");
  const root = orgs + "/" + alpha.id,
    other = orgs + "/" + beta.id;
  await t.test(
    "origem, sessão, cabeçalhos, entrada e limite de corpo",
    async () => {
      assert.equal((await browser().send("GET", orgs)).statusCode, 401);
      assert.equal(
        (
          await a.send(
            "POST",
            root + "/clients",
            { name: "x" },
            "https://outra.invalid",
          )
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await a.send("POST", root + "/clients", {
            name: "x",
            org_id: beta.id,
          })
        ).statusCode,
        400,
      );
      assert.equal(
        (await a.send("POST", root + "/clients", { name: "x".repeat(17000) }))
          .statusCode,
        413,
      );
      const res = await a.send("GET", orgs);
      assert.equal(res.headers["cache-control"], "no-store");
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.deepEqual(
        res.json().map((x: { id: string }) => x.id),
        [alpha.id],
      );
    },
  );
  await t.test(
    "CRUD isolado entre empresas e revogação imediata de membro",
    async () => {
      const created = await a.send("POST", root + "/clients", {
        name: "Cliente A",
      });
      assert.equal(created.statusCode, 201);
      const id = created.json().id;
      assert.equal((await b.send("GET", root + "/clients")).statusCode, 404);
      assert.deepEqual((await b.send("GET", other + "/clients")).json(), []);
      assert.equal(
        (await b.send("GET", other + "/clients/" + id)).statusCode,
        404,
      );
      assert.equal(
        (await b.send("PATCH", other + "/clients/" + id, { name: "Outro" }))
          .statusCode,
        404,
      );
      assert.equal(
        (await b.send("DELETE", other + "/clients/" + id)).statusCode,
        404,
      );
      assert.equal(
        (await a.send("POST", root + "/members", { userId: maria.id }))
          .statusCode,
        201,
      );
      assert.equal(
        (await member.send("POST", root + "/members", { userId: bob.id }))
          .statusCode,
        403,
      );
      assert.equal(
        (await member.send("GET", root + "/clients/" + id)).json().name,
        "Cliente A",
      );
      assert.equal(
        (await a.send("DELETE", root + "/members/" + maria.id)).statusCode,
        204,
      );
      assert.equal(
        (await member.send("GET", root + "/clients/" + id)).statusCode,
        404,
      );
      assert.equal(
        (
          await a.send("PATCH", root + "/clients/" + id, { name: "Revisado" })
        ).json().name,
        "Revisado",
      );
      assert.equal(
        (await a.send("DELETE", root + "/clients/" + id)).statusCode,
        200,
      );
    },
  );
  await t.test(
    "propostas, acompanhamentos e relatórios isolados por organização",
    async () => {
      const c = (
        await a.send("POST", root + "/clients", { name: "Climatização" })
      ).json();
      const data = {
        clientId: c.id,
        title: "Instalação",
        amountCents: 125050,
        sentOn: "2026-11-18",
        status: "open",
        notes: "",
      };
      const response = await a.send("POST", root + "/proposals", data);
      assert.equal(response.statusCode, 201);
      const id = response.json().id;
      assert.equal(
        (await b.send("POST", other + "/proposals", data)).statusCode,
        409,
      );
      assert.equal(
        (await b.send("PATCH", other + "/proposals/" + id, data)).statusCode,
        404,
      );
      const task = {
        proposalId: id,
        action: "Ligar",
        dueOn: "2026-11-24",
        done: false,
        outcome: "",
      };
      assert.equal(
        (await b.send("POST", other + "/followups", task)).statusCode,
        409,
      );
      const added = await a.send("POST", root + "/followups", task);
      assert.equal(added.statusCode, 201);
      const foreign = await resources.appDb.connect();
      try {
        await foreign.query("BEGIN");
        await foreign.query(
          "SELECT set_config('retivvo.actor',$1,true),set_config('retivvo.mfa','true',true)",
          [bob.id],
        );
        assert.equal(
          (
            await foreign.query(
              "SELECT count(*)::int AS count FROM crm.proposals",
            )
          ).rows[0].count,
          0,
        );
        assert.equal(
          (
            await foreign.query(
              "SELECT count(*)::int AS count FROM crm.followups",
            )
          ).rows[0].count,
          0,
        );
      } finally {
        await foreign.query("ROLLBACK");
        foreign.release();
      }
      assert.deepEqual((await a.send("GET", root + "/reports")).json(), {
        statuses: [{ status: "open", count: 1, amountCents: "125050" }],
        pending: 1,
      });
      assert.deepEqual((await b.send("GET", other + "/reports")).json(), {
        statuses: [],
        pending: 0,
      });
      assert.deepEqual(
        (await a.send("GET", root + "/reports?from=2026-11-19")).json(),
        { statuses: [], pending: 0 },
      );
      const changes = {
        action: "Ligar",
        dueOn: "2026-11-24",
        done: true,
        outcome: "",
      };
      const followup = root + "/followups/" + added.json().id;
      assert.equal((await a.send("PATCH", followup, changes)).statusCode, 400);
      assert.equal(
        (await a.send("PATCH", followup, { ...changes, outcome: "Aceitou" }))
          .statusCode,
        200,
      );
      assert.equal(
        (
          await a.send("PATCH", root + "/proposals/" + id, {
            ...data,
            status: "won",
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await a.send("GET", root + "/reports")).json().statuses[0].status,
        "won",
      );
      assert.equal(
        (await a.send("DELETE", root + "/proposals/" + id)).statusCode,
        409,
      );
      assert.equal((await a.send("DELETE", followup)).statusCode, 204);
      assert.equal(
        (await a.send("DELETE", root + "/proposals/" + id)).statusCode,
        204,
      );
      assert.equal(
        (await a.send("DELETE", root + "/clients/" + c.id)).statusCode,
        200,
      );
    },
  );
  await t.test("RLS mesmo sem filtros SQL e separação dos papéis", async () => {
    const client = await a.send("POST", root + "/clients", {
      name: "Persistido",
    });
    assert.equal(client.statusCode, 201);
    const db = await resources.appDb.connect();
    try {
      assert.deepEqual((await db.query("SELECT * FROM crm.clients")).rows, []);
      const role = await db.query(
        "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user",
      );
      assert.deepEqual(role.rows, [{ rolsuper: false, rolbypassrls: false }]);
      await assert.rejects(db.query("SELECT password FROM account"), {
        code: "42501",
      });
      await assert.rejects(
        resources.authDb.query("SELECT * FROM crm.clients"),
        { code: "42501" },
      );
      await db.query("BEGIN");
      await db.query(
        "SELECT set_config('retivvo.actor',$1,true),set_config('retivvo.mfa','true',true)",
        [bob.id],
      );
      assert.deepEqual((await db.query("SELECT * FROM crm.clients")).rows, []);
      assert.equal(
        (await db.query("UPDATE crm.clients SET name=$1", ["Erro"])).rowCount,
        0,
      );
      assert.equal((await db.query("DELETE FROM crm.clients")).rowCount, 0);
      await assert.rejects(
        db.query("INSERT INTO crm.clients(org_id,name) VALUES($1,$2)", [
          alpha.id,
          "Erro",
        ]),
        { code: "42501" },
      );
    } finally {
      await db.query("ROLLBACK");
      db.release();
    }
  });
  await t.test("MFA no novo login, logout e expiração", async () => {
    const second = browser();
    const login = await second.send("POST", auth + "sign-in/email", {
      email: alice.email,
      password,
    });
    assert.equal(login.json().twoFactorRedirect, true);
    assert.equal((await second.send("GET", root + "/clients")).statusCode, 401);
    assert.equal(
      (
        await second.send("POST", auth + "two-factor/verify-backup-code", {
          code: alpha.backup,
        })
      ).statusCode,
      200,
    );
    assert.equal((await second.send("GET", root + "/clients")).statusCode, 200);
    const stale = browser();
    for (const [key, value] of second.jar) stale.jar.set(key, value);
    assert.equal(
      (await second.send("POST", auth + "sign-out", {})).statusCode,
      200,
    );
    assert.equal((await stale.send("GET", orgs)).statusCode, 401);
    await resources.authDb.query(
      'UPDATE session SET "expiresAt"=now() WHERE "userId"=$1',
      [bob.id],
    );
    assert.equal((await b.send("GET", orgs)).statusCode, 401);
  });
  await t.test(
    "recuperação por e-mail, token de uso único e revogação de sessões",
    async () => {
      const reset = browser(),
        newPassword = randomBytes(24).toString("hex");
      const known = await reset.send("POST", auth + "request-password-reset", {
        email: maria.email,
        redirectTo: origin + "/recuperar",
      });
      const unknown = await reset.send(
        "POST",
        auth + "request-password-reset",
        { email: "ausente@example.test", redirectTo: origin + "/recuperar" },
      );
      assert.equal(known.statusCode, 200);
      assert.deepEqual(unknown.json(), known.json());
      const url = await mailedUrl(maria.email, "Recuperar acesso ao Retivvo");
      const redirect = await reset.send("GET", url.pathname + url.search);
      assert.equal(redirect.statusCode, 302);
      const token = new URL(String(redirect.headers.location)).searchParams.get(
        "token",
      );
      assert.equal(
        (
          await reset.send("POST", auth + "reset-password", {
            token,
            newPassword,
          })
        ).statusCode,
        200,
      );
      assert.ok(
        (
          await reset.send("POST", auth + "reset-password", {
            token,
            newPassword,
          })
        ).statusCode >= 400,
      );
      assert.equal((await member.send("GET", orgs)).statusCode, 401);
      assert.equal(
        (
          await reset.send("POST", auth + "sign-in/email", {
            email: maria.email,
            password: newPassword,
          })
        ).statusCode,
        200,
      );
    },
  );
  await t.test(
    "encerramento confirmado, troca de senha e exclusão de conta por e-mail",
    async () => {
      assert.equal(
        (await a.send("DELETE", root, { confirmName: "Organização A" }))
          .statusCode,
        409,
      );
      const remaining = (await a.send("GET", root + "/clients")).json();
      for (const c of remaining)
        assert.equal(
          (await a.send("DELETE", root + "/clients/" + c.id)).statusCode,
          200,
        );
      assert.equal(
        (await a.send("DELETE", root, { confirmName: "incorreto" })).statusCode,
        409,
      );
      assert.equal(
        (await a.send("DELETE", root, { confirmName: "Organização A" }))
          .statusCode,
        204,
      );
      const updated = randomBytes(24).toString("hex");
      assert.equal(
        (
          await a.send("POST", auth + "change-password", {
            currentPassword: password,
            newPassword: updated,
          })
        ).statusCode,
        200,
      );
      assert.equal(
        (await a.send("POST", auth + "delete-user", { password: updated }))
          .statusCode,
        200,
      );
      const url = await mailedUrl(
        alice.email,
        "Confirmar exclusão da conta Retivvo",
      );
      assert.equal(
        (await a.send("GET", url.pathname + url.search)).statusCode,
        302,
      );
      assert.equal((await a.send("GET", orgs)).statusCode, 401);
      assert.equal(
        (
          await resources.authDb.query('SELECT 1 FROM "user" WHERE id=$1', [
            alice.id,
          ])
        ).rowCount,
        0,
      );
    },
  );
  await t.test(
    "auditoria de MFA e impossibilidade de reescrever o histórico pela API",
    async () => {
      const audit = await bootstrap(dbName);
      await audit.connect();
      try {
        const evidence = await audit.query(
          "SELECT event FROM crm.audit WHERE actor_id=$1 AND event IN ('session.mfa_confirmed','membership.revoked','organization.closed')",
          [alice.id],
        );
        assert.deepEqual(
          new Set(evidence.rows.map((row: { event: string }) => row.event)),
          new Set([
            "session.mfa_confirmed",
            "membership.revoked",
            "organization.closed",
          ]),
        );
        await assert.rejects(resources.appDb.query("DELETE FROM crm.audit"), {
          code: "42501",
        });
      } finally {
        await audit.end();
      }
    },
  );
  await t.test("limitação de tentativas de login", async () => {
    const guest = browser();
    let status = 0;
    for (let i = 0; i < 12 && status !== 429; i++)
      status = (
        await guest.send("POST", auth + "sign-in/email", {
          email: maria.email,
          password: "senha-invalida",
        })
      ).statusCode;
    assert.equal(status, 429);
  });
});
