import { expect, it, vi } from "vitest";
import {
  createProductionRpc,
  createStagingRpc,
  stagingConfig,
} from "./supabase";
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
it("logs only allowlisted upstream failure metadata without changing staging responses", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    let calls = 0;
    const call = createStagingRpc(config, (async () => {
      calls++;
      return Response.json(
        { code: "57014", message: "private document and credential" },
        { status: 500 },
      );
    }) as typeof fetch);
    await expect(
      call("staging_company_commit", { private: "never log" }),
    ).rejects.toThrow("staging_service_unavailable");
    expect(calls).toBe(1);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: "staging_rpc_upstream_failure",
        status: 500,
        code: "57014",
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /private|credential|never log/,
    );
    log.mockClear();
    const unknown = createStagingRpc(config, (async () =>
      Response.json(
        { code: "private secret", message: "sensitive" },
        { status: 418 },
      )) as typeof fetch);
    await expect(unknown("staging_company_commit")).rejects.toThrow(
      "staging_service_unavailable",
    );
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: "staging_rpc_upstream_failure",
        status: "other",
        code: "other",
      }),
    );
    log.mockClear();
    const offline = createStagingRpc(config, (async () => {
      throw Error("private network details");
    }) as typeof fetch);
    await expect(offline("staging_company_commit")).rejects.toThrow(
      "staging_service_unavailable",
    );
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: "staging_rpc_transport_failure",
        failure: "network_failure",
      }),
    );
    log.mockClear();
    const prod = createProductionRpc(config, (async () =>
      Response.json({ code: "57014" }, { status: 500 })) as typeof fetch);
    await expect(prod("staging_company_commit")).rejects.toThrow(
      "staging_service_unavailable",
    );
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
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
it.each([204, 200])(
  "accepts a successful void RPC with HTTP %s and an empty body",
  async (status) => {
    let calls = 0;
    const call = createStagingRpc(config, (async () => {
      calls++;
      return new Response(null, { status });
    }) as typeof fetch);
    await expect(call("staging_auth_pending_put", {})).resolves.toBeUndefined();
    expect(calls).toBe(1);
  },
);
it("rejects invalid success JSON with a safe error and no automatic retry", async () => {
  let calls = 0;
  const call = createStagingRpc(config, (async () => {
    calls++;
    return new Response("private SQL response that is not JSON", {
      status: 200,
    });
  }) as typeof fetch);
  await expect(call("staging_auth_session_get", {})).rejects.toThrow(
    "staging_response_invalid",
  );
  expect(calls).toBe(1);
});
