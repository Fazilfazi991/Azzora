import process from "node:process";
import console from "node:console";
const e = process.env;
if (
  e.AZZORA_AI_CLIENT_REVIEW_ALIAS &&
  e.AZZORA_AI_CLIENT_REVIEW_ALIAS !==
    "https://azzora-accounts-client-review-faziils-projects.vercel.app"
)
  throw Error("Only the existing Accounts client-review alias may be prepared.");
if (
  e.VERCEL_ENV !== "preview" ||
  e.VERCEL_PROJECT_ID !== "prj_inNGMsufKkeDUTS1Sn5whmwIVWuw" ||
  e.VERCEL_PROJECT_NAME !== "azzora-accounts-client-review" ||
  e.AZZORA_STAGING_EXPECTED_PROJECT_ID !== e.VERCEL_PROJECT_ID ||
  e.AZZORA_AI_PREVIEW_APPROVED !== "true"
)
  throw Error("Only the approved Accounts Preview project is permitted.");
if (
  e.VITE_AZZORA_STAGING !== "1" ||
  e.AZZORA_ACCOUNTS_PREVIEW !== "1" ||
  e.AZZORA_AI_GENERAL_DOCUMENTS !== "fictional-v1" ||
  e.AZZORA_AI_CLIENT_DEMO_APP_CAP !== "5" ||
  e.AZZORA_AI_PROVIDER !== "deepseek" ||
  e.DEEPSEEK_MODEL !== "deepseek-flash"
)
  throw Error(
    "Fictional general-document Accounts review configuration is required.",
  );
if (
  e.AZZORA_STAGING_SUPABASE_URL !== "https://hkhomrrvxtcxnxvdlkoh.supabase.co"
)
  throw Error("Only the authorized fictional database is permitted.");
for (const name of [
  "AZZORA_STAGING_PUBLISHABLE_KEY",
  "AZZORA_STAGING_SERVICE_KEY",
  "AZZORA_STAGING_AUTH_KEY",
  "DEEPSEEK_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
])
  if (!e[name])
    throw Error("Required private server configuration is missing.");
console.log(
  "Authenticated fictional document Preview preflight passed. Real company processing remains disabled.",
);
