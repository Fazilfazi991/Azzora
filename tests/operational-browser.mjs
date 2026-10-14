import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { browserOptions, auditUrl } from "./browser-runtime.mjs";
import { quotationStep } from "./quotation-ux-helpers.mjs";
import {
  selectQuotationCustomer,
  selectQuotationProject,
} from "./quotation-picker-helpers.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const url = auditUrl,
  out = process.env.QA_OPERATIONAL_EVIDENCE_DIR || "docs/operational-evidence";
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const sourceTree = execFileSync("git", ["rev-parse", "HEAD:src"], {
  encoding: "utf8",
}).trim();
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(browserOptions),
  checks = [],
  errors = [];
const check = (width, name) => checks.push({ width, name, status: "passed" });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    const go = (route) => page.goto(`${url}/#/${route}`),
      button = (name) => page.getByRole("button", { name, exact: true }),
      dialog = () => page.getByRole("dialog").last(),
      dbutton = (name) => dialog().getByRole("button", { name, exact: true }),
      label = (name) => page.getByLabel(name, { exact: true }),
      dlabel = (name) => dialog().getByLabel(name, { exact: true });
    const saved = () =>
      page.evaluate(() => JSON.parse(localStorage.getItem("azzora-demo-v1")));
    const decide = async (comments, approved = true) => {
      await label("Decision comments").last().fill(comments);
      await button(approved ? "Approve" : "Reject / Revise")
        .last()
        .click();
    };
    const shot = async (name) => {
      if (
        await page
          .getByRole("button", { name: "Dismiss notification", exact: true })
          .count()
      )
        await page
          .getByRole("button", { name: "Dismiss notification", exact: true })
          .click();
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: `${out}/${name}-${width}.png`,
        fullPage: true,
      });
    };
    await go("projects");
    await button("+ New Project").click();
    await dlabel("Project name").fill("Phase 3 Fit-Out " + width);
    await dlabel("Select Existing Customer").selectOption("client-0");
    await dbutton("Continue →").click();
    await dlabel("Project location").fill("Dubai Marina");
    await dlabel("Civil").check();
    for (let i = 0; i < 3; i++) await dbutton("Continue →").click();
    await dbutton("Create Project").click();
    await expect(
      page.getByRole("heading", {
        name: "Phase 3 Fit-Out " + width,
        exact: true,
      }),
    ).toBeVisible();
    const projectId = await page.evaluate(() => location.hash.split("/")[2]);
    await go("quotations/quotation-reference/edit");
    await quotationStep(page, 0);
    await selectQuotationCustomer(page, "client-0");
    await selectQuotationProject(page, projectId);
    await quotationStep(page, 4);
    await button("Finalize").click();
    await dbutton("Confirm").click();
    await label("Issued quotation status").selectOption("Accepted");
    await button("Convert to Project").click();
    await dbutton("Confirm Conversion").click();
    check(
      width,
      "project creation and accepted contract setup through existing UI",
    );
    await go(`projects/${projectId}/variations`);
    await button("New Variation").click();
    await dlabel("Variation title").fill("Additional joinery");
    await dlabel("Reason for variation").fill(
      "Client requested additional storage",
    );
    await dlabel("Line 1 description").fill("Additional joinery cabinet");
    await dlabel("Line 1 rate").fill("100");
    await dbutton("Save Variation").click();
    await button("Submit Variation").click();
    await decide("Internal scope and pricing checked");
    await button("Send to Client").click();
    await decide("Demo client approval recorded");
    await expect(page.locator("main")).toContainText("Approved");
    let data = await saved();
    expect(data.operations.variations[0].net).toBe("10000");
    expect(
      data.operations.approvals.filter(
        (a) =>
          a.entityId === data.operations.variations[0].id &&
          a.status === "Approved",
      ),
    ).toHaveLength(2);
    await shot("variations");
    await button("Generate Variation Invoice").click();
    await button("Issue Invoice").click();
    const invoiceId = await page.evaluate(() => location.hash.split("/")[3]);
    await expect(page.locator(".invoice-paper")).toContainText("AED 105.00");
    check(
      width,
      "variation request → internal approval → client approval → revised contract → eligible invoice",
    );
    await button("Record Payment").click();
    await dlabel("Payment amount AED").fill("80");
    await dlabel("Payment reference").fill("CUSTOMER-PARTIAL");
    await dbutton("Post Receipt").click();
    await go("accounts/credit-notes");
    await button("New Credit Note").click();
    await dlabel("Credit invoice").selectOption(invoiceId);
    await dlabel("Gross credit amount AED").fill("50");
    await dlabel("Credit reason").fill("Partial scope adjustment");
    await dbutton("Save Credit Note").click();
    await button("Submit Credit Note").click();
    await decide("Credit reconciled to issued invoice");
    await button("Issue Credit Note").click();
    data = await saved();
    expect(data.operations.credits[0].status).toBe("Issued");
    await shot("credit-notes");
    const cnPdf = page.waitForEvent("download");
    await button("Preview / Download Credit PDF").click();
    await (await cnPdf).saveAs(`${out}/credit-${width}.pdf`);
    await button("Record Customer Refund").click();
    await dlabel("Refund amount AED").fill("25");
    await dlabel("Refund reference").fill("REFUND-VALID");
    await dlabel("Refund reason").fill(
      "Return credit created by issued adjustment",
    );
    await dbutton("Post Customer Refund").click();
    await go(`customers/client-0/statement`);
    await expect(
      page.locator("tbody tr").last().locator("td").last(),
    ).toHaveText("0.00");
    check(
      width,
      "partial receipt → approved/issued credit → valid refund → reconciled customer statement and PDF",
    );
    for (const name of ["Phase 3 Supplier A", "Phase 3 Supplier B"]) {
      await go("suppliers");
      await button("Add Supplier").click();
      await dlabel("Supplier company name").fill(name);
      await dlabel("Supplier email").fill(
        name.endsWith("A") ? "a@example.com" : "b@example.com",
      );
      await dlabel("Material/service category").fill("Materials");
      await dlabel("Supplier payment terms").fill("30 days");
      await dbutton("Save Supplier").click();
    }
    data = await saved();
    const [supplierA, supplierB] = data.operations.suppliers;
    await go(`suppliers/${supplierA.id}/overview`);
    await shot("supplier");
    await button("Archive Supplier").click();
    await expect(button("Restore Supplier")).toBeVisible();
    await button("Restore Supplier").click();
    check(width, "supplier master, profile, archive and restore");
    await go(`projects/${projectId}/procurement/materials`);
    await button("New Material Requirement").click();
    await dlabel("Procurement project").selectOption(projectId);
    await dlabel("Material/service name").fill("Porcelain tiles");
    await dlabel("Material specification").fill("600 x 600 porcelain");
    await dlabel("Material unit").fill("Nos");
    await dlabel("Quantity required").fill("10");
    await dbutton("Save Material Requirement").click();
    await button("Create Purchase Request").click();
    await dbutton("Save Purchase Request").click();
    await go(`projects/${projectId}/procurement/requests`);
    await button("Submit Purchase Request").click();
    await decide("Material scope approved");
    await button("Request Supplier Prices").click();
    await dlabel("RFQ suppliers").selectOption([supplierA.id, supplierB.id]);
    await dbutton("Save Supplier RFQ").click();
    for (const rate of ["10", "9"]) {
      await go(`projects/${projectId}/procurement/rfqs`);
      await button("Record Supplier Quotation").first().click();
      await dlabel("Line 1 rate").fill(rate);
      await dlabel("Lead time days").fill(rate === "10" ? "2" : "7");
      await dlabel("Supplier quotation payment terms").fill(
        "30 days after delivery",
      );
      await dlabel("Supplier remarks").fill(
        rate === "10"
          ? "Preferred specification and delivery"
          : "Longer lead time",
      );
      await dbutton("Save Supplier Quotation").click();
    }
    await go(`projects/${projectId}/procurement/comparison`);
    await expect(page.locator("tbody")).toContainText("AED 105.00");
    await button("Select Preferred Supplier").first().click();
    await decide("Preferred specification and two-day lead time");
    await shot("comparison");
    await button("Create Purchase Order").click();
    await dlabel("PO delivery location").fill("Dubai Marina site");
    await dbutton("Save Purchase Order").click();
    await go(`projects/${projectId}/procurement/orders`);
    await button("Submit Purchase Order").click();
    await decide("PO authorized by selected demo actor");
    const poPdf = page.waitForEvent("download");
    await button("Download PO PDF").click();
    await (await poPdf).saveAs(`${out}/purchase-order-${width}.pdf`);
    await shot("purchase-order");
    check(
      width,
      "requirement → approved request → two RFQs → comparison → deliberate preferred supplier → authorized PO/PDF",
    );
    await button("Receive Materials").click();
    await dlabel("Delivery note reference").fill("DELIVERY-PARTIAL");
    await dialog()
      .getByLabel(/Received\/billed quantity 1/)
      .fill("4");
    await dbutton("Save Material Delivery").click();
    await expect(page.locator("main")).toContainText(
      "Pending / Partial Delivery",
    );
    await button("Record Supplier Bill").click();
    await dlabel("Supplier invoice reference").fill("SUP-INV-PARTIAL");
    await dbutton("Save Supplier Bill").click();
    await go(`projects/${projectId}/procurement/bills`);
    await button("Pay Supplier").first().click();
    await dlabel("Supplier payment amount AED").fill("20");
    await dlabel("Supplier payment reference").fill("SUP-PAY-PARTIAL");
    await dbutton("Post Supplier Payment").click();
    await expect(page.locator("tbody")).toContainText("AED 22.00");
    await button("Pay Supplier").first().click();
    await dlabel("Supplier payment reference").fill("SUP-PAY-SETTLE-1");
    await dbutton("Post Supplier Payment").click();
    await go(`projects/${projectId}/procurement/orders`);
    await button("Receive Materials").click();
    await dlabel("Delivery note reference").fill("DELIVERY-FINAL");
    await dbutton("Save Material Delivery").click();
    await expect(page.locator("main")).toContainText("Fully Received");
    await button("Record Supplier Bill").click();
    await dlabel("Supplier invoice reference").fill("SUP-INV-FINAL");
    await dbutton("Save Supplier Bill").click();
    await go(`projects/${projectId}/procurement/bills`);
    await button("Pay Supplier").last().click();
    await dlabel("Supplier payment reference").fill("SUP-PAY-SETTLE-2");
    await dbutton("Post Supplier Payment").click();
    data = await saved();
    expect(data.expenses.filter((e) => e.supplierBillId)).toHaveLength(2);
    expect(
      data.expenses
        .filter((e) => e.supplierBillId)
        .reduce((sum, e) => sum + Number(e.amount), 0),
    ).toBe(100);
    expect(data.payments).toHaveLength(1);
    expect(data.operations.supplierPayments).toHaveLength(3);
    await shot("supplier-bills");
    check(
      width,
      "partial/final deliveries → quantity-controlled supplier bills → partial/full supplier payments → single actual cost",
    );
    await go(`projects/${projectId}/financials`);
    await button("Set / Revise Cost Budget").click();
    await dlabel("Budget 1 amount AED").fill("350");
    await dlabel("Estimated remaining cost AED").fill("270");
    await dlabel("Budget revision notes").fill(
      "Cost plan and remaining installation estimate",
    );
    await dbutton("Save Cost Budget").click();
    await expect(page.locator(".budget-kpis")).toContainText("AED 370.00");
    await expect(page.locator("main")).toContainText("Budget Overrun");
    await shot("budget-forecast");
    check(
      width,
      "original budget, actual costs, extinguished commitments and forecast overrun reconcile",
    );
    await go("team");
    await button("+ Add Employee").click();
    const employeeName = "Phase 3 Site Employee " + width;
    await dlabel("Employee name").fill(employeeName);
    await dlabel("Role").fill("Site Engineer");
    await dlabel("Department").fill("Site Operations");
    await dlabel("Demo actor").selectOption("person-0");
    await dlabel("Email").fill(`site${width}@example.com`);
    await dbutton("Save Employee").click();
    data = await saved();
    const employeeId = data.people.find((p) => p.name === employeeName).id;
    await button("+ Assign Person").click();
    await dlabel("Project").selectOption(projectId);
    await dlabel("Person").selectOption(employeeId);
    await dlabel("Project role").selectOption("Site Engineer");
    await dlabel("Demo actor").selectOption("person-0");
    await dbutton("Save Assignment").click();
    await go(`projects/${projectId}/tasks`);
    await button("+ Create Task").click();
    await dlabel("Task name").fill("Employee ownership check");
    await dlabel("Assigned to").selectOption(employeeId);
    await dlabel("Schedule proposal reason").fill("Assign site engineer to the new delivery task");
    await dbutton("Save Changes").click();
    data = await saved();
    expect(data.tasks.find((t) => t.name === "Employee ownership check")).toBeUndefined();
    await go("planning");
    await label("Planning project").selectOption(projectId);
    const taskProposal = page.locator(".planning-proposal");
    await taskProposal.getByRole("button", { name: "Submit for PM review" }).click();
    await taskProposal.getByRole("button", { name: "Approve proposal" }).click();
    data = await saved();
    expect(data.tasks.find((t) => t.name === "Employee ownership check").assigneeId).toBe(employeeId);
    await go("team");
    await page.locator(".team-card").filter({ hasText: employeeName }).click();
    await dbutton("Deactivate Employee").click();
    await dlabel("Demo actor").selectOption("person-0");
    await dlabel("Reason").fill(
      "QA employee deactivation preserves historical ownership",
    );
    await dbutton("Deactivate").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    data = await saved();
    expect(
      data.tasks.find((t) => t.name === "Employee ownership check").assigneeId,
    ).toBe(employeeId);
    expect(
      data.assignments.some(
        (a) => a.personId === employeeId && a.projectId === projectId,
      ),
    ).toBe(true);
    await shot("team");
    check(
      width,
      "employee creation, project/task assignment and deactivation retain ownership/history",
    );
    await go(`projects/${projectId}/documents`);
    await button("+ Add Document").click();
    await dlabel("Document name").fill("Phase 3 drawing");
    await dlabel("Revision description").fill("Initial drawing submission");
    await dlabel("Demo submitter").selectOption("person-3");
    await dlabel("Assigned document reviewer").selectOption("person-0");
    await dlabel("Review note / reason").fill(
      "Initial drawing submitted for independent review",
    );
    await dbutton("Submit Revision").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    data = await saved();
    const firstDocument = data.documents.find((d) => d.projectId === projectId);
    expect(
      data.operations.approvals.filter(
        (a) =>
          a.kind === "Document" &&
          a.entityId === firstDocument.id &&
          a.status === "Pending Approval",
      ),
    ).toHaveLength(1);
    await button("Review Phase 3 drawing v1").click();
    await dlabel("Demo reviewer").selectOption("person-0");
    await dlabel("Review note / reason").fill("Revise dimensions");
    await dbutton("Reject Revision").click();
    data = await saved();
    const rejectedDocument = JSON.stringify(
      data.documents.find((d) => d.id === firstDocument.id),
    );
    const rejectedApproval = JSON.stringify(
      data.operations.approvals.find(
        (a) => a.kind === "Document" && a.entityId === firstDocument.id,
      ),
    );
    await button("Review Phase 3 drawing v1").click();
    await dlabel("Demo reviewer").selectOption("person-3");
    await dlabel("Review note / reason").fill("Revised dimensions");
    await dbutton("Create Revision").click();
    await dlabel("Revision description").fill("Revised dimensions");
    await dlabel("Demo submitter").selectOption("person-3");
    await dlabel("Assigned document reviewer").selectOption("person-0");
    await dlabel("Review note / reason").fill(
      "Corrected dimensions resubmitted",
    );
    await dbutton("Submit Revision").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await go("approvals");
    await label("Demo actor").selectOption("person-0");
    await decide("Revised dimensions verified");
    data = await saved();
    const docs = data.documents.filter((d) => d.projectId === projectId);
    expect(docs).toHaveLength(2);
    expect(docs[0].reviewState).toBe("Revise & Resubmit");
    expect(docs[1].reviewState).toBe("Approved");
    expect(docs[0].status).toBe("Rejected");
    expect(docs[1].status).toBe("Approved");
    expect(
      JSON.stringify(data.documents.find((d) => d.id === firstDocument.id)),
    ).toBe(rejectedDocument);
    expect(
      JSON.stringify(
        data.operations.approvals.find(
          (a) => a.kind === "Document" && a.entityId === firstDocument.id,
        ),
      ),
    ).toBe(rejectedApproval);
    expect(
      data.operations.approvals.filter(
        (a) =>
          a.kind === "Document" &&
          a.projectId === projectId &&
          a.status === "Pending Approval" &&
          !a.supersededBy,
      ),
    ).toHaveLength(0);
    check(
      width,
      "canonical document submission/workspace rejection/shared-inbox approval agree atomically and preserve v1 history",
    );
    await go(`projects/${projectId}/documents`);
    await shot("documents");
    check(
      width,
      "drawing submit → reject/revise → new revision → approve with preserved version history",
    );
    // Leave one customer milestone unpaid to verify operational handover remains separate.
    await go("accounts/invoices");
    await button("Generate Milestone Invoice").first().click();
    await button("Issue Invoice").click();
    await go(`projects/${projectId}/tasks`);
    const taskCount = await page.locator(".task-row").count();
    for (let i = 0; i < taskCount; i++) {
      await page.locator(".task-row").nth(i).click();
      await dlabel("Progress report note").fill("Completed after site inspection");
      await dbutton("Mark Complete").click();
      await expect(dialog()).toHaveCount(0);
    }
    await go(`projects/${projectId}/site-updates`);
    await button("+ Post Site Update").click();
    await dlabel("Work completed").fill(
      "QA completed fit-out and independent site inspection",
    );
    await dlabel("Manpower count").fill("12");
    await dlabel("Demo site author").selectOption("person-3");
    await dbutton("Post Update").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await button("Supervisory review / history").click();
    await dlabel("Demo supervisor").selectOption("person-0");
    await dlabel("Supervision note / reason").fill(
      "Site completion independently verified",
    );
    await dbutton("Approve Site Record").click();
    expect(
      (await saved()).updates.find((u) => u.projectId === projectId)
        .reviewStatus,
    ).toBe("Approved");
    check(
      width,
      "site record is submitted by an active author and independently supervised before handover",
    );
    await go(`projects/${projectId}/handover`);
    const boxes = page.locator("main input[type=checkbox]:not([disabled])");
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
    await expect(button("Complete Project")).toBeEnabled();
    await button("Complete Project").click();
    await dlabel("Demo handover reviewer").selectOption("person-0");
    await dlabel("Handover confirmation note").fill(
      "Operational criteria verified; commercial obligations remain separate",
    );
    await dbutton("Confirm").click();
    await expect(button("Record Commercial Closure")).toBeDisabled();
    const closureCsv = page.waitForEvent("download");
    await button("Export Closure Summary").click();
    await (await closureCsv).saveAs(`${out}/closure-${width}.csv`);
    await shot("handover");
    check(
      width,
      "complete delivery/tasks → operational handover with unpaid invoice → separate commercial obligations summary",
    );
    await go("reports");
    for (const report of [
      "Variation Register",
      "Purchase Order Register",
      "Material Delivery Status",
      "Supplier Statement",
      "Supplier Outstanding",
      "Purchase Commitment Report",
      "Project Budget vs Actual",
      "Forecast Profitability",
      "Credit Note Register",
      "Approval Pending Report",
    ]) {
      await label("Report").selectOption(report);
      const event = page.waitForEvent("download");
      await button("Export CSV").click();
      await (
        await event
      ).saveAs(`${out}/${width}-${report.replaceAll(" ", "-")}.csv`);
    }
    check(width, "all ten operational reports export live CSV data");
    await go("settings");
    await label("Company name").fill("AZZORA QA Company " + width);
    await label("Company TRN").fill("100000000000001");
    await button("Save Company & Financial Settings").click();
    data = await saved();
    expect(data.operations.orders[0].companySnapshot.name).not.toBe(
      data.operations.settings.company.name,
    );
    expect(data.invoices[0].snapshot.company.name).not.toBe(
      data.operations.settings.company.name,
    );
    await shot("company-settings");
    check(
      width,
      "company settings preserve approved PO and issued invoice snapshots",
    );
    for (const route of [
      "variations",
      "suppliers",
      `suppliers/${supplierA.id}/bills`,
      "procurement/materials",
      "procurement/requests",
      "procurement/rfqs",
      "procurement/comparison",
      "procurement/orders",
      "procurement/deliveries",
      "procurement/bills",
      "procurement/payments",
      "accounts/credit-notes",
      "accounts/refunds",
      "budgets",
      "approvals",
      `projects/${projectId}/financials`,
      `projects/${projectId}/handover`,
      "settings",
      "dashboard",
    ]) {
      await go(route);
      await page.locator("main h1").first().waitFor();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} overflow ${width}`,
      ).toBe(true);
      check(width, "responsive " + route);
    }
    const final = await saved();
    const fixtureRaw = JSON.stringify(final);
    fs.writeFileSync(`${out}/qa-data-${width}.json`, fixtureRaw);
    fs.writeFileSync(
      `${out}/fixture-manifest-${width}.json`,
      JSON.stringify(
        {
          sourceSha,
          sourceTree,
          url,
          width,
          fixtureSha256: createHash("sha256").update(fixtureRaw).digest("hex"),
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    await page.reload();
    expect(await saved()).toEqual(final);
    check(width, "operational persistence after reload");
    await context.close();
  }
  if (errors.length) throw Error(errors.join("\n"));
  fs.writeFileSync(
    `${out}/browser-results.json`,
    JSON.stringify({ sourceSha, sourceTree, url, checks, errors }, null, 2),
  );
  console.log(
    `PASS: ${checks.length} operational journey/responsive checks; no browser errors.`,
  );
} catch (error) {
  fs.writeFileSync(
    `${out}/browser-results.json`,
    JSON.stringify(
      { sourceSha, sourceTree, url, checks, errors, failure: String(error) },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
