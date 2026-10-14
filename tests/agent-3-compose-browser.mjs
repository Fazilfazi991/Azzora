import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
import { qaOutput } from "./agent-3-helpers.mjs";

const fixtureDir =
  process.env.QA_OPERATIONAL_EVIDENCE_DIR || "docs/operational-evidence";
const fixtureRaw = fs.readFileSync(`${fixtureDir}/qa-data-1440.json`, "utf8");
const fixture = JSON.parse(fixtureRaw);
const manifest = JSON.parse(
  fs.readFileSync(`${fixtureDir}/fixture-manifest-1440.json`, "utf8"),
);
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const sourceTree = execFileSync("git", ["rev-parse", "HEAD:src"], {
  encoding: "utf8",
}).trim();
expect(manifest.sourceTree).toBe(sourceTree);
expect(manifest.url).toBe(auditUrl);
expect(manifest.fixtureSha256).toBe(
  createHash("sha256").update(fixtureRaw).digest("hex"),
);
if (process.env.QA_RUN_KIND === "final")
  expect(manifest.sourceSha).toBe(sourceSha);
const output = `${qaOutput}/compose`;
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const checks = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const record = (name) => checks.push({ name, status: "passed" });
const go = (route) => page.goto(`${auditUrl}/#/${route}`);
const dialog = () => page.getByRole("dialog").last();
const button = (name) => page.getByRole("button", { name, exact: true });
const field = (name) => dialog().getByLabel(name, { exact: true });
const dbutton = (name) => dialog().getByRole("button", { name, exact: true });
const saved = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("azzora-demo-v1")));
const raw = () => page.evaluate(() => localStorage.getItem("azzora-demo-v1"));
const monetary = (db) =>
  JSON.stringify({
    invoices: db.invoices,
    contracts: db.contracts,
    payments: db.payments,
    expenses: db.expenses,
    ...Object.fromEntries(
      [
        "variations",
        "orders",
        "deliveries",
        "bills",
        "supplierPayments",
        "credits",
        "refunds",
        "budgets",
      ].map((key) => [key, db.operations[key]]),
    ),
  });
