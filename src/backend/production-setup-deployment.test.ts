import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { productionRuntime } from "./runtime-production.js";

const configured = {
  AZZORA_DEPLOYMENT_MODE: "production-candidate",
  AZZORA_PRODUCTION_ENVIRONMENT_APPROVAL: "OWNER-SETUP-RELEASE-20261113",
  AZZORA_PRODUCTION_SETUP_RELEASE_APPROVED: "true",
  AZZORA_PRODUCTION_SUPABASE_PROJECT_REF: "zwjiztnsxenluqybxhhz",
  AZZORA_PRODUCTION_SUPABASE_URL: "https://zwjiztnsxenluqybxhhz.supabase.co",
  AZZORA_PRODUCTION_COMPANY_ID: "22222222-2222-4222-8222-222222222222",
  AZZORA_PRODUCTION_DATABASE_REGION: "ap-southeast-1",
  AZZORA_PRODUCTION_VERCEL_PROJECT_ID: "prj_SeparateSetupRelease",
  AZZORA_PRODUCTION_PUBLISHABLE_KEY: "sb_publishable_setup-fixture",
  AZZORA_PRODUCTION_SERVICE_KEY: "sb_secret_setup-fixture",
  AZZORA_PRODUCTION_AUTH_KEY: Buffer.alloc(32, 9).toString("base64url"),
  AZZORA_PRODUCTION_ALLOWED_ORIGINS: "https://setup.example.test",
  AZZORA_PRODUCTION_FINANCIAL_POSTING: "false",
  AZZORA_PRODUCTION_REAL_DOCUMENT_PROCESSING: "false",
  VERCEL: "1",
  VERCEL_ENV: "production",
  VERCEL_PROJECT_ID: "prj_SeparateSetupRelease",
  VITE_AZZORA_STAGING: "1",
  VITE_AZZORA_PRODUCTION: "1",
};
function build(changes: Record<string, string | undefined> = {}) {
  return spawnSync(process.execPath, ["scripts/check-production-build.mjs"], {
    env: { ...configured, ...changes },
    encoding: "utf8",
  });
}

it("allows an explicitly authorized separate production setup deployment while retaining disabled posting and external AI", () => {
  const runtime = productionRuntime(configured);
  expect(runtime.financialPostingEnabled).toBe(false);
  expect(runtime.realDocumentProcessingEnabled).toBe(false);
  const result = build();
  expect(result.status).toBe(0);
  expect(result.stdout + result.stderr).not.toContain(
    configured.AZZORA_PRODUCTION_SERVICE_KEY,
  );
  expect(productionRuntime({ ...configured, VERCEL_ENV: "preview" }).mode).toBe(
    "production-candidate",
  );
});

it("requires explicit production setup release authorization in both runtime and build", () => {
  for (const flag of [undefined, "", "false"]) {
    const patch = { AZZORA_PRODUCTION_SETUP_RELEASE_APPROVED: flag };
    expect(() => productionRuntime({ ...configured, ...patch })).toThrow();
    expect(build(patch).status).not.toBe(0);
  }
  for (const patch of [
    { VERCEL_ENV: "development" },
    { VERCEL_PROJECT_ID: "prj_WrongProject" },
    { AZZORA_PRODUCTION_FINANCIAL_POSTING: "true" },
    { AZZORA_PRODUCTION_REAL_DOCUMENT_PROCESSING: "true" },
    { AZZORA_AI_ENABLED: "true" },
    { AZZORA_STAGING_SERVICE_KEY: "sb_secret_staging-fixture" },
  ]) {
    expect(() => productionRuntime({ ...configured, ...patch })).toThrow();
    expect(build(patch).status).not.toBe(0);
  }
});

it("cannot use the setup release authorization to replace existing Manager, client demo or staging projects", () => {
  for (const id of [
    "prj_inNGMsufKkeDUTS1Sn5whmwIVWuw",
    "prj_IvRzemrf0OSGWVBrp6Jm9M9TyAfX",
    "prj_qmXTiKoqwMc2mgJ6QSkYDLrYEoch",
    "prj_yN2NfsBK7vppbc8xb5BpmZat0Ddy",
  ]) {
    const patch = {
      AZZORA_PRODUCTION_VERCEL_PROJECT_ID: id,
      VERCEL_PROJECT_ID: id,
    };
    expect(() => productionRuntime({ ...configured, ...patch })).toThrow();
    expect(build(patch).status).not.toBe(0);
  }
});

it("pins the production API function to Singapore independently of project defaults", () => {
  const config = JSON.parse(
    readFileSync("vercel.production-candidate.json", "utf8"),
  );
  expect(config.functions["api/production.ts"].regions).toEqual(["sin1"]);
});

it("requires the production frontend marker instead of presenting the staging experience", () => {
  expect(build({ VITE_AZZORA_PRODUCTION: undefined }).status).not.toBe(0);
  expect(build({ VITE_AZZORA_PRODUCTION: "0" }).status).not.toBe(0);
});
