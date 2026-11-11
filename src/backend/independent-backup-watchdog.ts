/** Candidate only: invoke from a separately hosted scheduler. Gmail acceptance is not mailbox-delivery proof. */
import { checkBackupMonitorReceipt } from "./backup-monitor.js";

export async function sendBackupFailureEmail(input: {
  accessToken: string;
  recipient: string;
  fetchImpl?: typeof fetch;
}) {
  if (
    !input.accessToken ||
    /[\r\n]/.test(input.accessToken) ||
    !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(input.recipient)
  )
    throw Error("Alert authorization or recipient invalid.");
  const message = [
    `To: ${input.recipient}`,
    "Subject: AZZORA backup requires attention",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "The independent backup watchdog could not verify the latest backup. Please inspect the backup system.",
  ].join("\r\n");
  const response = await (input.fetchImpl ?? globalThis.fetch)(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: Buffer.from(message).toString("base64url") }),
      redirect: "error",
    },
  );
  if (!response.ok)
    throw Error("Alert provider did not accept the notification.");
  const result = await response.json();
  if (typeof result.id !== "string" || !result.id)
    throw Error("Alert provider returned an invalid response.");
  return {
    acceptedByProvider: true as const,
    mailboxDeliveryVerified: false as const,
  };
}

/** The remote check must actually download, decrypt and validate the latest archive and restore evidence. */
export async function runIndependentBackupWatchdog(input: {
  receipt: unknown;
  key: Uint8Array;
  expected: {
    companyId: string;
    keyId: string;
    maxBackupAgeSeconds: number;
    maxMonitorAgeSeconds: number;
    now: Date;
  };
  verifyRemoteAndRestore: (backupCapturedAt: string) => Promise<void>;
  sendAlert: () => Promise<void>;
}) {
  try {
    const checked = checkBackupMonitorReceipt(
      input.receipt,
      input.key,
      input.expected,
    );
    await input.verifyRemoteAndRestore(checked.backupCapturedAt);
    return { healthy: true as const, alertRequested: false as const };
  } catch {
    // Alert failures propagate: a caller must not report a notification as delivered.
    await input.sendAlert();
    return {
      healthy: false as const,
      alertRequested: true as const,
      mailboxDeliveryVerified: false as const,
    };
  }
}
