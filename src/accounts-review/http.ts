import { stagingEnabled, StagingRequestError } from "../staging/client";

let stagingVersion: number | undefined;
export function accountsUrl(path: string) {
  return `${stagingEnabled ? "/api/staging/accounts" : "/api/accounts-review"}${path}`;
}
/** Transport only: financial retries remain an explicit user action. */
export async function accountsRequest(path: string, options: RequestInit = {}) {
  const actionPost =
    options.method?.toUpperCase() === "POST" &&
    path.split("?")[0] === "/action";
  const uncertainty =
    "Unable to confirm whether the submission was saved. It may already be saved. Retry with the same details, or refresh and check the ledger before submitting again.";
  let response: Response;
  try {
    const authPath =
      stagingEnabled &&
      ["/login", "/session", "/logout"].includes(path.split("?")[0]);
    const address = authPath ? `/api/staging/auth${path}` : accountsUrl(path);
    const headers = new Headers(options.headers);
    if (
      stagingEnabled &&
      options.method?.toUpperCase() === "POST" &&
      !authPath &&
      stagingVersion !== undefined
    )
      headers.set("X-Azzora-Expected-Version", String(stagingVersion));
    response = await fetch(address, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      headers,
    });
  } catch {
    throw Error(
      actionPost
        ? uncertainty
        : "The review service could not be reached. Please retry.",
    );
  }
  const reference = response.headers.get("X-Azzora-Request-ID");
  const validReference =
    reference &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      reference,
    );
  const referenceSuffix = validReference ? ` Reference: ${reference}.` : "";
  const suffix = response.status >= 500 ? referenceSuffix : "";
  const result = await response.json().catch(() => {
    throw Error(
      "The review service returned an unreadable response." +
        (actionPost
          ? ` ${uncertainty}${referenceSuffix}`
          : ` Please retry.${suffix}`),
    );
  });
  if (actionPost && response.status >= 500) throw Error(uncertainty + suffix);
  if (!response.ok) {
    if (stagingEnabled)
      throw new StagingRequestError(
        (result?.error || "Request failed.") + suffix,
        response.status,
      );
    throw Error((result?.error || "Request failed.") + suffix);
  }
  if (stagingEnabled) {
    const version = result?.snapshot?.version ?? result?.version;
    if (Number.isSafeInteger(version)) stagingVersion = version;
  }
  return result;
}
