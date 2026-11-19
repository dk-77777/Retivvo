// Ferramenta local de provisionamento. O processo HTTP não carrega .env.
import { randomBytes, createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import pg from "pg";

export async function localConfig() {
  const secret = () => randomBytes(32).toString("hex");
  const file = ".env.api";
  try {
    await writeFile(
      file,
      [
        "APP_ORIGIN=http://127.0.0.1:3000",
        "PGHOST=127.0.0.1",
        "PGPORT=5432",
        "PGDATABASE=retivvo",
        "AUTH_DB_PASSWORD=" + secret(),
        "APP_DB_PASSWORD=" + secret(),
        "BETTER_AUTH_SECRET=" + secret(),
        "SMTP_URL=smtp://127.0.0.1:1025",
        "MAIL_FROM=Retivvo <acesso@retivvo.test>",
        "",
      ].join("\n"),
      { flag: "wx", mode: 0o600 },
    );
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
  return parseEnv(await readFile(file, "utf8"));
}

export async function bootstrap(database) {
  const { POSTGRES_PASSWORD } = parseEnv(await readFile(".env", "utf8"));
  return new pg.Client({
    host: "127.0.0.1",
    port: 5432,
    database,
    user: "retivvo_bootstrap",
    password: POSTGRES_PASSWORD,
  });
}

export async function prepare(database, config) {
  const client = await bootstrap(database);
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(2970135)");
    for (const [role, password] of [
      ["retivvo_auth", config.AUTH_DB_PASSWORD],
      ["retivvo_app", config.APP_DB_PASSWORD],
    ]) {
      if (!password) throw new Error("Credencial local ausente");
      const exists = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname=$1",
        [role],
      );
      if (!exists.rowCount) {
        const sql = await client.query(
          "SELECT format('CREATE ROLE %I LOGIN PASSWORD %L',$1::text,$2::text) AS ddl",
          [role, password],
        );
        await client.query(sql.rows[0].ddl);
      }
    }
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, digest text NOT NULL)",
    );
    for (const name of (await readdir("migrations"))
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      const sql = await readFile("migrations/" + name, "utf8");
      const digest = createHash("sha256").update(sql).digest("hex");
      const previous = await client.query(
        "SELECT digest FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (previous.rowCount) {
        if (previous.rows[0].digest !== digest)
          throw new Error("Migração aplicada foi modificada: " + name);
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations VALUES ($1,$2)", [
        name,
        digest,
      ]);
    }
    await client.query("COMMIT");
  } finally {
    await client.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = await localConfig();
  await prepare(config.PGDATABASE, config);
  console.log("Migrações de desenvolvimento aplicadas.");
}
