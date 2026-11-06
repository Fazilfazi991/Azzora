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
