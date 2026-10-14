import { chromium, expect } from "@playwright/test";
import { buildSync } from "esbuild";
import Module from "node:module";
import path from "node:path";
import fs from "node:fs";
import { browserOptions } from "./browser-runtime.mjs";
const url = process.env.AZZORA_URL || "http://127.0.0.1:5206",
  out = "tmp/rapid-search",
  diagnose = process.argv.includes("--diagnose");
fs.mkdirSync(out, { recursive: true });
// Source-bound fixture; no dependency on a stale integration export or browser profile.
const code = buildSync({
  stdin: {
    contents: `export {seed} from './src/domain/seed';export {initializeCommercial} from './src/commercial/migration';export {changeQuotationStatus} from './src/quotation/repository';export {convertQuotation,blankInvoice,saveInvoice,issueInvoice} from './src/commercial/repository';export * from './src/operations/repository';export {saveTask} from './src/domain/repository';export {uid,today,addDays} from './src/domain/logic';`,
    resolveDir: process.cwd(),
    sourcefile: "rapid-fixture.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  logLevel: "silent",
}).outputFiles[0].text;
const fixtureModule = new Module(path.join(process.cwd(), "rapid-fixture.cjs"));
fixtureModule.filename = fixtureModule.id;
fixtureModule.paths = Module._nodeModulePaths(process.cwd());
fixtureModule._compile(code, fixtureModule.filename);
const a = fixtureModule.exports,
  db = a.seed();
a.initializeCommercial(db);
const project = db.projects[0],
  q = db.quotations[0];
q.projectId = project.id;
q.customerId = project.clientId;
q.project = { name: project.name, location: project.location };
q.customer.name = db.clients[0].name;
a.changeQuotationStatus(db, q.id, "Finalized");
a.changeQuotationStatus(db, q.id, "Accepted");
a.convertQuotation(db, q.id, project.id);
const supplier = a.saveSupplier(
  db,
  {
    id: a.uid(),
    code: "",
    name: "Rapid Search Supplier",
    contact: "QA",
    phone: "",
    whatsapp: "",
    email: "rapid@example.com",
    address: "Dubai",
    emirate: "Dubai",
    country: "UAE",
    trn: "",
    bank: "",
    category: "Materials",
    terms: "30 days",
    notes: "",
    status: "Active",
    createdAt: new Date().toISOString(),
  },
  "person-0",
);
const contract = db.contracts[0],
  variation = a.saveVariation(
    db,
    {
      id: a.uid(),
      familyId: a.uid(),
      revision: 0,
      number: "",
      projectId: project.id,
      customerId: project.clientId,
      contractId: contract.id,
      title: "Rapid Search Variation",
      description: "Fixture",
      reason: "QA scope",
      requesterId: "person-0",
      date: a.today(),
      direction: "Addition",
      items: [
        {
          id: a.uid(),
          description: "Scope",
          quantity: "1",
          unit: "LS",
          rate: "100",
          tax: "Exclusive",
        },
      ],
      discount: "0",
      vatPercentage: "5",
      notes: "",
      attachments: [],
      status: "Draft",
    },
    "person-0",
  );
function approve(kind, id) {
  const request = a.submitApproval(
    db,
    kind,
    id,
    "Internal",
    "person-0",
    "person-1",
  );
  a.decideApproval(
    db,
    request.id,
    true,
    "Independent fixture review",
    "person-1",
  );
}
const material = a.saveMaterial(
  db,
  {
    id: a.uid(),
    number: "",
    projectId: project.id,
    name: "Rapid material",
    specification: "QA",
    unit: "Nos",
    quantity: "1",
    requiredDate: a.addDays(a.today(), 7),
    requesterId: "person-0",
    priority: "Normal",
    notes: "",
    attachments: [],
  },
  "person-0",
);
const request = a.saveRequest(
  db,
  {
    id: a.uid(),
    number: "",
    projectId: project.id,
    materialIds: [material.id],
    requesterId: "person-0",
    date: a.today(),
    notes: "Rapid request",
    status: "Draft",
  },
  "person-0",
);
approve("Purchase Request", request.id);
const rfq = a.createRfq(
  db,
  request.id,
  supplier.id,
  a.addDays(a.today(), 7),
  a.today(),
  "person-0",
);
const quote = a.saveSupplierQuote(
  db,
  {
    id: a.uid(),
    number: "",
    rfqId: rfq.id,
    projectId: project.id,
    supplierId: supplier.id,
    items: rfq.items.map((item) => ({ ...item, rate: "100" })),
    deliveryCharge: "0",
    vatPercentage: "5",
    leadDays: 2,
    terms: "30 days",
    remarks: "QA",
    status: "Received",
  },
  "person-0",
);
approve("Supplier Quotation", quote.id);
const order = a.createOrder(
  db,
  quote.id,
  "QA site",
  a.addDays(a.today(), 7),
  "person-0",
);
approve("Purchase Order", order.id);
a.receiveDelivery(
  db,
  {
    id: a.uid(),
    number: "",
    poId: order.id,
    projectId: project.id,
    date: a.today(),
    quantities: order.items.map((item) => ({
      itemId: item.id,
      quantity: item.quantity,
    })),
    receiverId: "person-0",
    reference: "RAPID-DELIVERY",
    remarks: "QA",
  },
  "person-0",
);
const bill = a.recordBill(
  db,
  {
    id: a.uid(),
    reference: "RAPID-BILL",
    poId: order.id,
    projectId: project.id,
    supplierId: supplier.id,
    date: a.today(),
    due: a.addDays(a.today(), 30),
    quantities: order.items.map((item) => ({
      itemId: item.id,
      quantity: item.quantity,
    })),
    deliveryCharge: "0",
    status: "Issued",
  },
  "person-0",
);
const invoice = a.blankInvoice(project.clientId, project.id);
invoice.lines[0].description = "Rapid credit invoice";
invoice.lines[0].rate = "100";
a.saveInvoice(db, invoice);
a.issueInvoice(db, invoice.id);
const credit = a.saveCredit(
  db,
  {
    id: a.uid(),
    number: "",
    invoiceId: invoice.id,
    projectId: project.id,
    customerId: project.clientId,
    date: a.today(),
    reason: "Rapid Search Credit",
    gross: "10",
    itemId: "",
    status: "Draft",
  },
  "person-0",
);
const taskName = "RAPID-SEARCH-MODAL-TASK";
a.saveTask(db, { ...db.tasks[0], name: taskName });
const targets = [
  {
    type: "Supplier",
    query: supplier.code,
    hash: `#/suppliers/${supplier.id}/overview`,
    heading: supplier.name,
    text: supplier.name,
  },
  {
    type: "Variation",
    query: variation.number,
    hash: `#/variations/${variation.id}`,
    heading: "Variations",
    text: variation.number,
  },
  {
    type: "Purchase Request",
    query: request.number,
    hash: "#/procurement/requests",
    heading: "Procurement",
    text: request.number,
    tab: "#/procurement/requests",
  },
  {
    type: "Purchase Order",
    query: order.number,
    hash: "#/procurement/orders",
    heading: "Procurement",
    text: order.number,
    tab: "#/procurement/orders",
  },
  {
    type: "Supplier Bill",
    query: bill.number,
    hash: "#/procurement/bills",
    heading: "Procurement",
    text: bill.number,
    tab: "#/procurement/bills",
  },
  {
    type: "Credit Note",
    query: credit.number,
    hash: `#/accounts/credit-notes/${credit.id}`,
    heading: "Credit Notes",
    text: credit.number,
  },
];
function searchControls(page) {
  const input = page.getByLabel("Global search", { exact: true }),
    main = page.locator("main");
  const hit = (type) =>
    page
      .locator(".search-results button")
      .filter({
        has: page.locator("small", { hasText: new RegExp(`^${type}$`) }),
      });
  const destination = async (target) => {
    await expect(page).toHaveURL(url + "/" + target.hash);
    await expect(main.locator("h1").first()).toHaveText(target.heading);
    if (target.tab)
      await expect(
        main.locator(`.tabs a.active[href='${target.tab}']`),
      ).toHaveCount(1);
    await expect(main).toContainText(target.text);
  };
  return { input, main, hit, destination };
}
const browser = await chromium.launch(browserOptions),
  checks = [],
  observations = [],
  errors = [];
let failure, activePage;
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    await context.addInitScript(() => {
      const add = window.addEventListener.bind(window),
        remove = window.removeEventListener.bind(window),
        wrapped = new Map();
      const gate = { hold: false, pending: [], trace: [], nativeCount: 0 };
      window.__rapidSearch = gate;
      const log = (type, event) =>
        gate.trace.push({
          type,
          at: performance.now(),
          hash: location.hash,
          input: document.querySelector('[aria-label="Global search"]')?.value,
          oldURL: event?.oldURL,
          newURL: event?.newURL,
        });
      window.addEventListener = (type, listener, options) => {
        if (type !== "hashchange" || !listener)
          return add(type, listener, options);
        if (!wrapped.has(listener))
          wrapped.set(listener, (event) => {
            gate.nativeCount++;
            log("native", event);
            const invoke = () => {
              log("callback", event);
              if (typeof listener === "function") listener.call(window, event);
              else listener.handleEvent(event);
            };
            if (gate.hold) gate.pending.push(invoke);
            else invoke();
          });
        return add(type, wrapped.get(listener), options);
      };
      window.removeEventListener = (type, listener, options) =>
        remove(
          type,
          type === "hashchange" ? wrapped.get(listener) || listener : listener,
          options,
        );
      add("input", (event) => {
        if (event.target?.getAttribute?.("aria-label") === "Global search")
          log("input");
      });
      gate.release = () => {
        gate.hold = false;
        const count = gate.pending.length;
        while (gate.pending.length) gate.pending.shift()();
        return count;
      };
    });
    const page = await context.newPage();
    activePage = page;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`${url}/#/dashboard`);
    await page.evaluate(
      (value) => localStorage.setItem("azzora-demo-v1", JSON.stringify(value)),
      db,
    );
    await page.reload();
    const { input, main, hit, destination } = searchControls(page);
    const record = (name) => checks.push({ width, name, status: "passed" });
    const hold = () => page.evaluate(() => (window.__rapidSearch.hold = true)),
      pending = (n) =>
        page.waitForFunction(
          (n) => window.__rapidSearch.pending.length === n,
          n,
        ),
      release = () => page.evaluate(() => window.__rapidSearch.release());
    const original = await page.evaluate(() =>
      localStorage.getItem("azzora-demo-v1"),
    );
    await input.fill(targets[0].query);
    await expect(hit("Supplier")).toHaveCount(1);
    await hold();
    await hit("Supplier").click();
    await expect(page).toHaveURL(url + "/" + targets[0].hash);
    await expect(input).toHaveValue("");
    await pending(1);
    await input.fill(targets[1].query);
    await expect(hit("Variation")).toHaveCount(1);
    expect(await release()).toBe(1);
    await destination(targets[0]);
    if (diagnose) {
      await expect(input).toHaveValue("");
      await expect(hit("Variation")).toHaveCount(0);
      observations.push({
        width,
        case: "delayed supplier route event erases fresh variation query",
        typed: targets[1].query,
        after: "",
        destination: targets[0].hash,
      });
    } else {
      await expect(input).toHaveValue(targets[1].query);
      await expect(hit("Variation")).toHaveCount(1);
      record(
        "held old hashchange preserves a fresh query typed after its URL changed",
      );
      await hold();
      await page.evaluate(() => (location.hash = "/procurement/orders"));
      await pending(1);
      expect(await release()).toBe(1);
      await destination(targets[3]);
      await expect(input).toHaveValue("");
      record(
        "ordinary navigation dismisses a query belonging to the previous location",
      );
      await input.fill(targets[3].query);
      await expect(hit("Purchase Order")).toHaveCount(1);
      const events = await page.evaluate(
        () => window.__rapidSearch.nativeCount,
      );
      await hit("Purchase Order").click();
      await destination(targets[3]);
      await expect(input).toHaveValue("");
      expect(await page.evaluate(() => window.__rapidSearch.nativeCount)).toBe(
        events,
      );
      record(
        "same-route result click dismisses immediately without needing a hashchange",
      );
      await input.fill(taskName);
      await expect(hit("Task")).toHaveCount(1);
      await hit("Task").focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("dialog").getByLabel("Task name", { exact: true }),
      ).toHaveValue(taskName);
      await expect(input).toHaveValue("");
      await expect(page).toHaveURL(url + "/" + targets[3].hash);
      await page.keyboard.press("Escape");
      record(
        "keyboard modal-result selection clears search while retaining its route",
      );
      await input.fill(targets[0].query);
      await hold();
      await page.evaluate(() => {
        location.hash = "/procurement/requests";
        location.hash = "/procurement/bills";
      });
      await pending(2);
      await input.fill(targets[5].query);
      expect(await release()).toBe(2);
      await destination(targets[4]);
      await expect(input).toHaveValue(targets[5].query);
      await expect(hit("Credit Note")).toHaveCount(1);
      record(
        "two delayed consecutive route callbacks preserve current-location input and final destination",
      );
      await hit("Credit Note").click();
      await destination(targets[5]);
      await input.fill(targets[0].query);
      await hit("Supplier").click();
      await destination(targets[0]);
      await hold();
      await page.goBack();
      await expect(page).toHaveURL(url + "/" + targets[5].hash);
      await pending(1);
      await input.fill(targets[1].query);
      expect(await release()).toBe(1);
      await destination(targets[5]);
      await expect(input).toHaveValue(targets[1].query);
      await expect(hit("Variation")).toHaveCount(1);
      record(
        "delayed Back callback preserves a query typed for the returned location",
      );
      await hold();
      await page.goForward();
      await expect(page).toHaveURL(url + "/" + targets[0].hash);
      await pending(1);
      await input.fill(targets[2].query);
      expect(await release()).toBe(1);
      await destination(targets[0]);
      await expect(input).toHaveValue(targets[2].query);
      await expect(hit("Purchase Request")).toHaveCount(1);
      record(
        "delayed Forward callback preserves a query typed for the returned location",
      );
      await page.goBack();
      await destination(targets[5]);
      await expect(input).toHaveValue("");
      await input.fill(targets[0].query);
      await page.goForward();
      await destination(targets[0]);
      await expect(input).toHaveValue("");
      record("normal Back and Forward dismiss old-location queries");
      await input.focus();
      await input.pressSequentially(targets[2].query);
      await expect(hit("Purchase Request")).toHaveCount(1);
      await page.keyboard.press("Tab");
      await expect(hit("Purchase Request")).toBeFocused();
      await page.keyboard.press("Enter");
      await destination(targets[2]);
      await expect(input).toHaveValue("");
      record(
        "typed search, Tab and Enter reach the exact result on desktop/mobile",
      );
      await input.fill(targets[0].query);
      await expect(hit("Supplier")).toHaveCount(1);
      if (width < 768)
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
      const management = page
        .getByRole("complementary", { name: "Main navigation", exact: true })
        .getByRole("button", { name: "Management", exact: true });
      if ((await management.getAttribute("aria-expanded")) === "false")
        await management.click();
      await page.locator('.sidebar nav a[href="#/reports"]').click();
      await expect(page).toHaveURL(url + "/#/reports");
      await expect(main.locator("h1").first()).toContainText("Reports");
      await expect(input).toHaveValue("");
      record("normal navigation link dismisses search results");
      expect(
        await page.evaluate(() => localStorage.getItem("azzora-demo-v1")),
      ).toBe(original);
    }
    fs.writeFileSync(
      `${out}/${diagnose ? "baseline-" : ""}trace-${width}.json`,
      JSON.stringify(
        await page.evaluate(() => window.__rapidSearch.trace),
        null,
        2,
      ),
    );
    await context.close();
    if (!diagnose) {
      // Fresh ordinary context: no init script, callback wrapper or event gate.
      const rapidContext = await browser.newContext({
          viewport: { width, height: 1000 },
        }),
        rapidPage = await rapidContext.newPage();
      activePage = rapidPage;
      rapidPage.on("pageerror", (error) => errors.push(error.message));
      rapidPage.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await rapidPage.goto(`${url}/#/dashboard`);
      await rapidPage.evaluate(
        (value) =>
          localStorage.setItem("azzora-demo-v1", JSON.stringify(value)),
        db,
      );
      await rapidPage.reload();
      const { input, hit, destination } = searchControls(rapidPage);
      for (let cycle = 0; cycle < 12; cycle++)
        for (let index = 0; index < targets.length; index++) {
          const current = targets[index],
            next = targets[(index + 1) % targets.length];
          await input.fill(current.query);
          await expect(hit(current.type)).toHaveCount(1);
          await hit(current.type).click();
          await expect(rapidPage).toHaveURL(url + "/" + current.hash);
          await expect(input).toHaveValue("");
          // Type before awaiting destination render, matching the observed race.
          await input.fill(next.query);
          await destination(current);
          await expect(input).toHaveValue(next.query);
          await expect(hit(next.type)).toHaveCount(1);
          record(
            `unwrapped rapid cycle ${cycle + 1}: exact ${current.type} destination and intact next ${next.type} query`,
          );
        }
      expect(
        await rapidPage.evaluate(() => localStorage.getItem("azzora-demo-v1")),
      ).toBe(original);
      record(
        "all rapid navigation leaves source-bound financial data unchanged",
      );
      await rapidContext.close();
    }
  }
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    diagnose
      ? `REPRODUCED: ${observations.length} deterministic delayed-hashchange search failures.`
      : `PASS: ${checks.length} rapid-search checks; no browser errors.`,
  );
} catch (error) {
  failure = String(error);
  if (activePage && !activePage.isClosed()) {
    fs.writeFileSync(
      `${out}/failure-state.json`,
      JSON.stringify(
        await activePage.evaluate(() => ({
          hash: location.hash,
          input: document.querySelector('[aria-label="Global search"]')?.value,
          results: [...document.querySelectorAll(".search-results button")].map(
            (button) => button.textContent,
          ),
        })),
        null,
        2,
      ),
    );
    await activePage.screenshot({ path: `${out}/failure.png` });
  }
  throw error;
} finally {
  fs.writeFileSync(
    `${out}/${diagnose ? "baseline-reproduction" : "browser-results"}.json`,
    JSON.stringify({ checks, observations, errors, failure }, null, 2),
  );
  await browser.close();
}
