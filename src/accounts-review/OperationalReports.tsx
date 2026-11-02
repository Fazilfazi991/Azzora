import type { ReactNode } from "react";
import { displayMoney, type CompletionSnapshot } from "./completion-ui";

function ReportTable({
  heads,
  children,
  label,
}: {
  heads: string[];
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="panel table-panel">
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        <table>
          <thead>
            <tr>
              {heads.map((head) => (
                <th key={head}>{head}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}
export function OperationalReports({
  data,
  trial = false,
  filters,
}: {
  data: CompletionSnapshot;
  trial?: boolean;
  filters?: ReactNode;
}) {
  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">JOURNAL REPORTING</span>
          <h1>{trial ? "Trial balance" : "Project & department reports"}</h1>
          <p>
            {trial
              ? `Balances as of ${data.asOf}.`
              : `Posted activity for ${data.period.from} – ${data.period.to}.`}{" "}
            All figures derive from the demo journal.
          </p>
        </div>
      </div>
      <div className="prototype-note" role="note">
        <strong>CLIENT REVIEW · FICTIONAL DATA</strong>
        <span>
          Draft documents are excluded. VAT policy and real accounting use
          remain unapproved.
        </span>
      </div>
      {filters}
      {trial ? (
        <>
          <ReportTable
            label="Trial balance"
            heads={["Code", "Account", "Debit", "Credit"]}
          >
            {data.trial.rows.map((item) => (
              <tr key={item.accountId}>
                <td>{item.code}</td>
                <td>{item.name}</td>
                <td className="money">{displayMoney(item.debitFils)}</td>
                <td className="money">{displayMoney(item.creditFils)}</td>
              </tr>
            ))}
            <tr>
              <th colSpan={2}>Total</th>
              <td className="money">
                <strong>{displayMoney(data.trial.totalDebitFils)}</strong>
              </td>
              <td className="money">
                <strong>{displayMoney(data.trial.totalCreditFils)}</strong>
              </td>
            </tr>
          </ReportTable>
          <p
            className={data.trial.balanced ? "review-success" : "review-error"}
            role="status"
          >
            {data.trial.balanced
              ? "Trial balance is balanced."
              : "Trial balance does not reconcile. Review the journal before continuing."}
          </p>
        </>
      ) : (
        <>
          <h2 className="review-section-title">Project profitability</h2>
          <ReportTable
            label="Project profitability"
            heads={[
              "Project",
              "Revenue",
              "Cost of sales",
              "Gross profit",
              "Operating expenses",
              "Net profit",
            ]}
          >
            {data.projectProfitability?.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="money">{displayMoney(item.revenueFils)}</td>
                <td className="money">{displayMoney(item.costOfSalesFils)}</td>
                <td className="money">{displayMoney(item.grossProfitFils)}</td>
                <td className="money">
                  {displayMoney(item.operatingExpensesFils)}
                </td>
                <td className="money">{displayMoney(item.netProfitFils)}</td>
              </tr>
            ))}
            {!data.projectProfitability?.length && (
              <tr>
                <td colSpan={6}>
                  No project activity in this reporting period.
                </td>
              </tr>
            )}
          </ReportTable>
          <h2 className="review-section-title">Expenses by project</h2>
          <ReportTable
            label="Expenses by project"
            heads={[
              "Project",
              "Cost of sales",
              "Operating expenses",
              "Total expense",
            ]}
          >
            {data.expenseSummary?.byProject.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="money">{displayMoney(item.costOfSalesFils)}</td>
                <td className="money">
                  {displayMoney(item.operatingExpensesFils)}
                </td>
                <td className="money">{displayMoney(item.totalFils)}</td>
              </tr>
            ))}
            {!data.expenseSummary?.byProject.length && (
              <tr>
                <td colSpan={4}>No project expense activity.</td>
              </tr>
            )}
          </ReportTable>
          <h2 className="review-section-title">Expenses by department</h2>
          <ReportTable
            label="Expenses by department"
            heads={[
              "Department",
              "Cost of sales",
              "Operating expenses",
              "Total expense",
            ]}
          >
            {data.expenseSummary?.byDepartment.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="money">{displayMoney(item.costOfSalesFils)}</td>
                <td className="money">
                  {displayMoney(item.operatingExpensesFils)}
                </td>
                <td className="money">{displayMoney(item.totalFils)}</td>
              </tr>
            ))}
          </ReportTable>
          <p className="aside-note">
            Unassigned historical costs remain visible instead of receiving an
            assumed department. Department and project views classify the same
            transactions; do not add the two views together.
          </p>
        </>
      )}
    </>
  );
}
