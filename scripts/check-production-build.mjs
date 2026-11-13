import process from "node:process";
import console from "node:console";
// Mirror the runtime's public identity checks without reading or logging private values.
const e = process.env;
const ref = e.AZZORA_PRODUCTION_SUPABASE_PROJECT_REF;
if (
  [
    "AZZORA_STAGING_SUPABASE_URL",
    "AZZORA_STAGING_PUBLISHABLE_KEY",
    "AZZORA_STAGING_SERVICE_KEY",
    "AZZORA_STAGING_AUTH_KEY",
  ].some((key) => Boolean(e[key]))
)
  throw Error(
    "Staging credentials/configuration cannot be copied into a production candidate.",
  );
if (
  e.AZZORA_DEPLOYMENT_MODE !== "production-candidate" ||
  !(
    e.VERCEL_ENV === "preview" ||
    (e.VERCEL_ENV === "production" &&
      e.AZZORA_PRODUCTION_SETUP_RELEASE_APPROVED === "true")
  ) ||
  !/^prj_[A-Za-z0-9]+$/.test(e.AZZORA_PRODUCTION_VERCEL_PROJECT_ID || "") ||
  e.VERCEL_PROJECT_ID !== e.AZZORA_PRODUCTION_VERCEL_PROJECT_ID ||
  [
    "prj_inNGMsufKkeDUTS1Sn5whmwIVWuw",
    "prj_IvRzemrf0OSGWVBrp6Jm9M9TyAfX",
    "prj_qmXTiKoqwMc2mgJ6QSkYDLrYEoch",
    "prj_yN2NfsBK7vppbc8xb5BpmZat0Ddy",
  ].includes(e.VERCEL_PROJECT_ID) ||
  ref !== "zwjiztnsxenluqybxhhz" ||
  ref === "hkhomrrvxtcxnxvdlkoh" ||
  e.AZZORA_PRODUCTION_SUPABASE_URL !== `https://${ref}.supabase.co` ||
  !e.AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL ||
  !e.AZZORA_PRODUCTION_COMPANY_ID ||
  e.AZZORA_PRODUCTION_DATABASE_REGION !== "ap-southeast-1" ||
  !e.AZZORA_PRODUCTION_ALLOWED_ORIGINS ||
  e.VITE_AZZORA_STAGING !== "1" ||
  e.AZZORA_ACCOUNTS_PREVIEW === "1" ||
  e.AZZORA_PRODUCTION_FINANCIAL_POSTING !== "false" ||
  e.AZZORA_PRODUCTION_REAL_DOCUMENT_PROCESSING !== "false" ||
  e.AZZORA_AI_ENABLED === "true" ||
  e.AZZORA_AI_GENERAL_DOCUMENTS ||
  e.AZZORA_AI_CLIENT_DEMO_APP_CAP
)
  throw Error(
    "Only the separately approved, isolated production candidate with posting and external AI disabled may be built.",
  );
for (const key of [
  "AZZORA_PRODUCTION_PUBLISHABLE_KEY",
  "AZZORA_PRODUCTION_SERVICE_KEY",
  "AZZORA_PRODUCTION_AUTH_KEY",
])
  if (!e[key] || e[key] === e[key.replace("PRODUCTION", "STAGING")])
    throw Error("Separate production server credentials are required.");
console.log(
  "Production-candidate build boundary passed. This does not authorize real financial posting or real-document AI.",
);
