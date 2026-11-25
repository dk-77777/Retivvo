import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { createRecord } from "./creation.ts";
import { HttpError } from "./http.ts";

type InOrg = <T>(
  req: FastifyRequest,
  work: (db: PoolClient, org: string, owner: boolean) => Promise<T>,
) => Promise<T>;
const idParams = z.object({ id: z.uuid() });
export const searchTerm = z.string().trim().max(120).optional();
const pagination = z.coerce.number().int().min(0).max(100000).default(0);
const status = z.enum(["open", "won", "lost"]);
const proposalInput = z.strictObject({
  clientId: z.uuid(),
  title: z.string().trim().min(1).max(160),
  amountCents: z.number().int().min(0).max(99999999999),
  sentOn: z.iso.date(),
  status,
  notes: z.string().trim().max(2000),
});
const followupFields = {
  action: z.string().trim().min(1).max(200),
  dueOn: z.iso.date(),
  done: z.boolean(),
  outcome: z.string().trim().max(2000),
};
const validFollowup = (data: { done: boolean; outcome: string }) =>
  !data.done || data.outcome.length > 0;
const onUpdate = z.strictObject(followupFields).refine(validFollowup);
const onCreate = z
  .strictObject({ ...followupFields, proposalId: z.uuid() })
  .refine(validFollowup);

const proposals = "/api/organizations/:org/proposals";
const followups = "/api/organizations/:org/followups";
const proposalFields =
  'id, client_id AS "clientId", title, amount_cents::text AS "amountCents", sent_on::text AS "sentOn", status, notes';
const actionFields =
  'id, proposal_id AS "proposalId", action, due_on::text AS "dueOn", done, outcome';

function existing<T>(row: T | undefined) {
  if (!row) throw new HttpError(404, "Registro indisponível.");
  return row;
}

