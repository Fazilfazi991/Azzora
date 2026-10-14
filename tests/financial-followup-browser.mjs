import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions } from "./browser-runtime.mjs";
const url = process.env.AZZORA_URL || "http://127.0.0.1:5196";
const out = "tmp/financial-followup";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(browserOptions),
  checks = [],
  errors = [];
let failure;
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const go = (route) => page.goto(`${url}/#/${route}`),
      button = (name) => page.getByRole("button", { name, exact: true }),
      label = (name) => page.getByLabel(name, { exact: true }),
      dialog = () => page.getByRole("dialog").last();
    const dlabel = (name) => dialog().getByLabel(name, { exact: true }),
      dbutton = (name) => dialog().getByRole("button", { name, exact: true });
    const saved = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("azzora-demo-v1")));
    const check = (name) => checks.push({ width, name, status: "passed" });
    await go("dashboard");
    await button("Quick Add").click();
    await dbutton("+ New Invoice").click();
    await dlabel("Invoice customer").selectOption("client-0");
    await dlabel("Item 1 description").fill("VAT allocation follow-up");
    await dlabel("Item 1 rate").fill("1");
    await dbutton("Save Draft Invoice").click();
    await button("Issue Invoice").click();
    let data = await saved();
    const invoice = data.invoices[0],
      original = JSON.stringify(invoice.snapshot);
    expect(invoice.snapshot).toMatchObject({
      allocationVersion: 1,
      net: "100",
      vat: "5",
      grand: "105",
    });
    expect(invoice.snapshot.lineAllocations[0]).toMatchObject({
      itemId: invoice.lines[0].id,
      net: "100",
      vat: "5",
      grand: "105",
    });
    check("new issued invoice freezes its exact line tax/discount basis");
    await button("Record Payment").click();
    await dlabel("Payment amount AED").fill("1.05");
    await dlabel("Payment reference").fill("FOLLOWUP-RECEIPT");
    await dbutton("Post Receipt").click();
    await go("accounts/credit-notes");
    const postCredit = async (amount) => {
      await label("Demo actor").selectOption("person-0");
      await label("Assigned demo approver").selectOption("person-1");
      await button("New Credit Note").click();
      await dlabel("Credit invoice").selectOption(invoice.id);
      await dlabel("Gross credit amount AED").fill(amount);
      await dlabel("Credit reason").fill("Capacity bounded VAT correction");
      await dbutton("Save Credit Note").click();
      await button("Submit Credit Note").click();
      await label("Demo actor").selectOption("person-1");
      await label("Decision comments").fill(
        "Independently reconciled original net and VAT capacities",
      );
      await button("Approve").click();
      await button("Issue Credit Note").click();
    };
    const refund = async (amount, reference) => {
      await button("Record Customer Refund").click();
      await dlabel("Refund amount AED").fill(amount);
      await dlabel("Refund reference").fill(reference);
      await dlabel("Refund reason").fill(
        "Return genuine posted customer credit",
      );
      await dbutton("Post Customer Refund").click();
    };
    for (let n = 0; n < 6; n++) {
      await postCredit("0.11");
      data = await saved();
      const notes = data.operations.credits.filter(
        (c) => c.status === "Issued",
      );
      expect(notes.reduce((s, c) => s + BigInt(c.vat), 0n)).toBeLessThanOrEqual(
        5n,
      );
      expect(notes.reduce((s, c) => s + BigInt(c.net), 0n)).toBeLessThanOrEqual(
        100n,
      );
    }
    expect(data.operations.credits.map((c) => c.vat)).toEqual([
      "1",
      "0",
      "1",
      "0",
      "1",
      "0",
    ]);
    expect(
      data.operations.credits.every(
        (c) => c.allocationVersion === 1 && c.lineAllocations.length === 1,
      ),
    ).toBe(true);
    check(
      "six 0.11 amount credits post three VAT fils, with every posting within original component caps",
    );
    await refund("0.66", "FOLLOWUP-PARTIAL-REFUND");
    data = await saved();
    expect(data.operations.refunds[0].amount).toBe("0.66");
    check("partial refund consumes exactly the genuine 0.66 customer credit");
    const history = JSON.stringify(data.operations.credits);
    await page.reload();
    expect(JSON.stringify((await saved()).operations.credits)).toBe(history);
    check(
      "immutable credit allocations persist through reload before final settlement",
    );
    await postCredit("0.39");
    data = await saved();
    expect(data.operations.credits.at(-1)).toMatchObject({
      net: "37",
      vat: "2",
      status: "Issued",
    });
    expect(
      data.operations.credits.reduce((s, c) => s + BigInt(c.net), 0n),
    ).toBe(100n);
    expect(
      data.operations.credits.reduce((s, c) => s + BigInt(c.vat), 0n),
    ).toBe(5n);
    check(
      "final 0.39 credit issues and exactly clears original net/VAT totals",
    );
    await refund("0.39", "FOLLOWUP-FINAL-REFUND");
    data = await saved();
    expect(data.operations.refunds.map((r) => r.amount)).toEqual([
      "0.66",
      "0.39",
    ]);
    expect(data.payments[0].amount).toBe("1.05");
    expect(JSON.stringify(data.invoices[0].snapshot)).toBe(original);
    check(
      "final refund preserves customer receipt and issued invoice snapshot",
    );
    await go("customers/client-0/statement");
    await expect(
      page.locator("tbody tr").last().locator("td").last(),
    ).toHaveText("0.00");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${out}/statement-${width}.png`,
      fullPage: true,
    });
    check("customer statement reconciles to zero at desktop/mobile width");
    await context.close();
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    `PASS: ${checks.length} focused financial browser checks; no browser errors.`,
  );
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  fs.writeFileSync(
    `${out}/browser-results.json`,
    JSON.stringify({ checks, errors, failure }, null, 2),
  );
  await browser.close();
}
