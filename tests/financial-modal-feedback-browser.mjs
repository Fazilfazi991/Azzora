import { chromium, expect } from "@playwright/test";
import { buildSync } from "esbuild";
import Module from "node:module";
import path from "node:path";
import fs from "node:fs";
import { browserOptions } from "./browser-runtime.mjs";
const url = process.env.AZZORA_URL || "http://127.0.0.1:5197";
const diagnose = process.argv.includes("--diagnose"),
  out = "tmp/financial-modal-feedback";
fs.mkdirSync(out, { recursive: true });
const bundled = buildSync({
  stdin: {
    contents: `export {seed} from './src/domain/seed';export {initializeCommercial} from './src/commercial/migration';export {blankInvoice,saveInvoice,issueInvoice,postPayment} from './src/commercial/repository';export {saveCredit,submitApproval,decideApproval,issueCredit,postRefund} from './src/operations/repository';export {uid,today} from './src/domain/logic';`,
    resolveDir: process.cwd(),
    sourcefile: "feedback-fixture.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  logLevel: "silent",
}).outputFiles[0].text;
const fixtureModule = new Module(
  path.join(process.cwd(), "feedback-fixture.cjs"),
);
fixtureModule.filename = fixtureModule.id;
fixtureModule.paths = Module._nodeModulePaths(process.cwd());
fixtureModule._compile(bundled, fixtureModule.filename);
const api = fixtureModule.exports,
  db = api.seed();
api.initializeCommercial(db);
function invoice(rates, tax = "Exclusive", discount = "0") {
  const i = api.blankInvoice(db.clients[0].id, db.projects[0].id);
  i.lines = rates.map((rate) => ({
    id: api.uid(),
    description: "Modal financial fixture",
    quantity: "1",
    rate,
    tax,
  }));
  i.discount = discount;
  api.saveInvoice(db, i);
  api.issueInvoice(db, i.id);
  return db.invoices.find((row) => row.id === i.id);
}
const valid = invoice(["100"]),
  refundable = invoice(["1"]),
  legacy = invoice(["10", "10", "0.01"], "Exempt", "0.02");
delete legacy.snapshot.allocationVersion;
delete legacy.snapshot.lineAllocations;
api.postPayment(db, {
  id: api.uid(),
  number: "",
  invoiceId: refundable.id,
  customerId: refundable.customerId,
  projectId: refundable.projectId,
  date: api.today(),
  amount: "1.05",
  method: "Cash",
  reference: api.uid(),
  bank: "",
  notes: "",
  attachments: [],
  postingKey: api.uid(),
  createdAt: new Date().toISOString(),
});
const c = api.saveCredit(
  db,
  {
    id: api.uid(),
    number: "",
    invoiceId: refundable.id,
    customerId: refundable.customerId,
    projectId: refundable.projectId,
    date: api.today(),
    gross: "0.50",
    itemId: "",
    reason: "Refund eligibility fixture",
    status: "Draft",
  },
  "person-0",
);
const a = api.submitApproval(
  db,
  "Credit Note",
  c.id,
  "Internal",
  "person-0",
  "person-1",
);
api.decideApproval(db, a.id, true, "Independent fixture review", "person-1");
api.issueCredit(db, c.id, "person-1");
api.postRefund(
  db,
  {
    id: api.uid(),
    number: "",
    invoiceId: refundable.id,
    customerId: refundable.customerId,
    projectId: refundable.projectId,
    date: api.today(),
    amount: "0.20",
    reference: api.uid(),
    method: "Cash",
    reason: "Initial posted refund fixture",
  },
  "person-1",
);
const browser = await chromium.launch(browserOptions),
  checks = [],
  observations = [],
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
    await page.goto(url);
    await page.evaluate(
      (value) => localStorage.setItem("azzora-demo-v1", JSON.stringify(value)),
      db,
    );
    await page.reload();
    const go = (route) => page.goto(`${url}/#/${route}`),
      button = (name) => page.getByRole("button", { name, exact: true }),
      dialog = () => page.getByRole("dialog").last();
    const field = (name) => dialog().getByLabel(name, { exact: true }),
      submit = (name) => dialog().getByRole("button", { name, exact: true });
    const raw = () =>
      page.evaluate(() => localStorage.getItem("azzora-demo-v1"));
    const check = (name) => checks.push({ width, name, status: "passed" });
    const rejection = async (name, expected, values, before) => {
      await expect(page.locator(".error-toast")).toContainText(expected);
      expect(await raw()).toBe(before);
      for (const [label, value] of Object.entries(values))
        await expect(field(label)).toHaveValue(value);
      const message = (await page.locator(".error-toast").innerText()).trim();
      if (diagnose) {
        const modalAlerts = await dialog().getByRole("alert").count(),
          accessibleAlerts = await page.getByRole("alert").count();
        expect(modalAlerts).toBe(0);
        const cdp = await context.newCDPSession(page);
        const handle = await cdp.send("Runtime.evaluate", {
          expression: "document.querySelector('.error-toast')",
        });
        const node = await cdp.send("DOM.describeNode", {
          objectId: handle.result.objectId,
        });
        const tree = await cdp.send("Accessibility.getPartialAXTree", {
          backendNodeId: node.node.backendNodeId,
          fetchRelatives: false,
        });
        await cdp.detach();
        observations.push({
          width,
          name,
          message,
          modalAlerts,
          accessibleAlerts,
          externalAlertAX: tree.nodes.map((node) => ({
            ignored: node.ignored,
            role: node.role?.value,
            ignoredReasons: node.ignoredReasons,
          })),
          savedStateUnchanged: true,
          typedValuesRetained: true,
        });
      } else {
        const alert = dialog().getByRole("alert");
        await expect(alert).toHaveText(message);
        await expect(alert).toBeVisible();
        await expect(alert).toBeFocused();
        const cdp = await context.newCDPSession(page);
        const handle = await cdp.send("Runtime.evaluate", {
          expression: "document.querySelector('dialog[open] [role=alert]')",
        });
        const node = await cdp.send("DOM.describeNode", {
          objectId: handle.result.objectId,
        });
        const tree = await cdp.send("Accessibility.getPartialAXTree", {
          backendNodeId: node.node.backendNodeId,
          fetchRelatives: false,
        });
        expect(
          tree.nodes.some(
            (node) => !node.ignored && node.role?.value === "alert",
          ),
        ).toBe(true);
        await cdp.detach();
        expect(
          await alert.evaluate((el) => {
            const r = el.getBoundingClientRect(),
              head = el
                .closest("dialog")
                .querySelector(".modal-head")
                .getBoundingClientRect();
            return r.top >= head.bottom && r.bottom <= innerHeight;
          }),
        ).toBe(true);
        if (
          [
            "over-credit",
            "excessive refund",
            "legacy allocation review",
          ].includes(name)
        )
          await page.screenshot({
            path: `${out}/${name.replaceAll(" ", "-")}-${width}.png`,
          });
        check(
          name +
            " shows the actual error inside the dialog, focuses it, retains exact storage/typed values",
        );
      }
    };
    const openCredit = async (invoiceId, amount, reason) => {
      await button("New Credit Note").click();
      await field("Credit invoice").selectOption(invoiceId);
      await field("Gross credit amount AED").fill(amount);
      await field("Credit reason").fill(reason);
    };
    const openRefund = async (amount, reference) => {
      await button("Record Customer Refund").click();
      await field("Refund invoice").selectOption(refundable.id);
      await field("Refund amount AED").fill(amount);
      await field("Refund reference").fill(reference);
      await field("Refund reason").fill("Keep the refund reason");
    };
    await go("accounts/credit-notes");
    await openCredit(valid.id, "106", "Keep the over-credit draft");
    let before = await raw();
    await submit("Save Credit Note").click();
    await rejection(
      "over-credit",
      "Credit exceeds eligible billed value",
      {
        "Gross credit amount AED": "106",
        "Credit reason": "Keep the over-credit draft",
        "Credit invoice": valid.id,
      },
      before,
    );
    if (diagnose) await page.keyboard.press("Escape");
    else {
      await field("Gross credit amount AED").fill("5");
      await submit("Save Credit Note").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      check("corrected credit saves normally");
    }
    await openRefund("0.31", "KEEP-REFUND-REFERENCE");
    before = await raw();
    await submit("Post Customer Refund").click();
    await rejection(
      "excessive refund",
      "Refund exceeds eligible customer credit balance",
      {
        "Refund amount AED": "0.31",
        "Refund reference": "KEEP-REFUND-REFERENCE",
        "Refund reason": "Keep the refund reason",
      },
      before,
    );
    if (diagnose) await page.keyboard.press("Escape");
    else {
      await field("Refund amount AED").fill("0.10");
      await submit("Post Customer Refund").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      check("corrected refund posts normally");
    }
    const legacyOriginal = JSON.stringify(
      JSON.parse(await raw()).invoices.find((i) => i.id === legacy.id),
    );
    await openCredit(legacy.id, "0.01", "Keep the legacy review draft");
    before = await raw();
    await submit("Save Credit Note").click();
    await rejection(
      "legacy allocation review",
      "Original invoice allocation requires explicit review",
      {
        "Credit invoice": legacy.id,
        "Gross credit amount AED": "0.01",
        "Credit reason": "Keep the legacy review draft",
      },
      before,
    );
    if (diagnose) await page.keyboard.press("Escape");
    else {
      await page.keyboard.press("Escape");
      await openCredit(valid.id, "0.01", "Fresh valid draft");
      await expect(dialog().getByRole("alert")).toHaveCount(0);
      await expect(page.locator(".error-toast")).toContainText(
        "Original invoice allocation requires explicit review",
      );
      check(
        "reopening clears scoped stale feedback without clearing the store protection/error state",
      );
      await submit("Save Credit Note").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      expect(
        JSON.stringify(
          JSON.parse(await raw()).invoices.find((i) => i.id === legacy.id),
        ),
      ).toBe(legacyOriginal);
      check(
        "valid replacement draft proceeds while the legacy invoice remains byte-for-byte unchanged",
      );
    }
    if (!diagnose) {
      const storageFailure = () =>
        page.evaluate(() => {
          window.__financialSetItem = Storage.prototype.setItem;
          Storage.prototype.setItem = () => {
            throw new DOMException(
              "Financial QA quota failure",
              "QuotaExceededError",
            );
          };
        });
      const restoreStorage = () =>
        page.evaluate(() => {
          Storage.prototype.setItem = window.__financialSetItem;
        });
      await openCredit(valid.id, "0.01", "Keep quota-failed credit");
      before = await raw();
      await storageFailure();
      await submit("Save Credit Note").click();
      await rejection(
        "credit storage failure",
        "Financial QA quota failure",
        {
          "Gross credit amount AED": "0.01",
          "Credit reason": "Keep quota-failed credit",
        },
        before,
      );
      await page.waitForTimeout(5500);
      await expect(page.locator(".error-toast")).toHaveCount(0);
      await expect(dialog().getByRole("alert")).toContainText(
        "Financial QA quota failure",
      );
      check("dialog feedback survives clearing of the unrelated global toast");
      await restoreStorage();
      await submit("Save Credit Note").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      check("credit retry succeeds after storage recovers");
      await openRefund("0.10", "QUOTA-REFUND");
      before = await raw();
      await storageFailure();
      await submit("Post Customer Refund").click();
      await rejection(
        "refund storage failure",
        "Financial QA quota failure",
        {
          "Refund amount AED": "0.10",
          "Refund reference": "QUOTA-REFUND",
          "Refund reason": "Keep the refund reason",
        },
        before,
      );
      await restoreStorage();
      await submit("Post Customer Refund").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      check("refund retry succeeds after storage recovers");
    }
    await go("accounts/refunds");
    await button("Reverse Refund").first().click();
    await field("Refund reversal reason").fill("   ");
    before = await raw();
    await submit("Confirm Refund Reversal").click();
    await rejection(
      "refund reversal reason",
      "Reversal reason is required",
      { "Refund reversal reason": "   " },
      before,
    );
    if (diagnose) await page.keyboard.press("Escape");
    else {
      await field("Refund reversal reason").fill("Bank transfer returned");
      await submit("Confirm Refund Reversal").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      check("corrected reversal proceeds normally");
      await button("Reverse Refund").first().click();
      await field("Refund reversal reason").fill("Keep quota-failed reversal");
      before = await raw();
      await page.evaluate(() => {
        window.__financialSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = () => {
          throw new DOMException(
            "Financial QA quota failure",
            "QuotaExceededError",
          );
        };
      });
      await submit("Confirm Refund Reversal").click();
      await rejection(
        "refund reversal storage failure",
        "Financial QA quota failure",
        { "Refund reversal reason": "Keep quota-failed reversal" },
        before,
      );
      await page.screenshot({
        path: `${out}/reversal-feedback-${width}.png`,
        fullPage: true,
      });
      await page.evaluate(() => {
        Storage.prototype.setItem = window.__financialSetItem;
      });
      await submit("Confirm Refund Reversal").click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      check("reversal retry succeeds after storage recovers");
      // Bypass native required-field validation solely to reach the store's
      // actual read-only guard in its corrupt-data recovery state.
      await page.evaluate(() =>
        localStorage.setItem("azzora-demo-v1", "{broken"),
      );
      await page.reload();
      await button("New Credit Note").click();
      await field("Gross credit amount AED").fill("0.01");
      await field("Credit reason").fill("Read-only guard probe");
      await dialog()
        .locator("form")
        .evaluate((form) => (form.noValidate = true));
      await submit("Save Credit Note").click();
      await rejection(
        "read-only protection",
        "Writes are disabled",
        {
          "Gross credit amount AED": "0.01",
          "Credit reason": "Read-only guard probe",
        },
        "{broken",
      );
      await page.keyboard.press("Escape");
      await button("New Credit Note").click();
      await expect(dialog().getByRole("alert")).toHaveCount(0);
      await expect(page.locator(".error-toast")).toContainText(
        "Writes are disabled",
      );
      expect(await raw()).toBe("{broken");
      check(
        "reopening resets scoped feedback while preserving the read-only warning and original data",
      );
      await dialog()
        .locator("form")
        .evaluate((form) => (form.noValidate = true));
      await submit("Save Credit Note").click();
      await rejection(
        "repeated read-only protection",
        "Writes are disabled",
        {},
        "{broken",
      );
    }
    await context.close();
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    diagnose
      ? `REPRODUCED: ${observations.length} native-dialog failures with external-only feedback.`
      : `PASS: ${checks.length} financial dialog feedback checks; no browser errors.`,
  );
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  fs.writeFileSync(
    `${out}/${diagnose ? "baseline-observations" : "browser-results"}.json`,
    JSON.stringify({ checks, observations, errors, failure }, null, 2),
  );
  await browser.close();
}
