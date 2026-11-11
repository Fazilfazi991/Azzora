// REVIEW CANDIDATE: four fictional identities only. Without --apply, performs
// read-only preflight. Never prints keys/passwords or sends invitations.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
if (
  process.argv.slice(2).some((v) => v !== "--apply") ||
  process.argv.slice(2).length > 1
)
  throw Error("Only optional --apply is supported.");
const apply = process.argv[2] === "--apply";
const lines = fs
  .readFileSync("../azzora-launch-integration/.env.staging.local", "utf8")
  .split(/\r?\n/);
const env = Object.fromEntries(
  lines
    .filter((s) => /^[A-Z][A-Z0-9_]*=/.test(s))
    .map((s) => {
      const i = s.indexOf("=");
      let v = s.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      return [s.slice(0, i), v];
    }),
);
const base = env.AZZORA_STAGING_SUPABASE_URL;
if (base !== "https://hkhomrrvxtcxnxvdlkoh.supabase.co")
  throw Error("Wrong project; refused.");
const key = env.AZZORA_STAGING_SERVICE_KEY;
if (!key) throw Error("Missing server credential.");
const roles = ["owner", "manager", "accountant", "engineer"];
const targets = roles.map((role, i) => ({
  role,
  id: String(i + 11).padStart(8, "0") + "-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "company-b-" + role + "@staging.azzora.test",
}));
const headers = { apikey: key, Authorization: "Bearer " + key };
let users = [];
for (let page = 1; page <= 10; page++) {
  const r = await fetch(
    base + "/auth/v1/admin/users?page=" + page + "&per_page=100",
    { headers, redirect: "error" },
  );
  if (!r.ok) throw Error("User inventory unavailable: HTTP " + r.status);
  const body = await r.json();
  if (!Array.isArray(body.users)) throw Error("Invalid user inventory.");
  users.push(...body.users);
  if (body.users.length < 100) break;
  if (page === 10) throw Error("Inventory exceeds limit.");
}
for (const target of targets) {
  const r = await fetch(base + "/auth/v1/admin/users/" + target.id, {
    headers,
    redirect: "error",
  });
  if (![200, 404].includes(r.status))
    throw Error("ID preflight failed: HTTP " + r.status);
  if (
    r.status === 200 ||
    users.some(
      (u) =>
        typeof u.email === "string" && u.email.toLowerCase() === target.email,
    )
  )
    throw Error("A requested ID or email already exists; no changes made.");
}
if (!apply) {
  console.log(
    JSON.stringify({
      stagingOnly: true,
      readOnly: true,
      allFourAvailable: true,
    }),
  );
  process.exit(0);
}
if (process.platform !== "win32")
  throw Error("This helper requires verified Windows ACLs.");
