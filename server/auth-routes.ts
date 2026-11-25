import { checkDatabase } from "./readiness.ts";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { buildAuth } from "./auth.ts";
import { HttpError, authHeaders } from "./http.ts";

const authRoutes = new Set([
  "sign-up/email",
  "sign-in/email",
  "sign-out",
  "get-session",
  "verify-email",
  "send-verification-email",
  "request-password-reset",
  "reset-password",
  "change-password",
  "list-sessions",
  "revoke-session",
  "revoke-other-sessions",
  "delete-user",
  "delete-user/callback",
  "two-factor/enable",
  "two-factor/verify-totp",
  "two-factor/verify-backup-code",
  "two-factor/generate-backup-codes",
]);

export function registerAuthRoutes(
  app: FastifyInstance,
  auth: ReturnType<typeof buildAuth>,
  origin: string,
  authDb: Pool,
  appDb: Pool,
) {
  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler: async (req, reply) => {
      const path = (req.params as { "*": string })["*"];
      const resetLink = /^reset-password\/[a-zA-Z0-9_-]+$/.test(path);
      if (!authRoutes.has(path) && !resetLink)
        throw new HttpError(404, "Rota inexistente.");
      const headers = authHeaders(req);
      if (
        req.method === "POST" &&
        req.body !== undefined &&
        (req.body === null ||
          typeof req.body !== "object" ||
          Array.isArray(req.body))
      ) {
        throw new HttpError(400, "Envie um objeto JSON.");
      }
      const body = req.body as Record<string, unknown> | undefined;
      if (path === "change-password" && body) body.revokeOtherSessions = true;
      if (path.startsWith("two-factor/") && body?.trustDevice)
        throw new HttpError(400, "Confirme o segundo fator a cada acesso.");
      if (req.method === "POST" && path === "sign-up/email") {
        const ready = await checkDatabase(authDb, appDb).catch(() => false);
        if (!ready) {
          console.error(
            JSON.stringify({ event: "auth.signup_database_not_ready" }),
          );
          throw new HttpError(
            503,
            "O cadastro está indisponível porque o banco ainda não está pronto.",
          );
        }
      }
      const res = await auth.handler(
        new Request(origin + req.url, {
          method: req.method,
          headers,
          body: req.method === "POST" ? JSON.stringify(body) : undefined,
        }),
      );
      const cookies = res.headers.getSetCookie();
      if (
        res.ok &&
        ["two-factor/verify-totp", "two-factor/verify-backup-code"].includes(
          path,
        )
      ) {
        // O plugin substitui o cookie na inscrição e ao concluir o desafio de login.
        const jar = new Map<string, string>();
        for (const pair of [
          ...(headers.get("cookie") ?? "").split(";"),
          ...cookies.map((c) => c.split(";")[0]),
        ]) {
          const i = pair.indexOf("=");
          if (i >= 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1));
        }
        headers.set(
          "cookie",
          Array.from(jar, ([k, v]) => k + "=" + v).join("; "),
        );
        const verified = await auth.api.getSession({ headers });
        if (verified?.user.twoFactorEnabled)
          await authDb.query(
            'UPDATE session SET "mfaVerified"=true WHERE id=$1',
            [verified.session.id],
          );
      }
      if (req.method === "POST" || path === "delete-user/callback") {
        await appDb.query(
          "INSERT INTO crm.audit(event,status) VALUES ($1,$2)",
          ["auth." + (resetLink ? "reset-link" : path), res.status],
        );
      }
      for (const [key, value] of res.headers) {
        if (!["set-cookie", "content-length", "cache-control"].includes(key))
          reply.header(key, value);
      }
      if (cookies.length) reply.header("set-cookie", cookies);
      if (res.status >= 500)
        return reply.code(500).send({ error: "Falha na autenticação." });
      return reply.code(res.status).send(await res.text());
    },
  });
}