export function registerCommercial(app: FastifyInstance, inOrg: InOrg) {
  app.get(proposals, (req) =>
    inOrg(req, async (db, org) => {
      const q = z
        .strictObject({
          offset: pagination,
          status: status.optional(),
          q: searchTerm,
        })
        .parse(req.query);
      return (
        await db.query(
          `SELECT ${proposalFields}, (SELECT name FROM crm.clients c WHERE c.org_id=p.org_id AND c.id=p.client_id) AS "clientName" FROM crm.proposals p
      WHERE org_id=$1 AND ($2::text IS NULL OR status=$2)
        AND ($4::text IS NULL OR strpos(lower(p.title), lower($4)) > 0 OR EXISTS (
          SELECT FROM crm.clients c WHERE c.org_id=p.org_id AND c.id=p.client_id
            AND strpos(lower(c.name), lower($4)) > 0))
      ORDER BY sent_on DESC,id LIMIT 50 OFFSET $3`,
          [org, q.status, q.offset, q.q],
        )
      ).rows;
    }),
  );
  app.post(proposals, async (req, reply) => {
    const p = proposalInput.parse(req.body);
    const created = await inOrg(req, (db, org) =>
      createRecord(
        db,
        org,
        req.headers["idempotency-key"],
        "proposals",
        proposalFields,
        p,
        (id) =>
          db.query(
            `INSERT INTO crm.proposals(id,org_id,client_id,title,amount_cents,sent_on,status,notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${proposalFields}`,
            [
              id,
              org,
              p.clientId,
              p.title,
              p.amountCents,
              p.sentOn,
              p.status,
              p.notes,
            ],
          ),
      ),
    );
    return reply.code(created.status).send(created.row);
  });
  app.patch(proposals + "/:id", (req) =>
    inOrg(req, async (db, org) => {
      const { id } = idParams.parse(req.params);
      const p = proposalInput.parse(req.body);
      return existing(
        (
          await db.query(
            `UPDATE crm.proposals SET client_id=$3,title=$4,amount_cents=$5,sent_on=$6,status=$7,notes=$8
      WHERE org_id=$1 AND id=$2 RETURNING ${proposalFields}`,
            [
              org,
              id,
              p.clientId,
              p.title,
              p.amountCents,
              p.sentOn,
              p.status,
              p.notes,
            ],
          )
        ).rows[0],
      );
    }),
  );

  app.get(followups, (req) =>
    inOrg(req, async (db, org) => {
      const q = z
        .strictObject({
          offset: pagination,
          proposalId: z.uuid().optional(),
          q: searchTerm,
        })
        .parse(req.query);
      return (
        await db.query(
          `SELECT ${actionFields}, (SELECT title FROM crm.proposals p WHERE p.org_id=f.org_id AND p.id=f.proposal_id) AS "proposalTitle" FROM crm.followups f
      WHERE org_id=$1 AND ($2::uuid IS NULL OR proposal_id=$2)
        AND ($4::text IS NULL OR strpos(lower(f.action), lower($4)) > 0 OR EXISTS (
          SELECT FROM crm.proposals p WHERE p.org_id=f.org_id AND p.id=f.proposal_id
            AND strpos(lower(p.title), lower($4)) > 0))
      ORDER BY done,due_on,id LIMIT 50 OFFSET $3`,
          [org, q.proposalId, q.offset, q.q],
        )
      ).rows;
    }),
  );
  app.post(followups, async (req, reply) => {
    const f = onCreate.parse(req.body);
    const created = await inOrg(req, (db, org) =>
      createRecord(
        db,
        org,
        req.headers["idempotency-key"],
        "followups",
        actionFields,
        f,
        (id) =>
          db.query(
            `INSERT INTO crm.followups(id,org_id,proposal_id,action,due_on,done,outcome)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${actionFields}`,
            [id, org, f.proposalId, f.action, f.dueOn, f.done, f.outcome],
          ),
      ),
    );
    return reply.code(created.status).send(created.row);
  });
  app.patch(followups + "/:id", (req) =>
    inOrg(req, async (db, org) => {
      const { id } = idParams.parse(req.params);
      const f = onUpdate.parse(req.body);
      return existing(
        (
          await db.query(
            `UPDATE crm.followups SET action=$3,due_on=$4,done=$5,outcome=$6
      WHERE org_id=$1 AND id=$2 RETURNING ${actionFields}`,
            [org, id, f.action, f.dueOn, f.done, f.outcome],
          )
        ).rows[0],
      );
    }),
  );

  for (const [url, table, event] of [
    [proposals, "proposals", "proposal.deleted"],
    [followups, "followups", "followup.deleted"],
  ]) {
    app.delete(url + "/:id", async (req, reply) => {
      await inOrg(req, async (db, org) => {
        const { id } = idParams.parse(req.params);
        existing(
          (
            await db.query(
              `DELETE FROM crm.${table} WHERE org_id=$1 AND id=$2 RETURNING id`,
              [org, id],
            )
          ).rows[0],
        );
        await db.query(
          "INSERT INTO crm.audit(event,actor_id,org_id,status) VALUES ($1,crm.actor(),$2,204)",
          [event, org],
        );
      });
      return reply.code(204).send();
    });
  }

  app.get("/api/organizations/:org/reports", (req) =>
    inOrg(req, async (db, org) => {
      const { from, to } = z
        .strictObject({
          from: z.iso.date().optional(),
          to: z.iso.date().optional(),
        })
        .refine((q) => !q.from || !q.to || q.from <= q.to)
        .parse(req.query);
      const { rows } = await db.query(
        `SELECT p.status,count(*)::int AS count, sum(p.amount_cents)::text AS "amountCents",
      (SELECT count(*)::int FROM crm.followups f JOIN crm.proposals fp ON fp.id=f.proposal_id AND fp.org_id=f.org_id
        WHERE f.org_id=$1 AND NOT f.done AND fp.status='open'
        AND ($2::date IS NULL OR fp.sent_on >= $2) AND ($3::date IS NULL OR fp.sent_on <= $3)) AS pending
      FROM crm.proposals p WHERE p.org_id=$1 AND ($2::date IS NULL OR p.sent_on >= $2)
        AND ($3::date IS NULL OR p.sent_on <= $3) GROUP BY p.status ORDER BY p.status`,
        [org, from, to],
      );
      return {
        statuses: rows.map(({ status, count, amountCents }) => ({
          status,
          count,
          amountCents,
        })),
        pending: rows[0]?.pending ?? 0,
      };
    }),
  );
}
