import { useState } from "react";
import type { Store } from "../store";
import { backupFailureMessage } from "./manual-backup-message";
import { productionEnabled } from "../staging/client";

export function ManualBackup({ store }: { store: Store }) {
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupNotice, setBackupNotice] = useState("");
  const [backupError, setBackupError] = useState("");
  async function downloadBackup() {
    setBackupNotice("");
    setBackupError("");
    setBackupBusy(true);
    try {
      const response = await fetch("/api/staging/manager/backup/encrypted", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          code?: string;
        };
        throw Error(
          productionEnabled && result.code === "backup_recent_mfa_required"
            ? "Sign out and sign in again with your password, then retry."
            : backupFailureMessage(result.code),
        );
      }
      const envelope = (await response.json()) as {
        format?: string;
        algorithm?: string;
        ciphertext?: string;
      };
      if (
        envelope.format !== "azzora-encrypted-business-backup-v1" ||
        envelope.algorithm !== "AES-256-GCM" ||
        !envelope.ciphertext
      )
        throw Error(
          "The server did not return an encrypted business backup. Nothing was downloaded.",
        );
      const blob = new Blob([JSON.stringify(envelope)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "AZZORA-business-backup.encrypted.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBackupNotice(
        "Encrypted business backup download started. Verify the file and keep its recovery key separately.",
      );
    } catch (error) {
      setBackupError(
        error instanceof Error
          ? error.message
          : "Backup could not be downloaded.",
      );
    } finally {
      setBackupBusy(false);
    }
  }
  return (
    <>
      {store.mode === "staging" && store.actor?.role === "owner_admin" && (
        <section className="panel" aria-labelledby="backup-heading">
          <h2 id="backup-heading">Backup &amp; Restore</h2>
          <p>
            Download an encrypted business archive. A recent{" "}
            {productionEnabled ? "password" : "authenticator"} sign-in is
            required.
          </p>
          <p className="muted">
            The archive does not include database schema, migration history or
            sign-in accounts. It is not a complete disaster-recovery backup.
          </p>
          <p>
            Last verified backup: Not available. A download alone does not
            verify a restore.
          </p>
          <button
            type="button"
            className="primary"
            disabled={backupBusy}
            onClick={() => void downloadBackup()}
          >
            {backupBusy ? "Preparing backup…" : "Download Backup"}
          </button>
          {backupNotice && <p role="status">{backupNotice}</p>}
          {backupError && <p role="alert">{backupError}</p>}
        </section>
      )}
    </>
  );
}
