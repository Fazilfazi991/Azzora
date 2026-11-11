// Build preflight only. Never logs secret values or changes Vercel configuration.
import process from "node:process";
import console from "node:console";
import "./generate-staging-schema-bundle.mjs";
const env = process.env;
if (env.VITE_AZZORA_STAGING !== "1" || env.AZZORA_ACCOUNTS_PREVIEW === "1")
  throw Error("Build both independent workspaces in shared staging mode.");
if (
  env.AZZORA_STAGING_SUPABASE_URL !== "https://hkhomrrvxtcxnxvdlkoh.supabase.co"
)
  throw Error("Only the approved fictional Supabase project is allowed.");
if (
  env.AZZORA_AI_ENABLED !== "false" ||
  env.DEEPSEEK_API_KEY ||
  env.AZZORA_REVIEW_PASSWORD_HASH ||
  env.AZZORA_REVIEW_PASSWORD
)
  throw Error(
    "Paid AI and the old shared demo login must not be configured in this project.",
  );
if (
  env.VERCEL_ENV !== "preview" ||
  env.VERCEL_PROJECT_NAME !== "azzora-shared-staging" ||
  env.VERCEL_PROJECT_ID !== env.AZZORA_STAGING_EXPECTED_PROJECT_ID ||
  env.AZZORA_STAGING_DEPLOYMENT_APPROVED !== "true"
)
  throw Error("An explicitly approved dedicated Preview project is required.");
for (const name of [
  "AZZORA_STAGING_PUBLISHABLE_KEY",
  "AZZORA_STAGING_SERVICE_KEY",
  "AZZORA_STAGING_AUTH_KEY",
])
  if (!env[name])
    throw Error("Required server-side staging configuration is missing.");
console.log(
  "Dedicated fictional staging build preflight passed. No production or paid-AI configuration is enabled.",
);
