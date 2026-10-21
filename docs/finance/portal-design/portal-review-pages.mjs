import { accounts, activityPeriod, asOf, bills, fixture, invoices, journals, overdueDays } from "./finance-fixture.mjs";

const aed = fils => `AED ${(fils / 100).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const line = (label, amount, variant = "") => `<div class="statement-row ${variant}"><span>${label}</span><strong>${aed(amount)}</strong></div>`;
const emptyAction = label => `<button class="button button-secondary" type="button" disabled title="Requires approved backend and policy">${label}</button>`;
const status = (text, kind = "neutral") => `<span class="badge badge-${kind}">${text}</span>`;
const table = (headers, rows, footer = "") => `<section class="panel table-panel"><div class="table-scroll"><table><thead><tr>${headers.map(h => `<th class="${h.money ? "money" : ""}">${h.label}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>${footer ? `<div class="table-foot">${footer}</div>` : ""}</section>`;
const moneyCell = value => `<td class="money">${aed(value)}</td>`;

export function buildReviewPages({ shell, pageHead, demoNote, btn }) {
  function dashboard() {
    const metrics = [
      ["Revenue", fixture.revenue, `Activity · ${activityPeriod}`],
      ["Cost of sales", fixture.costOfSales, `Activity · ${activityPeriod}`],
      ["Operating expenses", fixture.operatingExpenses, `Activity · ${activityPeriod}`],
      ["Gross profit", fixture.grossProfit, `Activity · ${activityPeriod}`],
      ["Net profit", fixture.netProfit, `Activity · ${activityPeriod}`, "positive"],
      ["Receivables", fixture.receivables, `Balance · as of ${asOf}`],
      ["Payables", fixture.payables, `Balance · as of ${asOf}`],
      ["Bank & cash", fixture.bankAndCash, `Balance · as of ${asOf}`],
    ];
    const metricGrid = `<section class="metrics-grid metrics-eight" aria-label="Financial summary">${metrics.map(([name, value, period, kind]) => `<div class="metric"><span class="metric-label">${name}</span><strong class="metric-value ${kind || ""}">${aed(value)}</strong><small>${period}</small></div>`).join("")}</section>`;
    const chartRows = [
      ["Revenue", fixture.revenue, "revenue"],
      ["Cost of sales", fixture.costOfSales, "cost"],
      ["Operating", fixture.operatingExpenses, "operating"],
      ["Gross profit", fixture.grossProfit, "profit"],
      ["Net profit", fixture.netProfit, "net"],
    ];
    const chart = `<div class="chart" role="img" aria-label="Revenue ${aed(fixture.revenue)} less cost of sales ${aed(fixture.costOfSales)} equals gross profit ${aed(fixture.grossProfit)}; less operating expenses ${aed(fixture.operatingExpenses)} equals net profit ${aed(fixture.netProfit)}">${chartRows.map(([name, value, cls]) => `<div class="chart-row"><span>${name}</span><div class="chart-track"><i class="bar ${cls}" style="width:${Math.max(3, value / fixture.revenue * 100)}%"></i></div><strong>${(value / 100).toLocaleString("en-AE")}</strong></div>`).join("")}</div>`;
    return shell("dashboard", `${pageHead("OVERVIEW", "Financial dashboard", "Financial activity and position, with reporting bases shown separately.", `${btn("Record receipt", "receipt")}${btn("+ New invoice", "invoice", "button-primary")}`)}${demoNote}<div class="basis-strip"><div><span class="field-caption">ACTIVITY PERIOD</span><strong>${activityPeriod}</strong><small>Accrual basis · posted fictional journals</small></div><div><span class="field-caption">POSITION DATE</span><strong>As of ${asOf}</strong><small>Open documents and closing account balances</small></div></div>${metricGrid}<div class="dashboard-grid"><section class="panel performance"><div class="panel-head"><div><span class="eyebrow">PERFORMANCE</span><h2>Income and cost</h2></div><span class="panel-meta">AED · ${activityPeriod}</span></div>${chart}<div class="panel-link">${btn("View profit & loss →", "pnl", "text-link")}</div></section><section class="panel attention"><div class="panel-head"><div><span class="eyebrow">REQUIRES ATTENTION</span><h2>Open balances</h2></div><span class="panel-meta">As of ${asOf}</span></div><div class="attention-row"><div><strong>Overdue receivables</strong><small>2 customer invoices</small></div><strong>${aed(fixture.receivables)}</strong></div><div class="attention-row"><div><strong>Open supplier bills</strong><small>1 overdue · 1 current</small></div><strong>${aed(fixture.payables)}</strong></div><div class="attention-row"><div><strong>Expense submissions</strong><small>2 awaiting review · excluded from posting</small></div><strong>2</strong></div><div class="panel-link">${btn("Review aging →", "ar-aging", "text-link")}</div></section></div><section class="panel activity"><div class="panel-head"><div><span class="eyebrow">TRANSACTIONS</span><h2>Recent financial activity</h2></div><span class="panel-meta">October 2026</span></div><div class="table-scroll"><table><thead><tr><th>Date</th><th>Reference</th><th>Party</th><th>Transaction</th><th class="money">Amount</th><th>Status</th></tr></thead><tbody><tr><td>21 Oct 2026</td><td>RCPT-0042</td><td>Sample Client A</td><td>Customer receipt</td>${moneyCell(500000)}<td>${status("Allocated", "success")}</td></tr><tr><td>17 Oct 2026</td><td>PAY-0031</td><td>Sample Supplier B</td><td>Supplier payment</td>${moneyCell(300000)}<td>${status("Posted", "success")}</td></tr><tr><td>10 Oct 2026</td><td>INV-26042</td><td>Sample Client A</td><td>Tax invoice</td>${moneyCell(800000)}<td>${status("Part paid", "warning")}</td></tr></tbody></table></div></section>`);
  }

  function purchases() {
    const rows = bills.map(bill => `<tr><td class="strong-cell">${bill.id}</td><td>${bill.party}</td><td>${bill.category}</td><td>${bill.due}</td>${moneyCell(bill.gross)}${moneyCell(bill.paid)}${moneyCell(bill.gross - bill.paid)}<td>${status(bill.paid ? "Part paid" : "Open", bill.paid ? "warning" : "neutral")}</td></tr>`);
    return shell("purchases", `${pageHead("PURCHASES & PAYABLES", "Purchase bills", "Review supplier costs and the specific bills awaiting settlement.", btn("Record supplier payment", "supplier-payment", "button-primary"))}${demoNote}<div class="list-summary"><span><strong>${bills.length}</strong> supplier bills</span><span><strong>${aed(bills.reduce((n, b) => n + b.gross, 0))}</strong> billed</span><span><strong>${aed(fixture.payables)}</strong> outstanding as of ${asOf}</span></div>${table([{label:"Bill"},{label:"Supplier"},{label:"Classification"},{label:"Due"},{label:"Bill amount",money:true},{label:"Paid",money:true},{label:"Outstanding",money:true},{label:"Status"}], rows, "One bill is project cost of sales; one is company operating expense. Both appear once in the fictional journal.")}<div class="page-followup">${btn("View payable aging →", "ap-aging", "text-link")}</div>`);
  }

  function supplierPayment() {
    const bill = bills[0];
    return shell("supplier-payment", `${pageHead("PURCHASES & PAYABLES", "Supplier payment", "Allocate a payment only to the selected supplier bill.", btn("← Purchase bills", "purchases"))}${demoNote}<div class="form-grid"><section class="panel form-main"><div class="section-heading"><span class="step">01</span><div><h2>Payment details</h2><p>This is a design example; no bank movement occurs.</p></div></div><div class="field-grid"><label>Supplier<select><option>${bill.party}</option></select></label><label>Payment date<input type="date" value="2026-10-17" /></label><label>Paying account<select><option>Business bank · AED</option></select></label><label>Payment reference<input value="PAY-0031" /></label></div><div class="section-heading section-separated"><span class="step">02</span><div><h2>Apply to bill</h2><p>Other supplier bills remain unaffected.</p></div></div><div class="table-scroll"><table class="alloc-table"><thead><tr><th>Apply</th><th>Bill</th><th>Due</th><th class="money">Original</th><th class="money">Payment</th></tr></thead><tbody><tr><td><input type="checkbox" checked aria-label="Apply to bill ${bill.id}" /></td><td class="strong-cell">${bill.id}</td><td>${bill.due}</td>${moneyCell(bill.gross)}<td class="money"><input class="amount-field" value="3,000.00" aria-label="Payment amount for bill ${bill.id}" /></td></tr></tbody></table></div><p class="help-text">The remaining ${aed(bill.gross - bill.paid)} stays payable on this bill.</p></section><aside class="panel form-aside"><span class="eyebrow">PAYMENT CHECK</span><h2>Supplier settlement</h2>${line("Paying", bill.paid)}${line("Allocated", bill.paid)}${line("Unallocated", 0, "subtotal")}<button class="button button-primary button-wide" disabled>Save supplier payment</button><p class="aside-note">Posting, account authorization and bank reconciliation require the approved backend and policy.</p></aside></div>`);
  }

  function expenses() {
    const rows = [
      ["EXP-0041", "Project materials", "Sample Project — Business Bay", 12500, "Pending review"],
      ["EXP-0042", "Site consumables", "Sample Project — Business Bay", 7500, "Pending review"],
    ].map(row => `<tr><td class="strong-cell">${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td>${moneyCell(row[3])}<td>${status(row[4], "warning")}</td></tr>`);
    return shell("expenses", `${pageHead("EXPENSE MANAGEMENT", "Expenses", "Review submissions separately from posted supplier costs.", btn("+ New expense", "expense", "button-primary"))}${demoNote}<div class="list-summary"><span><strong>2</strong> submissions</span><span><strong>${aed(20000)}</strong> pending review</span><span>Excluded from P&amp;L until authorized posting</span></div>${table([{label:"Reference"},{label:"Category"},{label:"Project"},{label:"Submitted",money:true},{label:"Status"}], rows, "The posted operating expense in the journal comes from BILL-26032, not these pending submissions.")}`);
  }

  function banking() {
    let running = 0;
    const bankRows = journals.flatMap(journal => journal.lines.filter(entry => entry.account === "bank").map(entry => {
      running += (entry.debit || 0) - (entry.credit || 0);
      return `<tr><td>${journal.date}</td><td class="strong-cell">${journal.reference}</td><td>${journal.description}</td>${moneyCell(entry.debit || 0)}${moneyCell(entry.credit || 0)}${moneyCell(running)}</tr>`;
    }));
    return shell("banking", `${pageHead("BANKING & CASH", "Bank and cash ledgers", "Trace the fictional bank balance and distinguish cash custody from expenses.", emptyAction("Reconcile account"))}${demoNote}<div class="account-tiles"><div class="panel account-tile"><span class="eyebrow">BUSINESS BANK · AED</span><strong>${aed(fixture.bank)}</strong><small>Reconciles to account 1000 as of ${asOf}</small></div><div class="panel account-tile"><span class="eyebrow">PETTY CASH</span><strong>${aed(fixture.cash)}</strong><small>No fixture movements</small></div><div class="panel account-tile"><span class="eyebrow">THOMAS / STAFF CASH</span><strong>Unavailable</strong><small>Opening balance and custody policy await approval</small></div></div>${table([{label:"Date"},{label:"Reference"},{label:"Business bank movement"},{label:"In",money:true},{label:"Out",money:true},{label:"Running balance",money:true}], bankRows, "Internal bank-to-cash transfers move assets and must never be reported as an expense. No such transfer is posted in this fixture.")}`);
  }

  function aging(kind) {
    const ar = kind === "ar";
    const source = ar ? invoices : bills;
    const rows = source.map(record => {
      const days = overdueDays(record.dueISO);
      return `<tr><td>${record.party}</td><td class="strong-cell">${record.id}</td><td>${record.due}</td>${moneyCell(record.gross)}${moneyCell(record.paid)}${moneyCell(record.gross - record.paid)}<td class="money">${days}</td><td>${status(days ? "Overdue" : "Current", days ? "danger" : "success")}</td></tr>`;
    });
    const total = ar ? fixture.receivables : fixture.payables;
    return shell(ar ? "ar-aging" : "ap-aging", `${pageHead(ar ? "SALES & RECEIVABLES" : "PURCHASES & PAYABLES", ar ? "Receivable aging" : "Payable aging", `Outstanding documents and original due-date age as of ${asOf}.`, btn(ar ? "← Sales invoices" : "← Purchase bills", ar ? "sales" : "purchases"))}${demoNote}<div class="list-summary"><span><strong>${source.length}</strong> open documents</span><span><strong>${aed(total)}</strong> outstanding</span><span>Partial payment does not reset overdue days</span></div>${table([{label:ar?"Customer":"Supplier"},{label:ar?"Invoice":"Bill"},{label:"Due"},{label:"Original",money:true},{label:"Paid",money:true},{label:"Outstanding",money:true},{label:"Overdue days",money:true},{label:"Status"}], rows, `Reconciles to the fictional journal ${ar ? "receivables" : "payables"} control account: ${aed(total)}.`)}`);
  }

  function ledger() {
    const rows = journals.flatMap(journal => journal.lines.map(entry => `<tr><td>${journal.date}</td><td class="strong-cell">${journal.reference}</td><td>${journal.description}</td><td>${accounts[entry.account].code} · ${accounts[entry.account].label}</td><td class="money">${entry.debit ? aed(entry.debit) : "—"}</td><td class="money">${entry.credit ? aed(entry.credit) : "—"}</td></tr>`));
    return shell("ledger", `${pageHead("ACCOUNTING", "General ledger", "All lines in the balanced fictional journal fixture.", emptyAction("Export ledger"))}${demoNote}<div class="basis-strip"><div><span class="field-caption">ACTIVITY PERIOD</span><strong>${activityPeriod}</strong></div><div><span class="field-caption">JOURNAL CHECK</span><strong>Debits ${aed(fixture.debitTotal)} = credits ${aed(fixture.creditTotal)}</strong></div></div>${table([{label:"Date"},{label:"Reference"},{label:"Description"},{label:"Account"},{label:"Debit",money:true},{label:"Credit",money:true}], rows, "Every source event has equal debit and credit lines. The live CRM does not yet post to this journal.")}`);
  }

  const reportNav = active => `<nav class="report-nav" aria-label="Financial statements">${[["pnl", "Profit & loss"], ["balance", "Balance sheet"], ["ledger", "General ledger"]].map(([route, label]) => `<a href="#/demo/${route}" ${active === route ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</nav>`;
  function pnl() {
    return shell("pnl", `${pageHead("FINANCIAL STATEMENTS", "Profit & loss", "Posted fictional journal activity for the selected period.", emptyAction("Print report"))}${demoNote}${reportNav("pnl")}<div class="report-layout"><section class="panel statement"><div class="statement-head"><div><span class="eyebrow">AZZORA ACCOUNTS · DESIGN DEMO</span><h2>Profit & loss</h2><p>${activityPeriod} · accrual basis · AED</p></div><span class="status-dot">Journal reconciles</span></div><div class="statement-group"><h3>Revenue</h3>${line("4000 · Design & build revenue", fixture.revenue)}${line("Total revenue", fixture.revenue, "subtotal")}</div><div class="statement-group"><h3>Cost of sales</h3>${line("5000 · Project supplier costs", fixture.costOfSales)}${line("Total cost of sales", fixture.costOfSales, "subtotal")}</div>${line("Gross profit", fixture.grossProfit, "major")}<div class="statement-group"><h3>Operating expenses</h3>${line("6000 · Company operating bill", fixture.operatingExpenses)}${line("Total operating expenses", fixture.operatingExpenses, "subtotal")}</div>${line("Net profit", fixture.netProfit, "grand")}</section><aside class="report-aside"><span class="eyebrow">REPORT BASIS</span><h3>From posted fixture entries</h3><p>${aed(fixture.revenue)} revenue − ${aed(fixture.costOfSales)} cost of sales = ${aed(fixture.grossProfit)} gross profit. Less ${aed(fixture.operatingExpenses)} operating expenses = ${aed(fixture.netProfit)} net profit.</p><p>Draft proformas and pending expense submissions are excluded.</p><a href="#/demo/ledger">Inspect journal lines →</a></aside></div>`);
  }

  function balance() {
    return shell("balance", `${pageHead("FINANCIAL STATEMENTS", "Balance sheet", `Account balances as of ${asOf}.`, emptyAction("Print report"))}${demoNote}${reportNav("balance")}<div class="report-layout"><section class="panel statement"><div class="statement-head"><div><span class="eyebrow">AZZORA ACCOUNTS · DESIGN DEMO</span><h2>Balance sheet</h2><p>As of ${asOf} · AED</p></div><span class="status-dot">Equation reconciles</span></div><div class="statement-group"><h3>Assets</h3>${line("1000 · Business bank", fixture.bank)}${line("1010 · Petty cash", fixture.cash)}${line("1100 · Accounts receivable", fixture.receivables)}${line("Total assets", fixture.assets, "subtotal")}</div><div class="statement-group"><h3>Liabilities</h3>${line("2100 · Accounts payable", fixture.payables)}${line("Total liabilities", fixture.payables, "subtotal")}</div><div class="statement-group"><h3>Equity</h3>${line("3000 · Opening capital", fixture.capital)}${line("Year-to-date earnings", fixture.netProfit)}${line("Total equity", fixture.capital + fixture.netProfit, "subtotal")}</div>${line("Liabilities + equity", fixture.liabilitiesAndEquity, "grand")}</section><aside class="report-aside"><span class="eyebrow">RECONCILIATION</span><h3>Assets = liabilities + equity</h3><div class="equation"><span>${aed(fixture.assets)}</span><strong>=</strong><span>${aed(fixture.payables)} + ${aed(fixture.capital + fixture.netProfit)}</span></div><p>These are fictional journal balances. Real opening balances and financial policies remain unapproved.</p><a href="#/demo/pnl">Inspect year-to-date earnings →</a></aside></div>`);
  }

  function access() {
    const rows = [
      ["Accountant", "Finance workspace only, within explicit company and account grants", "No project execution or system administration"],
      ["Manager", "Operational CRM and assigned-project functions", "No ledger, bank/cash or full statements by default"],
      ["Owner", "Each workspace only with separately granted entitlement", "Approval limits and MFA still apply"],
    ].map(row => `<tr><td class="strong-cell">${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td></tr>`);
    return shell("access", `${pageHead("WORKSPACE", "Access model", "Proposed permission boundary for the future authenticated product.")}${demoNote}<div class="prototype-inline access-warning"><strong>Architecture proposal, not active security.</strong> The static design routes and fictional values are directly viewable. There are no user accounts, backend denials or protected financial APIs in this prototype.</div>${table([{label:"Role"},{label:"Intended access"},{label:"Boundary"}], rows, "Server-side checks, MFA, revocation and private data are specified in ACCOUNTANT-AUTH-ARCHITECTURE.md and require owner approval.")}<div class="page-followup">${btn("Return to dashboard →", "dashboard", "text-link")}</div>`);
  }

  return { dashboard, purchases, supplierPayment, expenses, banking, arAging: () => aging("ar"), apAging: () => aging("ap"), ledger, pnl, balance, access };
}
