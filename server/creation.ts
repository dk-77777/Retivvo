import { createHash, randomUUID } from "node:crypto";
import type { PoolClient, QueryResult } from "pg";
import { z } from "zod";
import { HttpError } from "./http.ts";

export async function createRecord(
  db: PoolClient,
  org: string,
  requestKey: string | string[] | undefined,
  table: "clients" | "proposals" | "followups",
  columns: string,
  data: object,
  insert: (id: string) => Promise<QueryResult>,
) {
  const id = randomUUID();
  if (requestKey !== undefined) {
    const key = z.uuid().parse(requestKey);
    const hash = createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
    const scope = [org, table, key];
    const receipt = await db.query(
      `INSERT INTO crm.creation_requests(org_id,actor_id,resource,request_id,content_hash,record_id)
       VALUES ($1,crm.actor(),$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [...scope, hash, id],
    );
    if (!receipt.rowCount) {
      const previous = await db.query(
        `SELECT content_hash,record_id FROM crm.creation_requests WHERE org_id=$1
         AND actor_id=crm.actor() AND resource=$2 AND request_id=$3`,
        scope,
      );
      if (previous.rows[0]?.content_hash !== hash)
        throw new HttpError(
          409,
          "Os dados desta solicitação já foram enviados com outro conteúdo.",
        );
      const replay = await db.query(
        `SELECT ${columns} FROM crm.${table} WHERE org_id=$1 AND id=$2`,
        [org, previous.rows[0].record_id],
      );
      if (!replay.rowCount)
        throw new HttpError(
          409,
          "O registro desta solicitação já foi excluído.",
        );
      return { status: 200, row: replay.rows[0] };
    }
  }
  return { status: 201, row: (await insert(id)).rows[0] };
}
