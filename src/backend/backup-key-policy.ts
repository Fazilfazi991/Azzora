/** Never log these inputs: equivalent noncanonical encodings may decode to the same secret. */
export function isDistinctBackupKey(
  raw: string,
  otherSecrets: (string | undefined)[],
): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return false;
  const bytes = Buffer.from(raw, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== raw) return false;
  return otherSecrets.every((other) => {
    if (!other) return true;
    if (raw === other) return false;
    return (
      !/^[A-Za-z0-9_-]{43}$/.test(other) ||
      !bytes.equals(Buffer.from(other, "base64url"))
    );
  });
}
