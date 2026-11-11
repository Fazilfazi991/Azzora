/** Server-only SQL adapter over the existing canonical database. No second database or posting engine. */
import type {
  ApprovedImportReview,
  ImportQueueRepository,
  ImportQueueTransaction,
} from "./import-plan.js";
export interface ImportSqlConnection {
  query<T = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}
export interface ImportSqlDatabase {
  transaction<T>(
    fn: (connection: ImportSqlConnection) => Promise<T>,
  ): Promise<T>;
}
type CurrentOwner = Awaited<ReturnType<ImportQueueTransaction["currentOwner"]>>;
/** resolveOwner must lock/revalidate the real session/membership within this same transaction. */
export function createImportQueueRepository(
  database: ImportSqlDatabase,
  resolveOwner: (connection: ImportSqlConnection) => Promise<CurrentOwner>,
): ImportQueueRepository {
  return {
    transaction: (companyId, execute) =>
      database.transaction(async (connection) => {
        const row = (
          await connection.query<{ version: string | number }>(
            "select version from azzora.companies where id=$1 for update",
            [companyId],
          )
        ).rows[0];
        if (!row) throw Error("Import target company does not exist.");
        const owner = await resolveOwner(connection);
        const tx: ImportQueueTransaction = {
          currentOwner: async () => owner,
          version: async () => Number(row.version),
          receipt: async (key) => {
            const r = (
              await connection.query<{
                result: Record<string, unknown>;
                actor_id: string;
                request_sha256: string;
              }>(
                "select result,actor_id,request_sha256 from azzora.command_receipts where company_id=$1 and idempotency_key=$2",
                [companyId, key],
              )
            ).rows[0];
            if (!r) return null;
            return {
              sha256:
                r.result.kind === "import-review"
                  ? r.request_sha256
                  : "invalid-scope",
              batchId: String(r.result.batchId || ""),
              actorId: r.actor_id,
            };
          },
          stage: async (batchId: string, review: ApprovedImportReview) => {
            await connection.query(
              "insert into azzora.migration_batches(company_id,id,source_sha256,manifest,status) values($1,$2,$3,$4::jsonb,'approved')",
              [
                companyId,
                batchId,
                review.review.originalSha256,
                JSON.stringify(review),
              ],
            );
          },
          recordReceipt: async (key, result) => {
            await connection.query(
              "insert into azzora.command_receipts(company_id,idempotency_key,request_sha256,actor_id,result) values($1,$2,$3,$4,$5::jsonb)",
              [
                companyId,
                key,
                result.sha256,
                result.actorId,
                JSON.stringify({
                  kind: "import-review",
                  batchId: result.batchId,
                  publication: "quarantined",
                }),
              ],
            );
            await connection.query(
              "insert into azzora.audit_events(company_id,actor_id,action,entity_type,entity_id,request_id,metadata) values($1,$2,'migration.review-staged','migration_batch',$3,$4,$5::jsonb)",
              [
                companyId,
                result.actorId,
                result.batchId,
                key,
                JSON.stringify({
                  publication: "quarantined",
                  financialPostingAllowed: false,
                }),
              ],
            );
          },
          bumpVersion: async () => {
            await connection.query(
              "update azzora.companies set version=version+1 where id=$1",
              [companyId],
            );
          },
        };
        return execute(tx);
      }),
  };
}
