import pg from "pg";
import nodemailer from "nodemailer";
import { z } from "zod";

export function getResources(env: NodeJS.ProcessEnv) {
  const c = z
    .object({
      APP_ORIGIN: z.url(),
      BETTER_AUTH_SECRET: z.string().min(32),
      PGHOST: z.string().min(1),
      PGPORT: z.coerce.number().int().positive(),
      PGDATABASE: z.string().min(1),
      AUTH_DB_PASSWORD: z.string().min(1),
      APP_DB_PASSWORD: z.string().min(1),
      SMTP_URL: z.url(),
      MAIL_FROM: z.string().min(1),
    })
    .parse(env);
  const url = new URL(c.APP_ORIGIN);
  if (
    url.origin !== c.APP_ORIGIN ||
    (url.protocol !== "https:" &&
      (env.NODE_ENV === "production" ||
        url.protocol !== "http:" ||
        !["localhost", "127.0.0.1"].includes(url.hostname)))
  ) {
    throw new Error(
      "APP_ORIGIN exige uma origem HTTPS ou loopback em desenvolvimento.",
    );
  }
  const smtp = new URL(c.SMTP_URL);
  if (!["smtp:", "smtps:"].includes(smtp.protocol))
    throw new Error("Configuração SMTP inválida.");
  const localMail =
    env.NODE_ENV !== "production" &&
    ["127.0.0.1", "localhost"].includes(smtp.hostname);
  if (!localMail && smtp.protocol !== "smtps:")
    throw new Error("E-mail externo exige SMTPS.");
  const db = {
    host: c.PGHOST,
    port: c.PGPORT,
    database: c.PGDATABASE,
    max: 8,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
    idle_in_transaction_session_timeout: 10000,
    ssl:
      env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
  };
  const authDb = new pg.Pool({
    ...db,
    user: "retivvo_auth",
    password: c.AUTH_DB_PASSWORD,
  });
  const appDb = new pg.Pool({
    ...db,
    user: "retivvo_app",
    password: c.APP_DB_PASSWORD,
  });
  for (const pool of [authDb, appDb])
    pool.on("error", () => {
      console.error("Conexão ociosa com PostgreSQL interrompida.");
    });
  const transport = nodemailer.createTransport({
    host: smtp.hostname,
    port: Number(smtp.port || (smtp.protocol === "smtps:" ? 465 : 25)),
    secure: smtp.protocol === "smtps:",
    auth: smtp.username
      ? {
          user: decodeURIComponent(smtp.username),
          pass: decodeURIComponent(smtp.password),
        }
      : undefined,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const mail = async (recipient: string, subject: string, link: string) => {
    await transport.sendMail({
      from: c.MAIL_FROM,
      to: { address: recipient, name: "" },
      subject,
      text: subject + "\n\n" + link,
    });
  };
  return {
    origin: url.origin,
    secret: c.BETTER_AUTH_SECRET,
    authDb,
    appDb,
    mail,
  };
}
