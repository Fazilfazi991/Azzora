import { randomUUID, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createHostedHandler } from "./hosted";
import { readFileSync } from "node:fs";
import {
  ReviewConflict,
  type ReviewStore,
  type StoredValue,
} from "./hosted-store";

class MemoryStore implements ReviewStore {
  values = new Map<string, StoredValue<unknown>>();
  async read<T>(path: string): Promise<StoredValue<T> | null> {
    return structuredClone((this.values.get(path) as StoredValue<T>) || null);
  }
  async write<T>(path: string, value: T, version?: string) {
    const old = this.values.get(path);
    if (old ? old.version !== version : Boolean(version))
      throw new ReviewConflict("Concurrent change.");
    this.values.set(path, {
      value: structuredClone(value),
      version: String(Number(old?.version || 0) + 1),
    });
  }
  async remove(path: string, version: string) {
    if (this.values.get(path)?.version !== version)
      throw new ReviewConflict("Concurrent change.");
    this.values.delete(path);
  }
}
const origin = "https://review.example.test";
const password = "fictional-unit-test-password";
const salt = "0".repeat(32);
const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
const setup = () => {
  const store = new MemoryStore();
  return { store, handler: createHostedHandler(store, () => passwordHash) };
};
const request = (
  path: string,
  method = "GET",
  input?: unknown,
  headers: Record<string, string> = {},
) =>
  new Request(`${origin}/api/accounts-review/${path}`, {
    method,
    headers: {
      ...(method === "POST"
        ? { Origin: origin, "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
    ...(input !== undefined ? { body: JSON.stringify(input) } : {}),
  });
async function signIn(handler: (r: Request) => Promise<Response>) {
  const result = await handler(
    request("login", "POST", {
      email: "accountant@review.azzora.test",
      password,
    }),
  );
  expect(result.status).toBe(200);
  const data = await result.json();
  return {
    cookie: result.headers.get("set-cookie")!.split(";")[0],
    csrf: data.csrf as string,
    rawCookie: result.headers.get("set-cookie")!,
  };
}
describe("hosted fictional Accountant boundary", () => {
  it("protects document extraction and drafts with session, CSRF, isolation, revision and idempotency", async () => {
    const { handler } = setup();
    const input = {
      file: {
        name: "fictional.png",
        mime: "image/png",
        data: readFileSync("public/document-samples/01.png").toString("base64"),
      },
    };
    expect(
      (await handler(request("documents/extract", "POST", input))).status,
    ).toBe(401);
    const a = await signIn(handler),
      b = await signIn(handler);
    const headers = { Cookie: a.cookie, "X-Azzora-CSRF": a.csrf };
    expect(
      (
        await handler(
          request("documents/extract", "POST", input, { Cookie: a.cookie }),
        )
      ).status,
    ).toBe(403);
    const extracted = await handler(
      request("documents/extract", "POST", input, headers),
    );
    expect(extracted.status).toBe(200);
    const result = await extracted.json(),
      doc = result.snapshot.documentEntries.reviews[0];
    expect(doc.extraction.mode).toBe("synthetic-replay");
    const key = randomUUID(),
      action = {
        kind: "document-draft",
        reviewId: doc.id,
        revision: 0,
        fields: { ...doc.fields, projectId: "demo-apartment" },
        confirmed: true,
        rememberSupplier: true,
      };
    const writeHeaders = { ...headers, "X-Azzora-Idempotency-Key": key };
    const first = await handler(
      request("action", "POST", action, writeHeaders),
    );
    expect(first.status).toBe(200);
    const saved = await first.json();
    expect(saved.snapshot.documentEntries.reviews[0].status).toBe("Draft");
    expect(saved.snapshot.metrics).toEqual(result.snapshot.metrics);
    const retry = await handler(
      request("action", "POST", action, writeHeaders),
    );
    expect(retry.status).toBe(200);
    expect(
      (await retry.json()).snapshot.documentEntries.reviews[0].corrections,
    ).toHaveLength(1);
    const second = await handler(
      request("documents/extract", "POST", input, headers),
    );
    expect((await second.json()).reused).toBe(true);
    const others = await handler(
      request("snapshot", "GET", undefined, { Cookie: b.cookie }),
    );
    expect((await others.json()).documentEntries.reviews).toEqual([]);
    expect(
      (
        await handler(
          request(`attachment/${doc.attachmentId}`, "GET", undefined, {
            Cookie: b.cookie,
          }),
        )
      ).status,
    ).toBe(404);
    await handler(request("logout", "POST", {}, headers));
    expect(
      (
        await handler(
          request(`attachment/${doc.attachmentId}`, "GET", undefined, {
            Cookie: a.cookie,
          }),
        )
      ).status,
    ).toBe(401);
  });
  it("fails closed without configuration, HTTPS, session, origin or CSRF", async () => {
    const { store, handler } = setup();
    expect(
      (await createHostedHandler(store, () => undefined)(request("snapshot")))
        .status,
    ).toBe(503);
    expect(
      (
        await handler(
          new Request("http://review.example.test/api/accounts-review/session"),
        )
      ).status,
    ).toBe(403);
    expect((await handler(request("snapshot"))).status).toBe(401);
    const session = await signIn(handler);
    expect(session.rawCookie).toContain("Secure; HttpOnly; SameSite=Strict");
    expect(
      (
        await handler(
          request(
            "reset",
            "POST",
            {},
            { Cookie: session.cookie, Origin: "https://other.example" },
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (await handler(request("reset", "POST", {}, { Cookie: session.cookie })))
        .status,
    ).toBe(403);
  });
  it("persists through handler replacement, refreshes and isolates separate logins", async () => {
    const { store, handler } = setup();
    const a = await signIn(handler),
      b = await signIn(handler);
    const action = {
      kind: "invoice",
      party: "Fictional Client D",
      date: "2026-10-22",
      due: "2026-10-22",
      amount: "100.01",
      description: "Design",
      issue: true,
    };
    const headers = {
      Cookie: a.cookie,
      "X-Azzora-CSRF": a.csrf,
      "X-Azzora-Idempotency-Key": randomUUID(),
    };
    expect(
      (await handler(request("action", "POST", action, headers))).status,
    ).toBe(200);
    const next = createHostedHandler(store, () => passwordHash);
    expect(
      (
        await (
          await next(
            request("snapshot", "GET", undefined, { Cookie: a.cookie }),
          )
        ).json()
      ).metrics.revenueFils,
    ).toBe("2010001");
    expect(
      (
        await (
          await next(
            request("snapshot", "GET", undefined, { Cookie: b.cookie }),
          )
        ).json()
      ).metrics.revenueFils,
    ).toBe("2000000");
  });
  it("deduplicates retries and rejects an altered action key", async () => {
    const { handler } = setup();
    const a = await signIn(handler);
    const headers = {
      Cookie: a.cookie,
      "X-Azzora-CSRF": a.csrf,
      "X-Azzora-Idempotency-Key": randomUUID(),
    };
    const action = {
      kind: "receipt",
      documentId: "INV-26042",
      date: "2026-10-22",
      amount: "100.00",
      account: "bank",
    };
    const first = await (
      await handler(request("action", "POST", action, headers))
    ).json();
    const replay = await (
      await handler(request("action", "POST", action, headers))
    ).json();
    expect(replay.id).toBe(first.id);
    expect(replay.snapshot.metrics.receivablesFils).toBe("1490000");
    expect(
      (
        await handler(
          request("action", "POST", { ...action, amount: "200.00" }, headers),
        )
      ).status,
    ).toBe(409);
  });
  it("revokes copied session cookies on logout", async () => {
    const { handler } = setup();
    const a = await signIn(handler);
    expect(
      (
        await handler(
          request(
            "logout",
            "POST",
            {},
            { Cookie: a.cookie, "X-Azzora-CSRF": a.csrf },
          ),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handler(
          request("snapshot", "GET", undefined, { Cookie: a.cookie }),
        )
      ).status,
    ).toBe(401);
  });
  it("keeps uploaded files private to one session and generates marked PDFs", async () => {
    const { handler } = setup();
    const a = await signIn(handler),
      b = await signIn(handler);
    const response = await handler(
      request(
        "action",
        "POST",
        {
          kind: "bill",
          party: "Sample Vendor",
          date: "2026-10-22",
          due: "2026-10-22",
          amount: "50.00",
          category: "Cost of Sales",
          description: "Paint",
          poReference: "DEMO-PO",
          attachment: {
            name: "bill.pdf",
            mime: "application/pdf",
            data: btoa("%PDF-1.4 sample"),
          },
        },
        {
          Cookie: a.cookie,
          "X-Azzora-CSRF": a.csrf,
          "X-Azzora-Idempotency-Key": randomUUID(),
        },
      ),
    );
    const data = await response.json();
    expect(response.status).toBe(200);
    const file = data.snapshot.bills.at(-1).attachmentId;
    expect(
      (
        await handler(
          request(`attachment/${file}`, "GET", undefined, { Cookie: a.cookie }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handler(
          request(`attachment/${file}`, "GET", undefined, { Cookie: b.cookie }),
        )
      ).status,
    ).toBe(404);
    for (const name of ["INV-26041", "pnl", "balance"]) {
      const pdf = await handler(
        request(`pdf/${name}`, "GET", undefined, { Cookie: a.cookie }),
      );
      expect(pdf.headers.get("content-type")).toBe("application/pdf");
      expect((await pdf.text()).startsWith("%PDF-")).toBe(true);
    }
  });
  it("denies a Manager identity and rate limits repeated failed credentials", async () => {
    const { handler } = setup();
    for (let i = 0; i < 5; i++)
      expect(
        (
          await handler(
            request("login", "POST", {
              email: "manager@review.azzora.test",
              password,
            }),
          )
        ).status,
      ).toBe(401);
    expect(
      (
        await handler(
          request("login", "POST", {
            email: "accountant@review.azzora.test",
            password,
          }),
        )
      ).status,
    ).toBe(429);
  });
});
