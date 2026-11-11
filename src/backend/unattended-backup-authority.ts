/** Isolated candidate; not connected to any network API or deployed runtime. */
import type { CaptureAuthority } from "./unattended-backup.js";

type IsolatedSql = {
  query(
    sql: string,
    params: unknown[],
  ): Promise<{ rows: Array<{ allowed: boolean }> }>;
};

/** Query time is intentionally not supplied: PostgreSQL owns the expiry clock. */
export function createIsolatedSqlBackupAuthority(
  db: IsolatedSql,
): CaptureAuthority {
  return {
    async begin(input) {
      const { rows } = await db.query(
        "select azzora_backup_candidate.begin_capture($1::uuid,$2::uuid,$3::uuid,$4::text) as allowed",
        [input.companyId, input.grantId, input.requestId, input.credentialHash],
      );
      return rows.length === 1 && rows[0].allowed === true;
    },
    async finish(input) {
      const { rows } = await db.query(
        "select azzora_backup_candidate.finish_capture($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text) as allowed",
        [
          input.companyId,
          input.grantId,
          input.requestId,
          input.credentialHash,
          input.outcome,
        ],
      );
      return rows.length === 1 && rows[0].allowed === true;
    },
  };
}
