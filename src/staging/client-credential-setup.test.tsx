import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

afterEach(() => {
  vi.doUnmock("./client");
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
it("removes a private setup proof from the URL immediately, tolerates StrictMode initialization and clears it after use", async () => {
  vi.stubEnv("VITE_AZZORA_PRODUCTION", "1");
  vi.doMock("./client", () => ({ productionEnabled: true }));
  const proof = "f".repeat(64),
    replaceState = vi.fn();
  vi.stubGlobal("location", {
    hash: "#setup_token=" + proof,
    pathname: "/accountant.html",
    search: "",
  });
  vi.stubGlobal("history", { replaceState });
  const module = await import("./client-credential-setup");
  expect(module.consumeProductionSetupLink()).toBe(proof);
  expect(replaceState).toHaveBeenCalledWith(null, "", "/accountant.html");
  expect(module.consumeProductionSetupLink()).toBe(proof);
  expect(replaceState).toHaveBeenCalledTimes(1);
  module.clearProductionSetupLink();
  expect(module.consumeProductionSetupLink()).toBe("");
});
it("renders private password entry without disclosing the proof or claiming an authenticated application session", async () => {
  const { ProductionCredentialSetup } =
    await import("./client-credential-setup");
  const proof = "f".repeat(64),
    html = renderToStaticMarkup(
      <ProductionCredentialSetup tokenHash={proof} onComplete={() => {}} />,
    );
  expect(html).not.toContain(proof);
  expect(html).toContain('type="password"');
  expect(html).toContain('autoComplete="new-password"');
  expect(html).toContain("Choose your password");
});
