import { useMemo, useState } from "react";
import type { Database } from "../domain/model";
import type { AccountingState } from "./model";
import {
  buildBalanceSheet,
  buildGeneralLedger,
  buildProfitAndLoss,
  buildTrialBalance,
} from "./reports";
import type {
  BalanceSheetReport,
  GeneralLedgerReport,
  ProfitAndLossReport,
  StatementSection,
  TrialBalanceReport,
} from "./reports";
import "./accountant-workspace.css";

export interface AccountantDemoReports {
  readonly provenance: "Synthetic fixture";
  readonly trialBalance: TrialBalanceReport;
  readonly profitAndLoss: ProfitAndLossReport;
  readonly balanceSheet: BalanceSheetReport;
  readonly generalLedgers: readonly GeneralLedgerReport[];
}

export interface AccountantWorkspaceProps {
  readonly db: Database;
  /** Structural subset of FinanceDemoState; only synthetic-demo journals may be shown. */
  readonly finance?: { readonly mode: "synthetic-demo"; readonly accounting: AccountingState };
  readonly asOf?: string;
  /** Coordinator-supplied read model from authoritative legacy document adapters. */
  readonly legacyArAp?: LegacyArApView;
  /** Optional synthetic reports supplied by a caller; no browser storage is read here. */
  readonly demoReports?: AccountantDemoReports;
}

export interface LegacyOutstandingRow {
  readonly documentId: string;
  readonly number: string;
  readonly partyName: string;
  readonly due: string;
  readonly bucket: string;
  readonly outstandingFils: string;
}

export interface LegacyArApView {
  readonly asOf: string;
  readonly receivables: readonly LegacyOutstandingRow[];
  readonly payables: readonly LegacyOutstandingRow[];
  readonly limitations: readonly string[];
}

type View = "overview" | "ledger" | "trial" | "profit-loss" | "balance-sheet" | "receivables";
const VIEWS: readonly { id: View; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "ledger", label: "General Ledger" },
  { id: "trial", label: "Trial Balance" },
  { id: "profit-loss", label: "Profit & Loss" },
  { id: "balance-sheet", label: "Balance Sheet" },
  { id: "receivables", label: "AR / AP" },
];

