import { expect, it, vi } from "vitest";
import { stagingRuntimeOrigins } from "./deployment";
const preview = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  AZZORA_AI_GENERAL_DOCUMENTS: "fictional-v1",
  AZZORA_AI_PREVIEW_APPROVED: "true",
  VERCEL_PROJECT_ID: "prj_inNGMsufKkeDUTS1Sn5whmwIVWuw",
  AZZORA_STAGING_EXPECTED_PROJECT_ID: "prj_inNGMsufKkeDUTS1Sn5whmwIVWuw",
  VERCEL_PROJECT_NAME: "azzora-accounts-client-review",
  VERCEL_URL:
    "azzora-accounts-client-review-uncachedqa-faziils-projects.vercel.app",
};
it("accepts only the explicitly approved immutable Accounts Preview origin", () =>
  expect([...stagingRuntimeOrigins(preview)]).toEqual([
    "https://" + preview.VERCEL_URL,
  ]));
it("rejects production, stable aliases, wrongproject and unapproved AIreview publishing", () => {
  for (const change of [
    { VERCEL_ENV: "production" },
    { VERCEL_URL: "azzora-accounts-client-review-faziils-projects.vercel.app" },
    { VERCEL_PROJECT_ID: "prj_wrong" },
    { AZZORA_AI_PREVIEW_APPROVED: "false" },
    { AZZORA_STAGING_ALLOWED_ORIGINS: "https://azzora-seven.vercel.app" },
  ])
    expect(() => stagingRuntimeOrigins({ ...preview, ...change })).toThrow();
});
it("the AIcandidate cannot use the legacy shared-password Accounts API", async () => {
  vi.stubEnv("AZZORA_AI_GENERAL_DOCUMENTS", "fictional-v1");
  try {
    const endpoint = await import("../../api/accounts-review");
    const response = await endpoint.default.fetch(
      new Request(
        "https://" + preview.VERCEL_URL + "/api/accounts-review?route=snapshot",
      ),
    );
    expect(response.status).toBe(404);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("prepares only the exact Accounts alias while retaining the immutable Preview", () => {
  const alias = "https://azzora-accounts-client-review-faziils-projects.vercel.app";
  expect([
    ...stagingRuntimeOrigins({ ...preview, AZZORA_AI_CLIENT_REVIEW_ALIAS: alias }),
  ]).toEqual(["https://" + preview.VERCEL_URL, alias]);
  for (const unsafe of [
    "https://azzora-seven.vercel.app",
    "https://azzora-accounts-client-review-faziils-projects.vercel.app.evil.test",
    alias + ":443",
    alias + "/accountant.html",
    "http://azzora-accounts-client-review-faziils-projects.vercel.app",
    alias + ",https://other.test",
  ])
    expect(() =>
      stagingRuntimeOrigins({ ...preview, AZZORA_AI_CLIENT_REVIEW_ALIAS: unsafe }),
    ).toThrow(/alias/);
  expect(() =>
    stagingRuntimeOrigins({
      ...preview,
      VERCEL_ENV: "production",
      AZZORA_AI_CLIENT_REVIEW_ALIAS: alias,
    }),
  ).toThrow();
});
