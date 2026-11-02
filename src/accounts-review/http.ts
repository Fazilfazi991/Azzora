/** Read-only transport helper: financial retries remain an explicit user action. */
export async function accountsRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api/accounts-review${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
  });
  const reference = response.headers.get("X-Azzora-Request-ID");
  const validReference =
    reference &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      reference,
    );
  const suffix =
    response.status >= 500 && validReference ? ` Reference: ${reference}.` : "";
  const result = await response.json().catch(() => {
    throw Error(
      "The review service returned an unreadable response. Please retry." +
        suffix,
    );
  });
  if (!response.ok) throw Error((result?.error || "Request failed.") + suffix);
  return result;
}