function money(value: string): string {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  const units = absolute / 100n;
  const fils = (absolute % 100n).toString().padStart(2, "0");
  return `${amount < 0n ? "−" : ""}AED ${new Intl.NumberFormat("en-AE").format(units)}.${fils}`;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="accountant-empty" role="status">
      <span className="accountant-empty-mark" aria-hidden="true">—</span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

function StatementRows({ section, totalLabel }: { section: StatementSection; totalLabel: string }) {
  return (
    <section className="accountant-statement-section">
      <div className="accountant-statement-rows">
        {section.rows.length ? section.rows.map((row) => (
          <div className="accountant-statement-row" key={row.accountId}>
            <span><span className="accountant-account-code">{row.code}</span> {row.name}</span>
            <strong>{money(row.normalBalanceFils)}</strong>
          </div>
        )) : <p className="accountant-muted">No posted entries in this section.</p>}
      </div>
      <div className="accountant-statement-total"><span>{totalLabel}</span><strong>{money(section.totalFils)}</strong></div>
    </section>
  );
}

function deriveSyntheticReports(
  finance: AccountantWorkspaceProps["finance"],
  asOf: string,
): AccountantDemoReports | undefined {
  if (!finance || finance.mode !== "synthetic-demo" || finance.accounting.journals.length === 0)
    return undefined;
  const state = finance.accounting;
  const from = `${asOf.slice(0, 4)}-01-01`;
  return {
    provenance: "Synthetic fixture",
    trialBalance: buildTrialBalance(state, asOf),
    profitAndLoss: buildProfitAndLoss(state, from, asOf),
    balanceSheet: buildBalanceSheet(state, asOf),
    generalLedgers: state.accounts
      .filter((account) => account.postable)
      .map((account) => buildGeneralLedger(state, account.id, from, asOf)),
  };
}

export function AccountantWorkspace({ db, finance, asOf, legacyArAp, demoReports: suppliedReports }: AccountantWorkspaceProps) {
  const [view, setView] = useState<View>("overview");
  const [ledgerId, setLedgerId] = useState("");
  const reportDate = asOf ?? new Date().toISOString().slice(0, 10);
  const demoReports = useMemo(
    () => suppliedReports ?? deriveSyntheticReports(finance, reportDate),
    [suppliedReports, finance, reportDate],
  );
  const selectedLedger = demoReports?.generalLedgers.find((ledger) => ledger.account.id === ledgerId)
    ?? demoReports?.generalLedgers[0];

  return (
    <section className="accountant-workspace" aria-labelledby="accountant-title">
      <div className="accountant-workspace-header">
        <div>
          <p className="accountant-eyebrow">AZZORA · Finance workbench</p>
          <h1 id="accountant-title">Accountant workspace</h1>
          <p className="accountant-lede">Review the shape of the ledger and statement workflow.</p>
        </div>
        <span className="accountant-preview-tag">Local preview</span>
      </div>

      <div className="accountant-demo-notice" role="note">
        <strong>Browser-local synthetic demo</strong>
        <span>Journal statements use synthetic fixtures; AR/AP reads existing browser records. This preview has no secure login, trusted role authorization, or live accounting posting.</span>
      </div>

      <nav className="accountant-nav" aria-label="Accountant reports">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "accountant-nav-item is-active" : "accountant-nav-item"}
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => setView(item.id)}
          >{item.label}</button>
        ))}
      </nav>

      {view === "overview" && (
        <div className="accountant-content" id="accountant-overview">
          <div className="accountant-section-heading">
            <div><p className="accountant-eyebrow">Journal-derived view</p><h2>Accounting position</h2></div>
            <span className="accountant-date">{demoReports ? `As of ${demoReports.balanceSheet.asOf}` : "Awaiting synthetic fixture"}</span>
          </div>
          {demoReports ? (
            <>
              <div className="accountant-metrics">
                <div className="accountant-metric"><span>Total assets</span><strong>{money(demoReports.balanceSheet.assets.totalFils)}</strong><small>Balance Sheet</small></div>
                <div className="accountant-metric"><span>Current earnings</span><strong>{money(demoReports.balanceSheet.currentEarningsFils)}</strong><small>Unclosed journal result</small></div>
                <div className="accountant-metric"><span>Trial Balance</span><strong>{demoReports.trialBalance.balanced ? "Reconciled" : "Out of balance"}</strong><small>Debit {money(demoReports.trialBalance.totalDebitFils)}</small></div>
              </div>
              <div className="accountant-note-panel">
                <h3>Reconciliation basis</h3>
                <p>General Ledger, Trial Balance and statements use the same posted synthetic journal lines. Receivable and payable aging reads existing CRM documents separately.</p>
              </div>
            </>
          ) : <EmptyState title="No report fixture connected" detail="Supply a synthetic posted-journal report set to review this workspace. Existing CRM data is not read or posted here." />}
        </div>
      )}

      {view === "ledger" && (
        <div className="accountant-content">
          <div className="accountant-section-heading"><div><p className="accountant-eyebrow">Posted journal lines</p><h2>General Ledger</h2></div></div>
          {selectedLedger ? (
            <>
              <label className="accountant-field-label" htmlFor="accountant-ledger-account">Account</label>
              <select id="accountant-ledger-account" className="accountant-account-select" value={selectedLedger.account.id} onChange={(event) => setLedgerId(event.target.value)}>
                {demoReports?.generalLedgers.map((ledger) => <option key={ledger.account.id} value={ledger.account.id}>{ledger.account.code} · {ledger.account.name}</option>)}
              </select>
              <p className="accountant-date">{selectedLedger.from} – {selectedLedger.to}</p>
              <div className="accountant-table-wrap"><table className="accountant-table">
                <caption>Journal activity for {selectedLedger.account.name}</caption>
                <thead><tr><th scope="col">Date</th><th scope="col">Source / memo</th><th scope="col" className="amount">Debit</th><th scope="col" className="amount">Credit</th><th scope="col" className="amount">Running balance</th></tr></thead>
                <tbody>
                  <tr className="accountant-opening"><td colSpan={4}>Opening balance</td><td className="amount">{money(selectedLedger.openingBalanceFils)}</td></tr>
                  {selectedLedger.lines.map((line, index) => <tr key={`${line.journalId}-${index}`}><td>{line.date}</td><td><span className="accountant-source">{line.source.kind} · {line.source.id}</span><span>{line.memo}</span></td><td className="amount">{line.debitFils === "0" ? "—" : money(line.debitFils)}</td><td className="amount">{line.creditFils === "0" ? "—" : money(line.creditFils)}</td><td className="amount">{money(line.runningBalanceFils)}</td></tr>)}
                  <tr className="accountant-closing"><td colSpan={4}>Closing balance</td><td className="amount">{money(selectedLedger.closingBalanceFils)}</td></tr>
                </tbody>
              </table></div>
            </>
          ) : <EmptyState title="No ledger fixture connected" detail="A posted synthetic account ledger is required to inspect journal activity." />}
        </div>
      )}

      {view === "trial" && (
        <div className="accountant-content">
          <div className="accountant-section-heading"><div><p className="accountant-eyebrow">Account balances</p><h2>Trial Balance</h2></div><span className="accountant-date">{demoReports?.trialBalance.asOf}</span></div>
          {demoReports ? <div className="accountant-table-wrap"><table className="accountant-table">
            <caption>Trial Balance as of {demoReports.trialBalance.asOf}</caption>
            <thead><tr><th scope="col">Code</th><th scope="col">Account</th><th scope="col" className="amount">Debit</th><th scope="col" className="amount">Credit</th></tr></thead>
            <tbody>{demoReports.trialBalance.rows.map((row) => <tr key={row.accountId}><td>{row.code}</td><td>{row.name}</td><td className="amount">{row.debitFils === "0" ? "—" : money(row.debitFils)}</td><td className="amount">{row.creditFils === "0" ? "—" : money(row.creditFils)}</td></tr>)}
              <tr className="accountant-closing"><td colSpan={2}>Totals · {demoReports.trialBalance.balanced ? "balanced" : "review required"}</td><td className="amount">{money(demoReports.trialBalance.totalDebitFils)}</td><td className="amount">{money(demoReports.trialBalance.totalCreditFils)}</td></tr>
            </tbody>
          </table></div> : <EmptyState title="No Trial Balance fixture connected" detail="Statement rows are calculated only from posted synthetic journal lines." />}
        </div>
      )}

      {view === "profit-loss" && (
        <div className="accountant-content accountant-statement">
          <div className="accountant-section-heading"><div><p className="accountant-eyebrow">Period statement</p><h2>Profit & Loss</h2></div><span className="accountant-date">{demoReports && `${demoReports.profitAndLoss.from} – ${demoReports.profitAndLoss.to}`}</span></div>
          {demoReports ? <ProfitLoss report={demoReports.profitAndLoss} /> : <EmptyState title="No P&L fixture connected" detail="Accounting policy and historical opening balances remain approval gates." />}
        </div>
      )}

      {view === "balance-sheet" && (
        <div className="accountant-content accountant-statement">
          <div className="accountant-section-heading"><div><p className="accountant-eyebrow">As-of statement</p><h2>Balance Sheet</h2></div><span className="accountant-date">{demoReports?.balanceSheet.asOf}</span></div>
          {demoReports ? <BalanceSheet report={demoReports.balanceSheet} /> : <EmptyState title="No Balance Sheet fixture connected" detail="Accounting policy and historical opening balances remain approval gates." />}
        </div>
      )}

      {view === "receivables" && (
        <div className="accountant-content">
          <div className="accountant-section-heading"><div><p className="accountant-eyebrow">Existing CRM document balances</p><h2>Receivables & Payables</h2></div><span className="accountant-pending-tag">Legacy browser records</span></div>
          <p className="accountant-legacy-explainer">{db.invoices.length} invoice records and {db.operations?.bills.length ?? 0} supplier bill records are loaded in this browser. The tables below are supplied by the coordinator’s existing document adapters; they are separate from synthetic journal statements.</p>
          {legacyArAp ? <>
            <p className="accountant-date">As of {legacyArAp.asOf}</p>
            <LegacyOutstandingTable title="Customer receivables" rows={legacyArAp.receivables} />
            <LegacyOutstandingTable title="Supplier payables" rows={legacyArAp.payables} />
            <div className="accountant-legacy-limitations"><h3>Reading these balances</h3><ul>{legacyArAp.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></div>
          </> : <EmptyState title="Document adapter not connected" detail="Customer and supplier aging requires invoice-specific payment allocations and due dates. This preview does not substitute synthetic journal balances for legacy document aging." />}
        </div>
      )}
    </section>
  );
}

