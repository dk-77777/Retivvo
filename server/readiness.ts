import type { Pool } from "pg";

export async function checkDatabase(authDb: Pool, appDb: Pool) {
  const [auth, commercial] = await Promise.all([
    authDb.query<{ ready: boolean }>(`
      SELECT bool_and(coalesce(has_table_privilege(to_regclass(name), 'SELECT')
        AND has_table_privilege(to_regclass(name), 'INSERT'), false)) AS ready
      FROM unnest(ARRAY['public."user"', 'public.account', 'public.session',
        'public.verification', 'public."rateLimit"', 'public."twoFactor"']) AS relations(name)
    `),
    appDb.query<{ ready: boolean }>(`
      SELECT coalesce(has_column_privilege(to_regclass('crm.audit'), 'event', 'INSERT')
        AND has_column_privilege(to_regclass('crm.audit'), 'status', 'INSERT'), false)
        AND coalesce(has_table_privilege(to_regclass('crm.organizations'), 'SELECT'), false)
        AND coalesce(has_table_privilege(to_regclass('crm.proposals'), 'SELECT'), false)
        AND coalesce(has_table_privilege(to_regclass('crm.beta_activity'), 'INSERT'), false) AS ready
    `),
  ]);
  return Boolean(auth.rows[0]?.ready && commercial.rows[0]?.ready);
}