const cents = (text) => {
  expect(text).toMatch(/^\d+(?:\.\d{1,2})?$/);
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
};
async function quotaFailure(action) {
  const before = await raw();
  await page.evaluate(() => {
    window.__qaComposeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("QA_ATOMIC_QUOTA", "QuotaExceededError");
    };
  });
  try {
    await action();
    await expect(
      page.getByRole("alert").filter({ hasText: "QA_ATOMIC_QUOTA" }).first(),
    ).toBeVisible();
    expect(await raw()).toBe(before);
  } finally {
    await page.evaluate(() => {
      Storage.prototype.setItem = window.__qaComposeSetItem;
    });
  }
}
let failure;
try {
  await page.goto(auditUrl);
  await page.evaluate(
    (db) => localStorage.setItem("azzora-demo-v1", JSON.stringify(db)),
    fixture,
  );
  await page.reload();
  const projectId = fixture.operations.orders[0].projectId;
  const originalMoney = monetary(fixture);
  expect(fixture.contracts[0].net).toBe("20032075");
  expect(fixture.operations.variations[0].net).toBe("10000");
  expect(
    fixture.expenses
      .filter((e) => e.supplierBillId)
      .reduce((sum, e) => sum + cents(e.amount), 0n),
  ).toBe(10000n);
  expect(fixture.payments.reduce((sum, p) => sum + cents(p.amount), 0n)).toBe(
    8000n,
  );
  expect(
    fixture.operations.supplierPayments.reduce(
      (sum, p) => sum + cents(p.amount),
      0n,
    ),
  ).toBe(10500n);
  expect(fixture.operations.credits[0]).toMatchObject({
    gross: "50.00",
    status: "Issued",
  });
  expect(fixture.operations.refunds[0].amount).toBe("25.00");
  record(
    "combined fixture keeps accepted contract/variation, customer receipts/refunds, supplier cash and actual cost distinct",
  );

  await go(`projects/${projectId}/documents`);
  await button("+ Add Document").click();
  await field("Document name").fill("QA atomic coordinated drawing");
  await field("Revision description").fill("Initial atomic drawing");
  await field("Attach files").setInputFiles({
    name: "atomic-v1.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("QA immutable approved revision 1"),
  });
  await expect(dialog().locator(".photo-grid")).toContainText("atomic-v1.txt");
  await field("Demo submitter").selectOption("person-3");
  await field("Assigned document reviewer").selectOption("person-0");
  await field("Review note / reason").fill("Atomic drawing submitted");
  await dbutton("Submit Revision").click();
  let data = await saved();
  const v1Id = data.documents.find(
    (d) => d.name === "QA atomic coordinated drawing",
  ).id;
  await button("Review QA atomic coordinated drawing v1").click();
  await field("Demo reviewer").selectOption("person-0");
  await field("Review note / reason").fill("Atomic workspace decision");
  await quotaFailure(() => dbutton("Approve Revision").click());
  data = await saved();
  expect(data.documents.find((d) => d.id === v1Id).status).toBe("Pending");
  expect(
    data.operations.approvals.find((a) => a.entityId === v1Id).status,
  ).toBe("Pending Approval");
  await expect(dbutton("Approve Revision")).toBeVisible();
  record(
    "failed workspace review saves neither document, ledger, history nor visible approval state",
  );
  await dbutton("Approve Revision").click();
  data = await saved();
  expect(data.documents.find((d) => d.id === v1Id).status).toBe("Approved");
  expect(
    data.operations.approvals.find((a) => a.entityId === v1Id).status,
  ).toBe("Approved");
  expect(monetary(data)).toBe(originalMoney);
  const frozenV1 = JSON.stringify(data.documents.find((d) => d.id === v1Id));
  const frozenApproval = JSON.stringify(
    data.operations.approvals.find((a) => a.entityId === v1Id),
  );
  record(
    "restored workspace review atomically approves the canonical document and shared ledger without monetary changes",
  );

  await button("Review QA atomic coordinated drawing v1").click();
  await field("Demo reviewer").selectOption("person-3");
  await field("Review note / reason").fill("Create corrected atomic revision");
  await quotaFailure(() => dbutton("Create Revision").click());
  expect(
    (await saved()).documents.filter(
      (d) => d.name === "QA atomic coordinated drawing",
    ),
  ).toHaveLength(1);
  record(
    "failed revision creation leaves no orphan revision or supersession history",
  );
  await dbutton("Create Revision").click();
  await field("Revision description").fill("Corrected atomic drawing");
  await field("Attach files").setInputFiles({
    name: "atomic-v2.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("QA corrected revision 2"),
  });
  await expect(dialog().locator(".photo-grid")).toContainText("atomic-v2.txt");
  await field("Demo submitter").selectOption("person-3");
  await field("Assigned document reviewer").selectOption("person-0");
  await field("Review note / reason").fill(
    "Corrected atomic revision submitted",
  );
  await quotaFailure(() => dbutton("Submit Revision").click());
  data = await saved();
  const v2Id = data.documents.find((d) => d.previousRevisionId === v1Id).id;
  expect(data.documents.find((d) => d.id === v2Id).status).toBe("Draft");
  expect(
    data.operations.approvals.filter((a) => a.entityId === v2Id),
  ).toHaveLength(0);
  record(
    "failed compound save-and-submit retains draft and creates no pending ledger entry",
  );
  await dbutton("Submit Revision").click();
  data = await saved();
  expect(data.documents.find((d) => d.id === v2Id).status).toBe("Pending");
  expect(
    data.operations.approvals.filter(
      (a) => a.entityId === v2Id && a.status === "Pending Approval",
    ),
  ).toHaveLength(1);
  await go(`projects/${projectId}/handover`);
  await expect(
    page.getByRole("checkbox", {
      name: /Latest drawing and submission revisions approved/,
    }),
  ).not.toBeChecked();
  record(
    "canonical resubmission produces one active pending approval and blocks derived document readiness",
  );

  await go("approvals");
  await page.getByLabel("Demo actor", { exact: true }).selectOption("person-0");
  await page
    .getByLabel("Decision comments", { exact: true })
    .fill("Atomic shared-inbox decision");
  await quotaFailure(() => button("Approve").click());
  data = await saved();
  expect(data.documents.find((d) => d.id === v2Id).status).toBe("Pending");
  expect(
    data.operations.approvals.find((a) => a.entityId === v2Id).status,
  ).toBe("Pending Approval");
  await expect(button("Approve")).toBeVisible();
  record(
    "failed shared-inbox decision retains canonical pending document and ledger together",
  );
  await button("Approve").click();
  data = await saved();
  expect(data.documents.find((d) => d.id === v2Id).status).toBe("Approved");
  expect(
    data.operations.approvals.find((a) => a.entityId === v2Id).status,
  ).toBe("Approved");
  expect(JSON.stringify(data.documents.find((d) => d.id === v1Id))).toBe(
    frozenV1,
  );
  expect(
    JSON.stringify(data.operations.approvals.find((a) => a.entityId === v1Id)),
  ).toBe(frozenApproval);
  expect(monetary(data)).toBe(originalMoney);
  await go(`projects/${projectId}/handover`);
  await expect(
    page.getByRole("checkbox", {
      name: /Latest drawing and submission revisions approved/,
    }),
  ).toBeChecked();
  await expect(button("Record Commercial Closure")).toBeDisabled();
  record(
    "shared-inbox approval converges with readiness while old revision/files/history and independent commercial blockers remain",
  );
  const beforeReload = JSON.stringify(data);
  await page.reload();
  expect(JSON.stringify(await saved())).toBe(beforeReload);
  await page.screenshot({
    path: `${output}/canonical-handover.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
  record(
    "atomic workflow, historical attachments and monetary ledger survive reload with no browser errors",
  );
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  fs.writeFileSync(
    `${output}/results.json`,
    JSON.stringify(
      {
        sourceSha,
        sourceTree,
        url: auditUrl,
        fixtureManifest: manifest,
        checks,
        errors,
        failure,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
console.log(
  `PASS ${checks.length} independent combined financial/workforce atomic checks.`,
);
