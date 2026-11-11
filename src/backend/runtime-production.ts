/** Server-only production-candidate identity. No default project, company or credentials. */
import {
  StagingServiceError,
  type StagingConfig,
} from "../staging/supabase.js";

const fixtureCompany = "11111111-1111-4111-8111-111111111111";
const reviewUser = "52f925bd-8744-48cc-8781-d20109387d14";
const existingAccountsProject = "prj_inNGMsufKkeDUTS1Sn5whmwIVWuw";
/** Owner-created free Singapore project; never inferred from an organization label. */
export const productionProjectRef = "zwjiztnsxenluqybxhhz";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface ProductionRuntime extends StagingConfig {
  mode: "production-candidate";
  projectRef: string;
  companyId: string;
  databaseRegion: string;
  vercelProjectId: string;
  configurationApprovalId: string;
  encryptionKey: string;
  allowedOrigins: ReadonlySet<string>;
  financialPostingEnabled: false;
  realDocumentProcessingEnabled: false;
}
export function productionRuntime(
  env: Record<string, string | undefined> = process.env,
): ProductionRuntime {
  const fail = (code: string): never => {
    throw new StagingServiceError(503, code);
  };
  if (env.AZZORA_DEPLOYMENT_MODE !== "production-candidate")
    fail("production_candidate_configuration_required");
  if (
    [
      "AZZORA_STAGING_SUPABASE_URL",
      "AZZORA_STAGING_PUBLISHABLE_KEY",
      "AZZORA_STAGING_SERVICE_KEY",
      "AZZORA_STAGING_AUTH_KEY",
    ].some((key) => Boolean(env[key]))
  )
    fail("staging_configuration_is_not_production");
  const configurationApprovalId =
    env.AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL || "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(configurationApprovalId))
    fail("production_environment_approval_required");
  const projectRef = env.AZZORA_PRODUCTION_SUPABASE_PROJECT_REF || "";
  const url = env.AZZORA_PRODUCTION_SUPABASE_URL || "";
  if (
    projectRef !== productionProjectRef ||
    url !== `https://${projectRef}.supabase.co`
  )
    fail("production_project_identity_required");
  const companyId = env.AZZORA_PRODUCTION_COMPANY_ID || "";
  if (!uuid.test(companyId) || companyId.toLowerCase() === fixtureCompany)
    fail("production_company_identity_required");
  const databaseRegion = env.AZZORA_PRODUCTION_DATABASE_REGION || "";
  if (databaseRegion !== "ap-southeast-1")
    fail("production_database_region_approval_required");
  const vercelProjectId = env.AZZORA_PRODUCTION_VERCEL_PROJECT_ID || "";
  if (
    !/^prj_[A-Za-z0-9]+$/.test(vercelProjectId) ||
    vercelProjectId === existingAccountsProject ||
    ((env.VERCEL === "1" || env.VERCEL_ENV) &&
      (env.VERCEL_PROJECT_ID !== vercelProjectId ||
        env.VERCEL_ENV !== "preview"))
  )
    fail("production_candidate_project_required");
  const publishableKey = env.AZZORA_PRODUCTION_PUBLISHABLE_KEY || "";
  const serviceKey = env.AZZORA_PRODUCTION_SERVICE_KEY || "";
  if (
    !publishableKey.startsWith("sb_publishable_") ||
    !serviceKey.startsWith("sb_secret_") ||
    publishableKey === serviceKey ||
    publishableKey === env.AZZORA_STAGING_PUBLISHABLE_KEY ||
    serviceKey === env.AZZORA_STAGING_SERVICE_KEY
  )
    fail("separate_production_credentials_required");
  const encryptionKey = env.AZZORA_PRODUCTION_AUTH_KEY || "";
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(encryptionKey) ||
    Buffer.from(encryptionKey, "base64url").length !== 32 ||
    encryptionKey === env.AZZORA_STAGING_AUTH_KEY
  )
    fail("separate_production_session_key_required");
  const values = (env.AZZORA_PRODUCTION_ALLOWED_ORIGINS || "")
    .split(",")
    .filter(Boolean);
  const allowedOrigins = new Set<string>();
  for (const value of values) {
    try {
      const origin = new URL(value);
      if (
        origin.protocol !== "https:" ||
        origin.username ||
        origin.password ||
        origin.pathname !== "/" ||
        origin.search ||
        origin.hash ||
        /(?:azzora-seven|azzora-accounts-client-review)(?:[-.]|$)/.test(
          origin.hostname,
        )
      )
        throw Error();
      allowedOrigins.add(origin.origin);
    } catch {
      fail("approved_production_candidate_origins_required");
    }
  }
  if (!allowedOrigins.size || allowedOrigins.size > 8)
    fail("approved_production_candidate_origins_required");
  if (
    env.AZZORA_PRODUCTION_FINANCIAL_POSTING !== "false" ||
    env.AZZORA_PRODUCTION_REAL_DOCUMENT_PROCESSING !== "false" ||
    env.AZZORA_AI_ENABLED === "true" ||
    env.AZZORA_AI_GENERAL_DOCUMENTS ||
    env.AZZORA_AI_CLIENT_DEMO_APP_CAP
  )
    fail("production_activation_requires_separate_release");
  return {
    mode: "production-candidate",
    projectRef,
    url,
    publishableKey,
    serviceKey,
    companyId: companyId.toLowerCase(),
    databaseRegion,
    vercelProjectId,
    configurationApprovalId,
    encryptionKey,
    allowedOrigins,
    financialPostingEnabled: false,
    realDocumentProcessingEnabled: false,
  };
}
/** Proof comes from the approved database, never HTTP input or editable identity metadata. */
export function assertProductionIdentity(
  value: unknown,
  runtime: ProductionRuntime,
): void {
  if (!value || typeof value !== "object")
    throw new StagingServiceError(503, "production_database_contract_required");
  const v = value as Record<string, unknown>;
  if (
    v.schemaVersion !== 1 ||
    v.contractVersion !== "azzora-canonical-production-v1" ||
    v.environment !== "production" ||
    v.projectRef !== runtime.projectRef ||
    v.companyId !== runtime.companyId ||
    v.region !== runtime.databaseRegion ||
    v.vercelProjectId !== runtime.vercelProjectId ||
    v.configurationApprovalId !== runtime.configurationApprovalId ||
    v.financialPostingEnabled !== false ||
    v.realDocumentProcessingEnabled !== false ||
    v.fictionalData !== false ||
    v.privateStorageBucket !== "azzora-private" ||
    v.backendCommandsInstalled !== true ||
    !Array.isArray(v.allowedOrigins) ||
    v.allowedOrigins.length !== runtime.allowedOrigins.size ||
    v.allowedOrigins.some(
      (o) => typeof o !== "string" || !runtime.allowedOrigins.has(o),
    )
  )
    throw new StagingServiceError(503, "production_database_contract_required");
}
export function assertProductionActor(
  actor: {
    userId: string;
    companyId: string;
    email?: string;
    authenticationPolicy?: string;
  },
  runtime: Pick<ProductionRuntime, "companyId">,
) {
  if (
    actor.companyId !== runtime.companyId ||
    actor.userId === reviewUser ||
    actor.email?.toLowerCase().endsWith("@staging.azzora.test") ||
    actor.authenticationPolicy
  )
    throw new StagingServiceError(403, "production_identity_not_authorized");
  if (
    "role" in actor &&
    !["owner_admin", "project_manager", "accountant", "site_staff"].includes(
      String(actor.role),
    )
  )
    throw new StagingServiceError(403, "production_identity_not_authorized");
}
