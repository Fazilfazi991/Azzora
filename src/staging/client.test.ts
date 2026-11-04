import { afterEach, describe, expect, it, vi } from "vitest";
import { seed } from "../domain/seed";
import { blankQuotation } from "../quotation/seed";
import { quotationIntent } from "./client-provider";
import { runStoreCommand, type Store } from "../store";
import { stagingJson, stagingRequest, StagingRequestError } from "./client";

afterEach(() => vi.unstubAllGlobals());
describe("shared staging UI write boundaries", () => {
  function fixture() {
    const db = seed();
    db.quotations = [blankQuotation("STAGING-TEST")];
    return db;
  }
  it("translates a draft edit into a finite command without a database patch", () => {
    const previous = fixture(),
      next = structuredClone(previous);
    next.quotations[0].project.name = "Fictional apartment";
    const intent = quotationIntent(previous, next);
    expect(intent?.kind).toBe("quotation.save");
    expect(Object.keys(intent?.payload as object)).toEqual(["quotation"]);
    expect(previous.quotations[0].project.name).not.toBe("Fictional apartment");
  });
  it("refuses unrelated writes and immutable accepted-quotation content edits", () => {
    const previous = fixture(),
      next = structuredClone(previous);
    next.people[0].name = "Do not replace company";
    next.quotations[0].project.name = "New text";
    expect(quotationIntent(previous, next)).toBeNull();
    previous.quotations[0].status = "Accepted";
    const accepted = structuredClone(previous);
    accepted.quotations[0].project.name = "Changed history";
    expect(quotationIntent(previous, accepted)).toBeNull();
  });
  it("uses lifecycle commands for status changes and rejects batch deletion", () => {
    const previous = fixture(),
      next = structuredClone(previous);
    next.quotations[0].status = "Finalized";
    expect(quotationIntent(previous, next)).toMatchObject({
      kind: "quotation.status",
      payload: { id: previous.quotations[0].id, status: "Finalized" },
    });
    previous.quotations.push(blankQuotation("SECOND"));
    expect(
      quotationIntent(previous, { ...previous, quotations: [] }),
    ).toBeNull();
  });
  it("never falls back to a local mutation when staging transport is unavailable", async () => {
    const mutate = vi.fn();
    const store = { mode: "staging", mutate } as unknown as Store;
    await expect(
      runStoreCommand(store, "customer.save", {}, () => {}),
    ).rejects.toThrow("No browser data was changed");
    expect(mutate).not.toHaveBeenCalled();
  });
  it("awaits staging confirmation and retains local mode behavior", async () => {
    const mutate = vi.fn().mockReturnValue(true),
      command = vi.fn().mockResolvedValue(false);
    const local = vi.fn();
    const store = { mode: "staging", mutate, command } as unknown as Store;
    expect(
      await runStoreCommand(store, "invoice.issue", { id: "one" }, local),
    ).toBe(false);
    expect(mutate).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
    store.mode = "local";
    expect(
      await runStoreCommand(store, "invoice.issue", { id: "one" }, local),
    ).toBe(true);
    expect(mutate).toHaveBeenCalledWith(local, undefined);
  });
  it("uses cookie-based requests and explicit CSRF, without retrying failed writes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('{"error":"Version conflict"}', { status: 409 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      stagingRequest(
        "/manager/command",
        stagingJson({ kind: "invoice.issue" }, "csrf-test"),
      ),
    ).rejects.toBeInstanceOf(StagingRequestError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/staging/manager/command");
    expect(fetch.mock.calls[0][1]).toMatchObject({
      credentials: "same-origin",
      cache: "no-store",
      headers: { "X-Azzora-CSRF": "csrf-test" },
    });
  });
});