const identity = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
  encoding: "utf8",
  windowsHide: true,
});
const sid = identity.match(/S-1-(?:\d+-)*\d+/)?.[0];
if (!sid) throw Error("Cannot identify current Windows user.");
const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "azzora-company-b-"));
try {
  execFileSync(
    "icacls.exe",
    [
      privateDir,
      "/inheritance:r",
      "/grant:r",
      `*${sid}:(OI)(CI)F`,
      "*S-1-5-18:(OI)(CI)F",
    ],
    { stdio: "ignore", windowsHide: true },
  );
} catch {
  throw Error(
    "Could not set private fixture directory ACL; no accounts created.",
  );
}
// Verify the resulting Windows ACL rather than assuming chmod mode protects it.
// No file content or identity secrets are passed in process arguments.
const aclCheck = String.raw`$p=$env:AZZORA_QA_ACL_PATH; $who=$env:AZZORA_QA_ACL_SID; $a=Get-Acl -LiteralPath $p; $owner=([System.Security.Principal.NTAccount]$a.Owner).Translate([System.Security.Principal.SecurityIdentifier]).Value; if ($owner -ne $who) { exit 15 }; if (-not $a.AreAccessRulesProtected) { exit 11 }; $allowed=@($who,'S-1-5-18'); $seen=@{}; foreach ($rule in $a.Access) { $s=$rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; if ($rule.IsInherited -or $rule.AccessControlType -ne 'Allow' -or $s -notin $allowed) { exit 12 }; if (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { exit 13 }; $seen[$s]=$true }; if (-not $seen[$who] -or -not $seen['S-1-5-18']) { exit 14 }`;
try {
  execFileSync(
    "pwsh.exe",
    ["-NoProfile", "-NonInteractive", "-Command", aclCheck],
    {
      stdio: "ignore",
      windowsHide: true,
      env: {
        ...process.env,
        AZZORA_QA_ACL_PATH: privateDir,
        AZZORA_QA_ACL_SID: sid,
      },
    },
  );
} catch {
  throw Error(
    "Private directory ACL verification failed; no accounts created.",
  );
}
const credentials = targets.map((t) => ({
  ...t,
  password: randomBytes(32).toString("base64url"),
  created: false,
}));
const file = path.join(privateDir, "company-b-fixture-credentials.json");
fs.writeFileSync(
  file,
  JSON.stringify(
    {
      purpose: "isolated-company-b-security-test",
      stagingOnly: true,
      credentials,
    },
    null,
    2,
  ),
  { encoding: "utf8", mode: 0o600, flag: "wx" },
);
const fileAclCheck = String.raw`$p=$env:AZZORA_QA_ACL_PATH; $who=$env:AZZORA_QA_ACL_SID; $a=Get-Acl -LiteralPath $p; $owner=([System.Security.Principal.NTAccount]$a.Owner).Translate([System.Security.Principal.SecurityIdentifier]).Value; if ($owner -ne $who) { exit 15 }; $allowed=@($who,'S-1-5-18'); $seen=@{}; foreach ($rule in $a.Access) { $s=$rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value; if ($rule.AccessControlType -ne 'Allow' -or $s -notin $allowed) { exit 12 }; if (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne [System.Security.AccessControl.FileSystemRights]::FullControl) { exit 13 }; $seen[$s]=$true }; if (-not $seen[$who] -or -not $seen['S-1-5-18']) { exit 14 }`;
try {
  execFileSync(
    "pwsh.exe",
    ["-NoProfile", "-NonInteractive", "-Command", fileAclCheck],
    {
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, AZZORA_QA_ACL_PATH: file, AZZORA_QA_ACL_SID: sid },
    },
  );
} catch {
  throw Error("Credential file ACL verification failed; no accounts created.");
}
let completed = 0;
try {
  for (const target of credentials) {
    let r;
    try {
      r = await fetch(base + "/auth/v1/admin/users", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: target.id,
          email: target.email,
          password: target.password,
          email_confirm: true,
          app_metadata: {
            azzora_scope: "fictional-staging",
            azzora_purpose: "isolated-company-b-security-test",
          },
        }),
        redirect: "error",
      });
    } catch {
      throw Error(
        "Create request outcome uncertain; inspect target ID before any retry.",
      );
    }
    if (!r.ok)
      throw Error(
        "Create request rejected: HTTP " +
          r.status +
          "; no overwrite or retry attempted.",
      );
    let u;
    try {
      u = await r.json();
    } catch {
      throw Error(
        "Created identity response was invalid; inspect before proceeding.",
      );
    }
    if (
      u.id !== target.id ||
      String(u.email).toLowerCase() !== target.email ||
      !u.email_confirmed_at ||
      u.app_metadata?.azzora_scope !== "fictional-staging" ||
      u.app_metadata?.azzora_purpose !== "isolated-company-b-security-test"
    )
      throw Error(
        "Created identity did not match required constraints; inspect before proceeding.",
      );
    target.created = true;
    completed++;
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          purpose: "isolated-company-b-security-test",
          stagingOnly: true,
          credentials,
        },
        null,
        2,
      ),
      { encoding: "utf8", mode: 0o600 },
    );
  }
  console.log(
    JSON.stringify({
      stagingOnly: true,
      created: completed,
      noInvitations: true,
      credentialsFile: file,
      valuesPrinted: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      stagingOnly: true,
      created: completed,
      aborted: true,
      reason: error.message,
      credentialsFile: file,
      valuesPrinted: false,
    }),
  );
  process.exitCode = 1;
}
