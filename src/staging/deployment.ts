/** Server-only deployment boundary; request Host/Origin never creates trust. */
const slug = "azzora-shared-staging";
function origin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("Use an exact HTTPS staging origin.");
  return url.origin;
}
export function stagingRuntimeOrigins(
  env: Record<string, string | undefined> = process.env,
): ReadonlySet<string> {
  const configured = (env.AZZORA_STAGING_ALLOWED_ORIGINS || "")
    .split(",")
    .filter(Boolean)
    .map(origin);
  if (env.VERCEL === "1" || env.VERCEL_ENV) {
    // Keep the immutable Preview origin. A prepared client release can opt in
    // to the one existing Accounts alias; this never assigns or promotes it.
    if (env.AZZORA_AI_GENERAL_DOCUMENTS === "fictional-v1") {
      if (
        env.VERCEL_ENV !== "preview" ||
        env.AZZORA_AI_PREVIEW_APPROVED !== "true" ||
        env.VERCEL_PROJECT_ID !== "prj_inNGMsufKkeDUTS1Sn5whmwIVWuw" ||
        env.VERCEL_PROJECT_NAME !== "azzora-accounts-client-review" ||
        env.AZZORA_STAGING_EXPECTED_PROJECT_ID !== env.VERCEL_PROJECT_ID
      )
        throw Error(
          "Only the approved isolated Accounts AI Preview may process fictional test documents.",
        );
      const host = env.VERCEL_URL || "";
      if (
        !/^azzora-accounts-client-review-[a-z0-9]+-faziils-projects\.vercel\.app$/.test(
          host,
        )
      )
        throw Error("An immutable Accounts Preview origin is required.");
      if (configured.length)
        throw Error(
          "The AI candidate does not accept stable or user-selected aliases.",
        );
      const clientAlias = env.AZZORA_AI_CLIENT_REVIEW_ALIAS;
      if (
        clientAlias &&
        clientAlias !==
          "https://azzora-accounts-client-review-faziils-projects.vercel.app"
      )
        throw Error("Only the existing Accounts client-review alias is permitted.");
      return new Set([`https://${host}`, ...(clientAlias ? [clientAlias] : [])]);
    }
    if (
      env.VERCEL_ENV !== "preview" ||
      env.AZZORA_STAGING_DEPLOYMENT_APPROVED !== "true"
    )
      throw Error(
        "Only an Owner-approved protected Preview can run shared staging.",
      );
    const expected = env.AZZORA_STAGING_EXPECTED_PROJECT_ID;
    if (
      !expected ||
      !/^prj_[a-zA-Z0-9]+$/.test(expected) ||
      expected !== env.VERCEL_PROJECT_ID
    )
      throw Error("The dedicated staging project identity is not configured.");
    if (env.VERCEL_PROJECT_NAME !== slug)
      throw Error("Existing live projects cannot run this staging handler.");
    // Branch URL remains stable across rebuilds and works with Standard Protection.
    // VERCEL_URL is deliberately not trusted/required for this protection mode.
    const host = env.VERCEL_BRANCH_URL || "";
    if (
      !/^[a-z0-9-]+\.vercel\.app$/.test(host) ||
      !host.startsWith(slug + "-git-")
    )
      throw Error("The protected staging branch origin is unavailable.");
    if (
      configured.some(
        (v) =>
          !new URL(v).hostname.startsWith(slug + "-") ||
          !new URL(v).hostname.endsWith(".vercel.app"),
      )
    )
      throw Error("A non-staging alias was configured.");
    return new Set([`https://${host}`, ...configured]);
  }
  if (
    !configured.length ||
    configured.some(
      (v) => !["127.0.0.1", "localhost"].includes(new URL(v).hostname),
    )
  )
    throw Error("Local staging requires explicit loopback HTTPS origins.");
  return new Set(configured);
}