function LegacyOutstandingTable({ title, rows }: { title: string; rows: readonly LegacyOutstandingRow[] }) {
  return <section className="accountant-legacy-section">
    <h3>{title}</h3>
    <div className="accountant-table-wrap"><table className="accountant-table accountant-legacy-table">
      <caption>{title} from existing CRM documents</caption>
      <thead><tr><th scope="col">Document</th><th scope="col">Party</th><th scope="col">Due</th><th scope="col">Age</th><th scope="col" className="amount">Outstanding</th></tr></thead>
      <tbody>{rows.length ? rows.map((row) => <tr key={row.documentId}><td>{row.number}</td><td>{row.partyName}</td><td>{row.due}</td><td>{row.bucket}</td><td className="amount">{money(row.outstandingFils)}</td></tr>) : <tr><td colSpan={5}>No outstanding documents in this view.</td></tr>}</tbody>
    </table></div>
  </section>;
}

function ProfitLoss({ report }: { report: ProfitAndLossReport }) {
  return <>
    <StatementRows section={report.income} totalLabel="Income" />
    <StatementRows section={report.costOfSales} totalLabel="Cost of sales" />
    <div className="accountant-statement-total is-major"><span>Gross profit</span><strong>{money(report.grossProfitFils)}</strong></div>
    <StatementRows section={report.expenses} totalLabel="Operating expenses" />
    <div className="accountant-statement-total is-final"><span>Net profit / loss</span><strong>{money(report.netProfitFils)}</strong></div>
  </>;
}

function BalanceSheet({ report }: { report: BalanceSheetReport }) {
  return <>
    <StatementRows section={report.assets} totalLabel="Total assets" />
    <StatementRows section={report.liabilities} totalLabel="Total liabilities" />
    <StatementRows section={report.equity} totalLabel="Posted equity" />
    <div className="accountant-statement-total"><span>Unclosed current earnings</span><strong>{money(report.currentEarningsFils)}</strong></div>
    <div className="accountant-statement-total is-final"><span>Liabilities + equity</span><strong>{money(report.liabilitiesAndEquityFils)}</strong></div>
    <p className={report.balanced ? "accountant-reconciliation is-balanced" : "accountant-reconciliation is-unbalanced"} role="status">
      {report.balanced ? "Statement balances to the fils." : `Reconciliation difference: ${money(report.differenceFils)}. Review the journal view.`}
    </p>
  </>;
}
