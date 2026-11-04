import { expect, it } from "vitest";
import { stagingRuntimeOrigins } from "./deployment";
const approved = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_PROJECT_ID: "prj_Staging123",
  VERCEL_PROJECT_NAME: "azzora-shared-staging",
  VERCEL_BRANCH_URL: "azzora-shared-staging-git-codex-final-team.vercel.app",
  AZZORA_STAGING_EXPECTED_PROJECT_ID: "prj_Staging123",
  AZZORA_STAGING_DEPLOYMENT_APPROVED: "true",
};
it("trusts the exact system branch origin only after explicit project approval", () =>
  expect([...stagingRuntimeOrigins(approved)]).toEqual([
    "https://" + approved.VERCEL_BRANCH_URL,
  ]));
it("rejects production promotion and missing approval", () => {
  expect(() =>
    stagingRuntimeOrigins({ ...approved, VERCEL_ENV: "production" }),
  ).toThrow(/Preview/);
  expect(() =>
    stagingRuntimeOrigins({
      ...approved,
      AZZORA_STAGING_DEPLOYMENT_APPROVED: "false",
    }),
  ).toThrow(/approved/);
});
it("rejects an existing live project and a mismatched project identity", () => {
  expect(() =>
    stagingRuntimeOrigins({ ...approved, VERCEL_PROJECT_NAME: "azzora" }),
  ).toThrow(/live/);
  expect(() =>
    stagingRuntimeOrigins({ ...approved, VERCEL_PROJECT_ID: "prj_Other" }),
  ).toThrow(/identity/);
});
it("never accepts arbitrary aliases, malicious URLs or missing system origins", () => {
  expect(() =>
    stagingRuntimeOrigins({
      ...approved,
      AZZORA_STAGING_ALLOWED_ORIGINS: "https://azzora-seven.vercel.app",
    }),
  ).toThrow(/non-staging/);
  expect(() =>
    stagingRuntimeOrigins({
      ...approved,
      VERCEL_BRANCH_URL: "azzora-shared-staging-git-evil.vercel.app@evil.test",
    }),
  ).toThrow();
  expect(() =>
    stagingRuntimeOrigins({ ...approved, VERCEL_BRANCH_URL: undefined }),
  ).toThrow();
});
it("keeps local tests on explicitly configured HTTPS loopback", () => {
  expect([
    ...stagingRuntimeOrigins({
      AZZORA_STAGING_ALLOWED_ORIGINS: "https://127.0.0.1:5365",
    }),
  ]).toEqual(["https://127.0.0.1:5365"]);
  for (const url of [
    "http://127.0.0.1:5365",
    "https://other.test",
    "https://localhost:5365/path",
  ])
    expect(() =>
      stagingRuntimeOrigins({ AZZORA_STAGING_ALLOWED_ORIGINS: url }),
    ).toThrow();
});
