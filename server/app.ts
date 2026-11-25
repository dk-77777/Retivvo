import { checkDatabase } from "./readiness.ts";
import Fastify, { type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { HttpError, authHeaders } from "./http.ts";
import { registerAuthRoutes } from "./auth-routes.ts";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { buildAuth, type SendMail } from "./auth.ts";
import { createRecord } from "./creation.ts";
import { registerCommercial } from "./commercial.ts";

type Options = {
  origin: string;
  secret: string;
  authDb: Pool;
  appDb: Pool;
  mail: SendMail;
  logOperations?: boolean;
  betaMetrics?: boolean;
  trustLoopbackProxy?: boolean;
};
export async function buildApp({
  origin,
  secret,
  authDb,
  appDb,
  mail,
  logOperations = false,
  betaMetrics = false,
  trustLoopbackProxy = false,
}: Options) {
  const pending = new Set<Promise<unknown>>();
  const auth = buildAuth(authDb, origin, secret, mail, (task) => {
    pending.add(task);
    void task.then(
      () => pending.delete(task),
      () => pending.delete(task),
    );
  });
  const app = Fastify({
    bodyLimit: 16384,
    requestTimeout: 15000,
    trustProxy: trustLoopbackProxy
      ? (address, hop) =>
          hop === 0 &&
          ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)
      : false,
    logger: false,
  });
  app.addHook("onClose", async () => {
    await Promise.allSettled(pending);
  });
  await app.register(helmet, { referrerPolicy: { policy: "no-referrer" } });
  await app.register(rateLimit, { max: 120, timeWindow: 60000 });
  const actors = new WeakMap<FastifyRequest, string>();
  const userLimit = app.createRateLimit({
    max: 90,
    timeWindow: 60000,
    keyGenerator: (req) => actors.get(req)!,
  });
  const orgLimit = app.createRateLimit({
    max: 300,
    timeWindow: 60000,
    keyGenerator: (req) => (req.params as { org: string }).org,
  });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (!["GET", "HEAD"].includes(req.method) && req.headers.origin !== origin)
      throw new HttpError(403, "Origem não permitida.");
  });
  app.setErrorHandler(
    (err: Error & { statusCode?: number; code?: string }, _req, reply) => {
      if (err instanceof z.ZodError)
        return reply.code(400).send({ error: "Dados inválidos." });
      if (err.code === "23505")
        return reply.code(409).send({ error: "Registro já existente." });
      if (err.code === "23503")
        return reply.code(409).send({ error: "Referência indisponível." });
      if (err.code === "42501")
        return reply.code(403).send({ error: "Acesso negado." });
      const code = err.statusCode ?? 500;
      return reply.code(code).send({
        error:
          err instanceof HttpError
            ? err.message
            : code >= 500
              ? "Falha interna."
              : "Solicitação recusada.",
      });
    },
  );

  if (logOperations) {
    app.addHook("onResponse", async (req, reply) => {
      console.log(
        JSON.stringify({
          time: new Date().toISOString(),
          event: "http.completed",
          method: req.method,
          status: reply.statusCode,
          durationMs: Math.round(reply.elapsedTime),
        }),
      );
    });
  }
  const probe = { config: { rateLimit: false as const } };
  app.get("/api/live", probe, async () => ({ status: "ok" }));
  app.get(
    "/api/health",
    { config: { rateLimit: { max: 30, timeWindow: 60000 } } },
    async (_req, reply) => {
      try {
        if (await checkDatabase(authDb, appDb)) return { status: "ok" };
      } catch {
        // A sonda devolve o mesmo estado para falhas de conexão e de schema.
      }
      return reply.code(503).send({ status: "unavailable" });
    },
  );
  registerAuthRoutes(app, auth, origin, authDb, appDb);

  async function scoped<T>(
    req: FastifyRequest,
    work: (db: PoolClient, actor: string, mfa: boolean) => Promise<T>,
  ) {
    const identity = await auth.api.getSession({ headers: authHeaders(req) });
    if (!identity?.user.emailVerified)
      throw new HttpError(401, "Entre para continuar.");
    const actor = identity.user.id;
    const mfa = !!(
      identity.user.twoFactorEnabled && identity.session.mfaVerified
    );
    actors.set(req, actor);
    const quota = await userLimit(req);
    if (!quota.isAllowed && quota.isExceeded)
      throw new HttpError(429, "Limite de operações por usuário.");
    const db = await appDb.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        "SELECT set_config('retivvo.actor',$1,true), set_config('retivvo.mfa',$2,true)",
        [actor, String(mfa)],
      );
      const result = await work(db, actor, mfa);
      await db.query("COMMIT");
      return result;
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    } finally {
      db.release();
    }
  }
  app.get("/api/organizations", (req) =>
    scoped(
      req,
      async (db) =>
        (
          await db.query(
            "SELECT id,name,owner_id=crm.actor() AS administrator FROM crm.organizations ORDER BY name,id",
          )
        ).rows,
    ),
  );
  app.post("/api/organizations", async (req, reply) => {
    const { name } = z
      .strictObject({ name: z.string().trim().min(1).max(120) })
      .parse(req.body);
    const org = await scoped(req, async (db, actor, mfa) => {
      if (!mfa)
        throw new HttpError(403, "Confirme o segundo fator para administrar.");
      const { rows } = await db.query(
        "INSERT INTO crm.organizations(name,owner_id) VALUES ($1,$2) RETURNING id,name",
        [name, actor],
      );
      await db.query(
        "INSERT INTO crm.audit(event,actor_id,org_id,status) VALUES ('organization.created',$1,$2,201)",
        [actor, rows[0].id],
      );
      return rows[0];
    });
    return reply.code(201).send(org);
  });

  const orgParams = z.object({ org: z.uuid() });
  async function inOrg<T>(
    req: FastifyRequest,
    work: (db: PoolClient, org: string, owner: boolean) => Promise<T>,
  ) {
    const { org } = orgParams.parse(req.params);
    return scoped(req, async (db) => {
      const result = await db.query(
        "SELECT owner_id=crm.actor() AS owner FROM crm.organizations WHERE id=$1",
        [org],
      );
      if (!result.rowCount)
        throw new HttpError(404, "Organização indisponível.");
      const quota = await orgLimit(req);
      if (!quota.isAllowed && quota.isExceeded)
        throw new HttpError(429, "Limite de operações da organização.");
      await db.query(
        "SELECT set_config('retivvo.org',$1,true), set_config('retivvo.beta_metrics',$2,true)",
        [org, String(betaMetrics)],
      );
      return work(db, org, result.rows[0].owner);
    });
  }
  app.delete("/api/organizations/:org", async (req, reply) => {
    const { confirmName } = z
      .strictObject({ confirmName: z.string().min(1).max(120) })
      .parse(req.body);
    await inOrg(req, async (db, org, owner) => {
      if (!owner)
        throw new HttpError(403, "Permissão administrativa necessária.");
      const removed = await db.query(
        "DELETE FROM crm.organizations WHERE id=$1 AND name=$2",
        [org, confirmName],
      );
      if (!removed.rowCount)
        throw new HttpError(409, "Confirme o nome da organização.");
      await db.query(
        "INSERT INTO crm.audit(event,actor_id,org_id,status) VALUES ('organization.closed',crm.actor(),$1,204)",
        [org],
      );
    });
    return reply.code(204).send();
  });
  app.post("/api/organizations/:org/members", async (req, reply) => {
    const { userId } = z
      .strictObject({ userId: z.string().min(1).max(128) })
      .parse(req.body);
    await inOrg(req, async (db, org, owner) => {
      if (!owner)
        throw new HttpError(403, "Permissão administrativa necessária.");
      await db.query("INSERT INTO crm.members(org_id,user_id) VALUES ($1,$2)", [
        org,
        userId,
      ]);
      await db.query(
        "INSERT INTO crm.audit(event,actor_id,org_id,status) VALUES ('membership.created',crm.actor(),$1,201)",
        [org],
      );
    });
    return reply.code(201).send({ ok: true });
  });

  app.delete("/api/organizations/:org/members/:userId", async (req, reply) => {
    const { userId } = z
      .object({ userId: z.string().min(1).max(128) })
      .parse(req.params);
    await inOrg(req, async (db, org, owner) => {
      if (!owner)
        throw new HttpError(403, "Permissão administrativa necessária.");
      const result = await db.query(
        "DELETE FROM crm.members WHERE org_id=$1 AND user_id=$2",
        [org, userId],
      );
      if (!result.rowCount) throw new HttpError(404, "Vínculo indisponível.");
      await db.query(
        "INSERT INTO crm.audit(event,actor_id,org_id,status) VALUES ('membership.revoked',crm.actor(),$1,200)",
        [org],
      );
    });
    return reply.code(204).send();
  });

  const clientName = z.strictObject({
    name: z.string().trim().min(1).max(160),
  });
  const clients = "/api/organizations/:org/clients";
  app.get(clients, (req) =>
    inOrg(req, async (db, org) => {
      const page = z
        .strictObject({
          offset: z.coerce.number().int().min(0).max(100000).default(0),
        })
        .parse(req.query);
      return (
        await db.query(
          "SELECT id,name FROM crm.clients WHERE org_id=$1 ORDER BY name,id LIMIT 50 OFFSET $2",
          [org, page.offset],
        )
      ).rows;
    }),
  );
  app.post(clients, async (req, reply) => {
    const data = clientName.parse(req.body);
    const created = await inOrg(req, (db, org) =>
      createRecord(
        db,
        org,
        req.headers["idempotency-key"],
        "clients",
        "id,name",
        data,
        (id) =>
          db.query(
            "INSERT INTO crm.clients(id,org_id,name) VALUES ($1,$2,$3) RETURNING id,name",
            [id, org, data.name],
          ),
      ),
    );
    return reply.code(created.status).send(created.row);
  });
  app.route({
    method: ["GET", "PATCH", "DELETE"],
    url: clients + "/:id",
    handler: (req) =>
      inOrg(req, async (db, org) => {
        const { id } = z.object({ id: z.uuid() }).parse(req.params);
        const args = [org, id];
        let sql = "SELECT id,name FROM crm.clients WHERE org_id=$1 AND id=$2";
        if (req.method === "PATCH") {
          args.push(clientName.parse(req.body).name);
          sql =
            "UPDATE crm.clients SET name=$3 WHERE org_id=$1 AND id=$2 RETURNING id,name";
        } else if (req.method === "DELETE") {
          sql =
            "DELETE FROM crm.clients WHERE org_id=$1 AND id=$2 RETURNING id";
        }
        const { rows } = await db.query(sql, args);
        if (!rows.length) throw new HttpError(404, "Cliente indisponível.");
        if (req.method === "DELETE")
          await db.query(
            "INSERT INTO crm.audit(event,actor_id,org_id,status) VALUES ('client.deleted',crm.actor(),$1,200)",
            [org],
          );
        return rows[0];
      }),
  });
  registerCommercial(app, inOrg);
  return app;
}
