export function backupFailureMessage(code?: string): string {
  if (code === "backup_recent_mfa_required")
    return "Sign out and sign in again with your authenticator, then retry.";
  if (
    [
      "staging_owner_backup_key_required",
      "production_owner_backup_key_required",
      "production_backup_adapter_required",
    ].includes(code || "")
  )
    return "Encrypted backup is not configured. No file was downloaded.";
  return "Backup could not be downloaded. Check your sign-in and try again.";
}
