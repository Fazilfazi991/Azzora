import { expect, it } from "vitest";
import { createStagingRpc, stagingConfig } from "./supabase";
const config = {
  url: "https://hkhomrrvxtcxnxvdlkoh.supabase.co",
  publishableKey: "sb_publishable_fixture",
  serviceKey: "sb_secret_fixture",
};
it("binds credentials only to the approved staging project", () => {
  expect(() =>
    stagingConfig({
      AZZORA_STAGING_SUPABASE_URL: "https://other.supabase.co",
      AZZORA_STAGING_PUBLISHABLE_KEY: config.publishableKey,
      AZZORA_STAGING_SERVICE_KEY: config.serviceKey,
    }),
  ).toThrow("staging_configuration_required");
});
it("rejects a publishable credential substituted for server authorization", () => {
  expect(() =>
    stagingConfig({
      AZZORA_STAGING_SUPABASE_URL: config.url,
      AZZORA_STAGING_PUBLISHABLE_KEY: config.publishableKey,
      AZZORA_STAGING_SERVICE_KEY: config.publishableKey,
    }),
  ).toThrow("staging_server_credentials_required");
});
it("does not forward financial SQL error details or retry uncertain writes", async () => {
  let calls = 0;
  const call = createStagingRpc(config, (async () => {
    calls++;
    return Response.json(
      { code: "XX000", message: "private supplier details and a credential" },
      { status: 500 },
    );
  }) as typeof fetch);
  await expect(call("staging_company_commit", {})).rejects.toThrow(
    "staging_service_unavailable",
  );
  expect(calls).toBe(1);
});
it("keeps conflicts explicit and avoids exposing server credentials in URLs", async () => {
  const call = createStagingRpc(config, (async (url, options) => {
    expect(String(url)).not.toContain(config.serviceKey);
    expect(new Headers(options?.headers).get("apikey")).toBe(config.serviceKey);
    return Response.json({ code: "PT409" }, { status: 409 });
  }) as typeof fetch);
  await expect(call("staging_company_commit")).rejects.toThrow(
    "staging_version_conflict",
  );
});
it("does not allow a generic SQL or arbitrary public RPC transport", async () => {
  const call = createStagingRpc(config, (() => {
    throw Error("must not call");
  }) as typeof fetch);
  await expect(call("execute_sql", {})).rejects.toThrow(
    "unsupported_staging_rpc",
  );
});
