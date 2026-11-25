import { totp, mailedUrl, testSmtp } from "./local-mail.ts";
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
    SMTP_URL: testSmtp,
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
        headers: Record<string, string> = {},
      ) {
        const res = await app.inject({
          method,
          url,
          remoteAddress: address,
          headers: {
            ...headers,
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
  await t.test(
    "cadastro informa banco incompleto antes de criar a conta",
    async () => {
      const migration = await bootstrap(dbName);
      await migration.connect();
      const email = "incompleto-" + randomUUID() + "@example.test";
      try {
        await migration.query(
          "REVOKE INSERT (event, status) ON crm.audit FROM retivvo_app",
        );
        const guest = browser();
        assert.equal((await guest.send("GET", "/api/health")).statusCode, 503);
        const rejected = await guest.send("POST", auth + "sign-up/email", {
          email,
          password,
          name: "Ensaio de instalação incompleta",
        });
        assert.equal(rejected.statusCode, 503);
        assert.match(rejected.json().error, /banco ainda não está pronto/);
        assert.equal(
          (
            await migration.query(
              'SELECT id FROM public."user" WHERE email=$1',
              [email],
            )
          ).rowCount,
          0,
        );
      } finally {
        await migration.query(
          "GRANT INSERT (event, status) ON crm.audit TO retivvo_app",
        );
        await migration.end();
      }
    },
  );
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
      assert.equal(
        (await a.send("GET", root + "/clients?q=CLIMAT")).json()[0].id,
        c.id,
      );
      assert.equal(
        (await a.send("GET", root + "/proposals?q=climat")).json()[0].id,
        id,
      );
      assert.equal(
        (await a.send("GET", root + "/followups?q=LIGAR")).json()[0].id,
        added.json().id,
      );
      assert.deepEqual(
        (await b.send("GET", other + "/proposals?q=climat")).json(),
        [],
      );
      assert.deepEqual(
        (await b.send("GET", other + "/followups?q=ligar")).json(),
        [],
      );
      const foreign = await resources.appDb.connect();
      try {
        await foreign.query("BEGIN");
        await foreign.query(
          "SELECT set_config('retivvo.actor',$1,true),set_config('retivvo.mfa','true',true),set_config('retivvo.org',$2,true)",
          [bob.id, beta.id],
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
  await t.test(
    "reenvio concorrente, alteração do conteúdo e exclusão",
    async () => {
      const key = { "idempotency-key": randomUUID() };
      const create = (url: string, body: Record<string, unknown>) =>
        a.send("POST", root + url, body, origin, key);
      const client = await create("/clients", { name: "Ensaio de reenvio" });
      assert.equal(client.statusCode, 201);
      const data = {
        clientId: client.json().id,
        title: "Cotação",
        amountCents: 4500,
        sentOn: "2026-11-23",
        status: "open",
        notes: "",
      };
      const replies = await Promise.all([
        create("/proposals", data),
        create("/proposals", data),
      ]);
      assert.deepEqual(replies.map((r) => r.statusCode).sort(), [200, 201]);
      assert.deepEqual(replies[0].json(), replies[1].json());
      assert.equal(
        (await create("/proposals", { ...data, amountCents: 4600 })).statusCode,
        409,
      );
      const id = replies[0].json().id;
      const followup = {
        proposalId: id,
        action: "Telefonar",
        dueOn: "2026-11-24",
        done: false,
        outcome: "",
      };
      const task = await create("/followups", followup);
      assert.equal(task.statusCode, 201);
      assert.equal((await create("/followups", followup)).statusCode, 200);
      assert.deepEqual((await a.send("GET", root + "/reports")).json(), {
        statuses: [{ status: "open", count: 1, amountCents: "4500" }],
        pending: 1,
      });
      assert.equal(
        (await a.send("DELETE", root + "/followups/" + task.json().id))
          .statusCode,
        204,
      );
      assert.equal((await create("/followups", followup)).statusCode, 409);
      assert.equal(
        (await a.send("DELETE", root + "/proposals/" + id)).statusCode,
        204,
      );
      assert.equal(
        (await a.send("DELETE", root + "/clients/" + client.json().id))
          .statusCode,
        200,
      );
    },
  );
  await t.test(
    "a seleção de empresa limita inclusive um membro das duas organizações",
    async () => {
      const receipts = { "idempotency-key": randomUUID() };
      const records = [];
      for (const [owner, path] of [
        [a, root],
        [b, other],
      ] as const) {
        assert.equal(
          (await owner.send("POST", path + "/members", { userId: maria.id }))
            .statusCode,
          201,
        );
        const c = await member.send(
          "POST",
          path + "/clients",
          { name: "Cliente de ensaio" },
          origin,
          receipts,
        );
        assert.equal(c.statusCode, 201);
        const p = await member.send("POST", path + "/proposals", {
          clientId: c.json().id,
          title: "Cotação",
          amountCents: 123,
          sentOn: "2026-11-23",
          status: "open",
          notes: "",
        });
        assert.equal(p.statusCode, 201);
        const f = await member.send("POST", path + "/followups", {
          proposalId: p.json().id,
          action: "Confirmar",
          dueOn: "2026-11-24",
          done: false,
          outcome: "",
        });
        assert.equal(f.statusCode, 201);
        records.push({
          client: c.json().id,
          proposal: p.json().id,
          followup: f.json().id,
          path,
          owner,
        });
      }
      const db = await resources.appDb.connect();
      try {
        await db.query("BEGIN");
        await db.query("SELECT set_config('retivvo.actor',$1,true)", [
          maria.id,
        ]);
        assert.equal(
          (await db.query("SELECT id FROM crm.clients")).rowCount,
          0,
        );
        for (const [index, org] of [alpha.id, beta.id].entries()) {
          await db.query("SELECT set_config('retivvo.org',$1,true)", [org]);
          for (const [table, id] of [
            ["clients", records[index].client],
            ["proposals", records[index].proposal],
            ["followups", records[index].followup],
          ]) {
            assert.deepEqual(
              (await db.query("SELECT id FROM crm." + table)).rows,
              [{ id }],
            );
          }
          assert.deepEqual(
            (await db.query("SELECT record_id FROM crm.creation_requests"))
              .rows,
            [{ record_id: records[index].client }],
          );
        }
      } finally {
        await db.query("ROLLBACK");
        db.release();
      }
      for (const { client, proposal, followup, path, owner } of records) {
        assert.equal(
          (await owner.send("DELETE", path + "/followups/" + followup))
            .statusCode,
          204,
        );
        assert.equal(
          (await owner.send("DELETE", path + "/proposals/" + proposal))
            .statusCode,
          204,
        );
        assert.equal(
          (await owner.send("DELETE", path + "/clients/" + client)).statusCode,
          200,
        );
        assert.equal(
          (await owner.send("DELETE", path + "/members/" + maria.id))
            .statusCode,
          204,
        );
      }
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
        "SELECT set_config('retivvo.actor',$1,true),set_config('retivvo.mfa','true',true),set_config('retivvo.org',$2,true)",
        [bob.id, beta.id],
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
  await t.test(
    "métricas opcionais, deduplicação diária e retenção da coorte",
    async () => {
      const report = await bootstrap(dbName);
      await report.connect();
      cleanup.push(() => report.end());
      assert.equal(
        (await report.query("SELECT 1 FROM crm.beta_activity LIMIT 1"))
          .rowCount,
        0,
      );
      const betaApp = await buildApp({ ...resources, betaMetrics: true });
      const login = await betaApp.inject({
        method: "POST",
        url: auth + "sign-in/email",
        headers: { origin },
        payload: { email: bob.email, password },
      });
      try {
        assert.equal(login.json().twoFactorRedirect, true);
        const verified = await betaApp.inject({
          method: "POST",
          url: auth + "two-factor/verify-totp",
          headers: {
            origin,
            cookie: login.cookies.map((c) => c.name + "=" + c.value).join("; "),
          },
          payload: { code: totp(beta.uri) },
        });
        assert.equal(verified.statusCode, 200);
        const cookie = verified.cookies.find((c) =>
          c.name.endsWith("session_token"),
        );
        assert.ok(cookie);
        const send = (path: string, payload: object) =>
          betaApp.inject({
            method: "POST",
            url: other + path,
            headers: { origin, cookie: cookie.name + "=" + cookie.value },
            payload,
          });
        const client = await send("/clients", { name: "Ensaio de ativação" });
        assert.equal(client.statusCode, 201);
        const proposal = await send("/proposals", {
          clientId: client.json().id,
          title: "Proposta do piloto",
          amountCents: 10,
          sentOn: "2026-11-01",
          status: "open",
          notes: "",
        });
        assert.equal(proposal.statusCode, 201);
        for (const action of ["Primeira ação", "Segunda ação"]) {
          assert.equal(
            (
              await send("/followups", {
                proposalId: proposal.json().id,
                action,
                dueOn: "2026-11-02",
                done: false,
                outcome: "",
              })
            ).statusCode,
            201,
          );
        }
        assert.deepEqual(
          (
            await report.query(
              "SELECT kind FROM crm.beta_activity ORDER BY kind",
            )
          ).rows,
          [{ kind: "active" }, { kind: "followup_created" }],
        );
        await report.query(
          "UPDATE crm.beta_activity SET day=DATE '2026-11-01'",
        );
        await report.query(
          "INSERT INTO crm.beta_activity VALUES($1,'2026-11-08','active')",
          [beta.id],
        );
        assert.deepEqual(
          (
            await report.query(
              "SELECT * FROM crm.beta_summary('2026-11-01','2026-11-10')",
            )
          ).rows,
          [{ active: 1, activated: 1, eligible: 0, retained: 0 }],
        );
        assert.deepEqual(
          (
            await report.query(
              "SELECT * FROM crm.beta_summary('2026-11-01','2026-11-15')",
            )
          ).rows,
          [{ active: 1, activated: 1, eligible: 1, retained: 1 }],
        );
        await assert.rejects(
          resources.appDb.query(
            "SELECT * FROM crm.beta_summary('2026-11-01','2026-11-15')",
          ),
          { code: "42501" },
        );
      } finally {
        await betaApp.close();
      }
    },
  );
  await t.test(
    "configuração de cookies HTTPS, recusa de transporte aberto e diagnóstico mínimo",
    async (t) => {
      const https = "https://retivvo.example";
      assert.throws(() =>
        getResources({ ...config, NODE_ENV: "production", APP_ORIGIN: origin }),
      );
      assert.throws(() =>
        getResources({
          ...config,
          NODE_ENV: "production",
          APP_ORIGIN: https,
          SMTP_URL: "smtp://smtp.example",
        }),
      );
      const hosted = await buildApp({
        ...resources,
        origin: https,
        mail: async () => {
          throw new Error("falha sintética privada");
        },
      });
      const logs = t.mock.method(console, "error", () => {});
      try {
        const headers = { origin: https };
        const login = await hosted.inject({
          method: "POST",
          url: auth + "sign-in/email",
          headers,
          payload: { email: bob.email, password },
        });
        assert.equal(login.statusCode, 200);
        assert.equal(login.json().twoFactorRedirect, true);
        const verified = await hosted.inject({
          method: "POST",
          url: auth + "two-factor/verify-backup-code",
          headers: {
            ...headers,
            cookie: login.cookies.map((c) => c.name + "=" + c.value).join("; "),
          },
          payload: { code: beta.backup },
        });
        assert.equal(verified.statusCode, 200);
        assert.ok(
          verified.cookies.some(
            (c) =>
              c.name.endsWith("session_token") &&
              c.value &&
              c.secure &&
              c.httpOnly &&
              c.sameSite === "Lax" &&
              !c.domain,
          ),
        );
        const reset = await hosted.inject({
          method: "POST",
          url: auth + "request-password-reset",
          headers,
          payload: { email: bob.email },
        });
        assert.equal(reset.statusCode, 200);
      } finally {
        await hosted.close();
      }
      const messages = logs.mock.calls.map((call) =>
        JSON.parse(String(call.arguments[0])),
      );
      assert.ok(messages.some((value) => value.event === "auth.mail_failed"));
      for (const value of messages) {
        assert.deepEqual(Object.keys(value).sort(), ["event", "level"]);
        assert.ok(
          ["auth.mail_failed", "auth.diagnostic"].includes(value.event),
        );
      }
    },
  );
  await t.test(
    "a sonda de banco tem quota independente da sonda de vida",
    async () => {
      const monitor = browser();
      for (let n = 0; n < 30; n++)
        assert.equal(
          (await monitor.send("GET", "/api/health")).statusCode,
          200,
        );
      assert.equal((await monitor.send("GET", "/api/health")).statusCode, 429);
      assert.equal((await monitor.send("GET", "/api/live")).statusCode, 200);
      assert.equal(
        (await browser().send("GET", "/api/health")).statusCode,
        200,
      );
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
