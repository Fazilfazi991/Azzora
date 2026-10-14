import { expect, it } from "vitest";
import { resolveAuditUrl } from "./browser-runtime.mjs";

it.each(["AZZORA_URL", "AZZORA_TEST_URL", "QUOTATION_URL"])(
  "accepts isolated target from %s",
  (key) => {
    expect(resolveAuditUrl({ [key]: "http://127.0.0.1:5198/" })).toBe(
      "http://127.0.0.1:5198",
    );
  },
);
it("accepts three consistent normalized target settings", () => {
  expect(
    resolveAuditUrl({
      AZZORA_URL: "http://127.0.0.1:5198",
      AZZORA_TEST_URL: "http://127.0.0.1:5198/",
      QUOTATION_URL: "http://127.0.0.1:5198/",
    }),
  ).toBe("http://127.0.0.1:5198");
});
it("rejects contradictory servers instead of silently testing a different worktree", () => {
  expect(() =>
    resolveAuditUrl({
      AZZORA_URL: "http://127.0.0.1:5198",
      AZZORA_TEST_URL: "http://127.0.0.1:5177",
    }),
  ).toThrow("disagree");
});
it.each([
  "file:///tmp/demo",
  "http://127.0.0.1:5198/#/projects",
  "http://127.0.0.1:5198/?qa=1",
])("rejects non-base target %s", (value) => {
  expect(() => resolveAuditUrl({ AZZORA_URL: value })).toThrow();
});
it("retains the documented default when no target is supplied", () => {
  expect(resolveAuditUrl({})).toBe("http://127.0.0.1:5173");
});
