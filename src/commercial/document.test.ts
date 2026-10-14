import { expect, it, vi } from "vitest";
import { initializeOperations } from "../operations/migration";
import { tabularPdf, invoicePdf } from "./document";
import { seed } from "../domain/seed";
import { blankInvoice, saveInvoice, issueInvoice } from "./repository";
const pdfText = async (output: string) =>
  (
    await Promise.all(
      [...output.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map(
        async (match) => {
          try {
            const bytes = Uint8Array.from(match[1], (character) =>
              character.charCodeAt(0),
            );
            return await new Response(
              new Blob([bytes])
                .stream()
                .pipeThrough(new DecompressionStream("deflate")),
            ).text();
          } catch {
            return "";
          }
        },
      ),
    )
  ).join("\n");

it("paginates long financial tables and retains the last row", async () => {
  const rows = Array.from({ length: 100 }, (_, index) => [
    "Invoice " + index,
    "Detailed scope of work and installation ".repeat(5),
    "105.00",
  ]);
  const pdf = await tabularPdf("Invoice Register", "AZZORA · QA", {
    headers: ["Invoice", "Description", "Total AED"],
    rows,
  });
  expect(pdf.getNumberOfPages()).toBeGreaterThan(2);
  expect(await pdfText(pdf.output())).toContain("Invoice 99");
  expect(await pdfText(pdf.output())).toContain("Commercial record");
});
it("splits an exceptionally long single table cell across pages", async () => {
  const pdf = await tabularPdf("Invoice", "QA", {
    headers: ["Description", "Amount"],
    rows: [
      ["Long project scope. ".repeat(1500) + "FINAL-SCOPE-MARKER", "100.00"],
    ],
  });
  expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
  expect(await pdfText(pdf.output())).toContain("FINAL-SCOPE-MARKER");
});
it("generates a snapshotted invoice PDF with VAT, terms and current balance", async () => {
  const db = seed(),
    draft = blankInvoice(db.clients[0].id, db.projects[0].id);
  draft.lines[0].description = "Supply and installation";
  draft.lines[0].rate = "100";
  draft.terms = "Due within thirty days";
  saveInvoice(db, draft);
  issueInvoice(db, draft.id);
  db.clients[0].name = "Changed billing identity";
  const pdf = await invoicePdf(db, db.invoices[0], false);
  const content = pdf.output();
  expect(pdf.getNumberOfPages()).toBe(1);
  // Compressed content is inspected through domain snapshot; output validates PDF framing.
  expect(content.startsWith("%PDF")).toBe(true);
  expect(await pdfText(content)).toContain("Balance due");
  expect(await pdfText(content)).toContain("Due within thirty days");
  expect(db.invoices[0].snapshot?.customer.name).toBe("Apex Capital Holdings");
});
it("keeps the original logo fallback for invoices issued before logo snapshots existed", async () => {
  const db = seed(),
    draft = blankInvoice(db.clients[0].id, db.projects[0].id);
  draft.lines[0].description = "Historical scope";
  draft.lines[0].rate = "100";
  saveInvoice(db, draft);
  issueInvoice(db, draft.id);
  delete db.invoices[0].snapshot!.company.logo;
  initializeOperations(db).settings.company.logo =
    "data:image/png;base64,newlogo";
  const requested: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    requested.push(url);
    return new Response("", { status: 404 });
  });
  try {
    await invoicePdf(db, db.invoices[0], false);
    expect(requested).toContain("/assets/azzora-logo.png");
    expect(requested).not.toContain("data:image/png;base64,newlogo");
  } finally {
    vi.unstubAllGlobals();
  }
});
