// Explicit fictional staging bootstrap. Run manually; never imported by browser/app.
// Provider accounts are created using the supported Auth Admin API, not managed-table SQL.
import { randomBytes } from "node:crypto";
import process from "node:process";
import { URL } from "node:url";
import console from "node:console";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
const envPath = new URL("../../.env.staging.local", import.meta.url);
process.loadEnvFile(envPath);
const url = process.env.AZZORA_STAGING_SUPABASE_URL;
const key = process.env.AZZORA_STAGING_SERVICE_KEY;
if (url !== "https://hkhomrrvxtcxnxvdlkoh.supabase.co" || !key)
  throw Error("Approved staging configuration is required.");
if (!process.env.AZZORA_STAGING_AUTH_KEY) {
  await appendFile(
    envPath,
    "\nAZZORA_STAGING_AUTH_KEY=" + randomBytes(32).toString("base64url") + "\n",
  );
}
const privatePath = new URL(
  "../../tmp/private-staging-identities.json",
  import.meta.url,
);
await mkdir(new URL("../../tmp/", import.meta.url), { recursive: true });
let stored = {};
try {
  stored = JSON.parse(await readFile(privatePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT")
    throw Error("Private identity file is unreadable.");
}
async function admin(path, method = "GET", body) {
  const response = await globalThis.fetch(url + "/auth/v1/admin" + path, {
    method,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: globalThis.AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw Error(
      "Staging Auth Admin request failed (HTTP " + response.status + ").",
    );
  return response.json();
}
const users = [];
for (let page = 1; page <= 10; page++) {
  const data = await admin("/users?page=" + page + "&per_page=100");
  const batch = data.users || [];
  users.push(...batch);
  if (batch.length < 100) break;
}
let created = 0,
  reused = 0;
for (const [name, role] of [
  ["owner", "owner_admin"],
  ["manager", "project_manager"],
  ["accountant", "accountant"],
  ["engineer", "site_staff"],
]) {
  const email = name + "@staging.azzora.test";
  const existing = users.find((u) => u.email === email);
  if (existing) {
    if (!stored[name]?.password || stored[name].userId !== existing.id)
      throw Error(
        "An existing fixture account lacks its original private credential. No password was reset.",
      );
    reused++;
    continue;
  }
  const password = randomBytes(24).toString("base64url") + "!aA7";
  const user = await admin("/users", "POST", {
    email,
    password,
    email_confirm: true,
    app_metadata: { azzora_scope: "fictional-staging" },
    user_metadata: { display_name: "Fictional " + name },
  });
  if (!user.id) throw Error("Provider did not return the created identity.");
  stored[name] = { email, password, userId: user.id, role };
  await writeFile(privatePath, JSON.stringify(stored, null, 2), {
    mode: 0o600,
  });
  created++;
}
console.log(
  JSON.stringify({
    fictionalAccountsCreated: created,
    existingAccountsReused: reused,
    passwordsReset: 0,
    privateCredentialFile: "tmp/private-staging-identities.json",
    authEncryptionConfigured: true,
  }),
);
if (process.argv.includes("--memberships")) {
  for (const entry of Object.values(stored)) {
    const response = await globalThis.fetch(
      url + "/rest/v1/rpc/staging_auth_fixture_membership",
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_user_id: entry.userId,
          p_company_id: "11111111-1111-4111-8111-111111111111",
          p_role: entry.role,
        }),
        redirect: "error",
        signal: globalThis.AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw Error(
        "Fictional membership bootstrap failed (HTTP " +
          response.status +
          "). No existing membership was overwritten.",
      );
  }
  console.log(
    JSON.stringify({
      fictionalMembershipsVerified: Object.keys(stored).length,
      realPostingEnabled: false,
    }),
  );
}
