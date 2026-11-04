import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
const configured = {
  VITE_AZZORA_STAGING: "1",
  AZZORA_STAGING_SUPABASE_URL: "https://hkhomrrvxtcxnxvdlkoh.supabase.co",
  AZZORA_AI_ENABLED: "false",
  VERCEL_ENV: "preview",
  VERCEL_PROJECT_NAME: "azzora-shared-staging",
  VERCEL_PROJECT_ID: "prj_TestOnly",
  AZZORA_STAGING_EXPECTED_PROJECT_ID: "prj_TestOnly",
  AZZORA_STAGING_DEPLOYMENT_APPROVED: "true",
  AZZORA_STAGING_PUBLISHABLE_KEY: "test-publishable-placeholder",
  AZZORA_STAGING_SERVICE_KEY: "test-service-placeholder",
  AZZORA_STAGING_AUTH_KEY: "test-auth-placeholder",
};
function preflight(changes: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, ["scripts/check-staging-build.mjs"], {
    env: { ...configured, ...changes },
    encoding: "utf8",
  });
}
it("permits the explicitly approved isolated Preview configuration without logging secret values", () => {
  const result = preflight();
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).not.toContain(
    configured.AZZORA_STAGING_SERVICE_KEY,
  );
});
it("blocks a wrong database or reused live Vercel project at build time", () => {
  for (const change of [
    { AZZORA_STAGING_SUPABASE_URL: "https://other.supabase.co" },
    { VERCEL_PROJECT_NAME: "azzora" },
    { VERCEL_PROJECT_ID: "prj_Other" },
  ])
    expect(preflight(change).status).not.toBe(0);
});
it("blocks production and publication without explicit approval", () => {
  for (const change of [
    { VERCEL_ENV: "production" },
    { AZZORA_STAGING_DEPLOYMENT_APPROVED: "false" },
  ])
    expect(preflight(change).status).not.toBe(0);
});
it("blocks paid-provider secrets, AI activation and old shared-password login", () => {
  for (const change of [
    { AZZORA_AI_ENABLED: "true" },
    { DEEPSEEK_API_KEY: "test-provider-placeholder" },
    { AZZORA_REVIEW_PASSWORD_HASH: "test-shared-login-placeholder" },
  ])
    expect(preflight(change).status).not.toBe(0);
});
