import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createPrivateAttachmentStorage,
  type StoredStagingAttachment,
} from "./storage";
import type { ReviewAttachment } from "../accounts-review/domain";

const company = "11111111-1111-4111-8111-111111111111";
const config = {
  url: "https://hkhomrrvxtcxnxvdlkoh.supabase.co",
  serviceKey: "sb_secret_unit_test_only",
  publishableKey: "sb_publishable_unit_test_only",
};
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1]);
const original = (data = png): ReviewAttachment => ({
  id: "attachment",
  name: "Fictional bill.png",
  mime: "image/png",
  data: data.toString("base64"),
  size: data.length,
});
const key = () =>
  `${company}/${createHash("sha256").update(png).digest("hex")}.png`;
const stored = (): StoredStagingAttachment => ({
  ...original(),
  data: "",
  storageObjectKey: key(),
});
describe("server-only private staging originals", () => {
  it("stores immutable deterministic content and strips inline data without returning a public URL", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const storage = createPrivateAttachmentStorage(config, transport);
    expect(await storage.store(company, original())).toEqual(stored());
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe(`${config.url}/storage/v1/object/azzora-private/${key()}`);
    expect(options?.method).toBe("POST");
    expect(options?.headers).toMatchObject({
      apikey: config.serviceKey,
      "Content-Type": "image/png",
      "x-upsert": "false",
    });
    expect(options?.redirect).toBe("error");
    expect(Buffer.from(options!.body as Uint8Array)).toEqual(png);
  });
  it("supports matching data URIs and approved PDF/JPEG signatures with deterministic extensions", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}"));
    const storage = createPrivateAttachmentStorage(config, transport);
    expect(
      (
        await storage.store(company, {
          ...original(),
          data: `data:image/png;base64,${original().data}`,
        })
      ).storageObjectKey,
    ).toBe(key());
    for (const [mime, bytes, extension] of [
      ["application/pdf", Buffer.from("%PDF-1.7\nfictional"), "pdf"],
      ["image/jpeg", Buffer.from([255, 216, 255, 0]), "jpg"],
    ] as const) {
      expect(
        (await storage.store(company, { ...original(bytes), mime }))
          .storageObjectKey,
      ).toMatch(new RegExp(`\\.${extension}$`));
    }
  });
  it("rejects forged MIME/signature, size, base64 and metadata before network access", async () => {
    const transport = vi.fn<typeof fetch>();
    const storage = createPrivateAttachmentStorage(config, transport);
    for (const change of [
      { mime: "text/html" },
      { mime: "application/pdf" },
      { size: 1 },
      { size: 2_000_001 },
      { data: "not base64??" },
      { data: `data:image/jpeg;base64,${original().data}` },
      { name: "unsafe\r\nheader.png" },
    ]) {
      await expect(
        storage.store(company, {
          ...original(),
          ...change,
        } as ReviewAttachment),
      ).rejects.toThrow("staging_attachment_invalid");
    }
    expect(transport).not.toHaveBeenCalled();
  });
  it("reuses an existing object only after downloading and verifying the immutable original", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("private-error-body-not-logged", { status: 400 }),
      )
      .mockResolvedValueOnce(new Response(png));
    expect(
      await createPrivateAttachmentStorage(config, transport).store(
        company,
        original(),
      ),
    ).toEqual(stored());
    expect(transport.mock.calls.map((call) => call[1]?.method)).toEqual([
      "POST",
      "GET",
    ]);
  });
  it("does not overwrite or delete differing bytes at an existing content key", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(Buffer.from("wrong document")));
    await expect(
      createPrivateAttachmentStorage(config, transport).store(
        company,
        original(),
      ),
    ).rejects.toThrow("staging_attachment_integrity_failed");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(
      transport.mock.calls.every(
        (call) => !["PUT", "DELETE"].includes(String(call[1]?.method)),
      ),
    ).toBe(true);
  });
  it("serves validated bytes through the authenticated server transport", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(png));
    const result = await createPrivateAttachmentStorage(config, transport).read(
      company,
      stored(),
    );
    expect(Buffer.from(result.bytes)).toEqual(png);
    expect(result.mime).toBe("image/png");
    expect(result.name).toBe("Fictional bill.png");
  });
  it("rejects cross-company, path traversal and arbitrary object URLs before fetch", async () => {
    const transport = vi.fn<typeof fetch>();
    const storage = createPrivateAttachmentStorage(config, transport);
    for (const storageObjectKey of [
      key().replace(company, "22222222-2222-4222-8222-222222222222"),
      `${company}/../original.png`,
      "https://attacker.test/private.png",
      key().replace(".png", ".pdf"),
    ])
      await expect(
        storage.read(company, { ...stored(), storageObjectKey }),
      ).rejects.toThrow("staging_attachment_access_denied");
    await expect(storage.store("../company", original())).rejects.toThrow(
      "staging_attachment_invalid",
    );
    expect(transport).not.toHaveBeenCalled();
  });
  it("bounds download size and suppresses private provider error bodies", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("private key and data", { status: 500 }),
      )
      .mockResolvedValueOnce(new Response(new Uint8Array(2_000_001)));
    const storage = createPrivateAttachmentStorage(config, transport);
    await expect(storage.read(company, stored())).rejects.toThrow(
      "staging_attachment_service_unavailable",
    );
    await expect(storage.read(company, stored())).rejects.toThrow(
      "staging_attachment_integrity_failed",
    );
  });
});
