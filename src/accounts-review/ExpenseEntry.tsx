import { useEffect, useRef, useState, type FormEvent } from "react";
import type { reviewSnapshot } from "./domain";
import "./expense-entry.css";

type Snapshot = ReturnType<typeof reviewSnapshot>;
type ExpenseGroup =
  "Administrative Expense" | "Direct Expense" | "Indirect Expense";
type ExpenseLedger = {
  id: string;
  name: string;
  group: ExpenseGroup;
  description?: string;
  accountId: string;
  code: string;
};
type ExpenseDetail = Snapshot["expenses"][number] & {
  ledgerId?: string;
  ledgerName?: string;
  expenseGroup?: ExpenseGroup;
  projectId?: string;
  scope?: "company" | "project";
};
type ExpenseSnapshot = Snapshot & { expenseLedgers?: ExpenseLedger[] };
const groups: ExpenseGroup[] = [
  "Administrative Expense",
  "Direct Expense",
  "Indirect Expense",
];
const normalize = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
const money = (value: string) => {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "−" : ""}AED ${(absolute / 100n).toLocaleString("en-AE")}.${(absolute % 100n).toString().padStart(2, "0")}`;
};
const displayDate = (value: string) =>
  new Intl.DateTimeFormat("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));

async function receiptPayload(file: File | null) {
  if (!file) return undefined;
  if (
    file.size > 2_000_000 ||
    !["application/pdf", "image/png", "image/jpeg"].includes(file.type)
  ) {
    throw Error("Choose a PDF, PNG or JPEG receipt no larger than 2 MB.");
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () =>
      reject(Error("The receipt could not be read. Please select it again."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, mime: file.type, data };
}

/** Paid expenses use the same server command and persisted chart of accounts as the portal. */
export function ExpenseEntry({
  data,
  act,
}: {
  data: Snapshot;
  act: (action: Record<string, unknown>) => Promise<boolean>;
}) {
  const ledgers = (data as ExpenseSnapshot).expenseLedgers ?? [];
  const projects = data.documentCatalog.projects;
  const [ledgerId, setLedgerId] = useState(ledgers[0]?.id ?? "");
  const [scope, setScope] = useState<"company" | "project">(
    ledgers[0]?.group === "Direct Expense" ? "project" : "company",
  );
  const [projectId, setProjectId] = useState("");
  const [creatingLedger, setCreatingLedger] = useState(false);
  const [ledgerName, setLedgerName] = useState("");
  const [ledgerGroup, setLedgerGroup] = useState<ExpenseGroup>(
    "Administrative Expense",
  );
  const [ledgerDescription, setLedgerDescription] = useState("");
  const [ledgerError, setLedgerError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pendingLedger = useRef("");
  const createButton = useRef<HTMLButtonElement>(null);
  const ledgerNameInput = useRef<HTMLInputElement>(null);
  const ledger = ledgers.find((item) => item.id === ledgerId);
  const effectiveScope =
    ledger?.group === "Direct Expense"
      ? "project"
      : ledger?.group === "Administrative Expense"
        ? "company"
        : scope;

  useEffect(() => {
    if (!pendingLedger.current) return;
    const saved = ledgers.find(
      (item) => normalize(item.name) === pendingLedger.current,
    );
    if (!saved) return;
    pendingLedger.current = "";
    setLedgerId(saved.id);
    setScope(saved.group === "Direct Expense" ? "project" : "company");
    setProjectId("");
    setCreatingLedger(false);
    setNotice(
      `${saved.name} was created and selected. Your expense details are preserved.`,
    );
    createButton.current?.focus();
  }, [ledgers]);

  function selectLedger(id: string) {
    setLedgerId(id);
    const selected = ledgers.find((item) => item.id === id);
    if (selected?.group === "Administrative Expense") {
      setScope("company");
      setProjectId("");
    } else if (selected?.group === "Direct Expense") setScope("project");
  }

  async function createLedger() {
    setLedgerError("");
    const name = ledgerName.trim().replace(/\s+/g, " ");
    if (
      name.length < 2 ||
      name.length > 100 ||
      !/[\p{L}\p{N}]/u.test(name) ||
      /[<>]/u.test(name) ||
      Array.from(name).some((character) => character.charCodeAt(0) < 32)
    ) {
      setLedgerError("Enter a ledger name with 2–100 readable characters.");
      ledgerNameInput.current?.focus();
      return;
    }
    if (
      ledgers.some((item) => normalize(item.name) === normalize(name)) ||
      data.accounts.some((item) => normalize(item.name) === normalize(name))
    ) {
      setLedgerError(
        "An expense ledger with this name already exists. Select it above.",
      );
      ledgerNameInput.current?.focus();
      return;
    }
    setBusy(true);
    pendingLedger.current = normalize(name);
    try {
      const saved = await act({
        kind: "create-expense-ledger",
        name,
        group: ledgerGroup,
        description: ledgerDescription.trim(),
      });
      if (!saved) {
        pendingLedger.current = "";
        setLedgerError(
          "The ledger could not be created. Review the message above and try again.",
        );
      } else {
        setLedgerName("");
        setLedgerDescription("");
      }
    } catch (problem) {
      pendingLedger.current = "";
      setLedgerError(
        problem instanceof Error ? problem.message : String(problem),
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (creatingLedger) {
      setError("Create or cancel the new ledger before recording the expense.");
      return;
    }
    if (!ledger) {
      setError("Select a saved expense ledger.");
      return;
    }
    if (
      effectiveScope === "project" &&
      !projects.some((item) => item.id === projectId)
    ) {
      setError("Select an existing project for this expense.");
      return;
    }
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    delete values.file;
    const file =
      (form.elements.namedItem("file") as HTMLInputElement).files?.[0] ?? null;
    setBusy(true);
    try {
      const saved = await act({
        kind: "expense",
        ...values,
        ledgerId: ledger.id,
        scope: effectiveScope,
        projectId: effectiveScope === "project" ? projectId : "",
        attachment: await receiptPayload(file),
      });
      if (saved) {
        form.reset();
        setNotice("Paid expense recorded in the fictional demo ledger.");
      } else
        setError(
          "The expense could not be saved. Review the message above and try again.",
        );
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">OPERATING & PROJECT COSTS</span>
          <h1>Expenses</h1>
          <p>
            Choose a ledger, record a paid expense and keep its receipt
            together.
          </p>
        </div>
        <div className="page-actions">
          <a className="button" href="#/document-entry">
            Read a receipt · save draft
          </a>
        </div>
      </div>
      <div className="prototype-note" role="note">
        <strong>CLIENT REVIEW · FICTIONAL DATA</strong>
        <span>
          Actions update only this isolated demo ledger. No Manager CRM records
          or real money are changed.
        </span>
      </div>
      <form
        className="panel review-form expense-entry"
        onSubmit={submit}
        aria-busy={busy}
      >
        <h2>New paid expense</h2>
        <div className="expense-ledger-choice">
          <label>
            Expense Ledger
            <select
              name="ledgerId"
              value={ledgerId}
              onChange={(event) => selectLedger(event.target.value)}
              required
              disabled={busy}
            >
              <option value="">Select expense ledger</option>
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {ledgers
                    .filter((item) => item.group === group)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            className="button"
            type="button"
            ref={createButton}
            aria-expanded={creatingLedger}
            aria-controls="new-expense-ledger"
            disabled={busy}
            onClick={() => {
              setCreatingLedger((open) => !open);
              setLedgerError("");
              setNotice("");
            }}
          >
            + Create New Ledger
          </button>
        </div>
        {ledger && (
          <p className="expense-ledger-hint">
            {ledger.group}
            {ledger.group === "Direct Expense"
              ? " · charged to the selected project"
              : ledger.group === "Administrative Expense"
                ? " · company administration"
                : " · company or project overhead"}
          </p>
        )}
        {creatingLedger && (
          <fieldset
            id="new-expense-ledger"
            className="expense-ledger-create"
            disabled={busy}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                event.target instanceof HTMLInputElement
              ) {
                event.preventDefault();
                void createLedger();
              }
            }}
          >
            <legend>Create expense ledger</legend>
            <p>
              Save a reusable ledger here. Your expense fields and receipt stay
              in this form.
            </p>
            <div className="field-grid">
              <label>
                Ledger Name
                <input
                  ref={ledgerNameInput}
                  autoFocus
                  value={ledgerName}
                  onChange={(event) => setLedgerName(event.target.value)}
                  maxLength={100}
                />
              </label>
              <label>
                Expense Group
                <select
                  value={ledgerGroup}
                  onChange={(event) =>
                    setLedgerGroup(event.target.value as ExpenseGroup)
                  }
                >
                  {groups.map((group) => (
                    <option key={group}>{group}</option>
                  ))}
                </select>
              </label>
              <label className="expense-ledger-description">
                Description · optional
                <input
                  value={ledgerDescription}
                  onChange={(event) => setLedgerDescription(event.target.value)}
                  maxLength={300}
                />
              </label>
            </div>
            {ledgerError && (
              <p className="review-error" role="alert">
                {ledgerError}
              </p>
            )}
            <div className="review-actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  setCreatingLedger(false);
                  setLedgerError("");
                  createButton.current?.focus();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={() => void createLedger()}
              >
                {busy ? "Creating…" : "Create Ledger"}
              </button>
            </div>
            <p className="aside-note">
              Creating a ledger does not post a payment.
            </p>
          </fieldset>
        )}
        <div className="field-grid">
          <label>
            Payee
            <input
              name="payee"
              defaultValue="Sample Service Provider"
              required
              maxLength={140}
              disabled={busy}
            />
          </label>
          <label>
            Amount · AED (VAT excluded)
            <input
              name="amount"
              type="number"
              defaultValue="75.00"
              min="0.01"
              step="0.01"
              required
              disabled={busy}
            />
          </label>
          <label>
            Date
            <input
              name="date"
              type="date"
              defaultValue={data.asOf}
              required
              disabled={busy}
            />
          </label>
          <label>
            Paid from
            <select name="account" defaultValue="bank" required disabled={busy}>
              <option value="bank">Business bank</option>
              <option value="cash">Petty cash</option>
            </select>
          </label>
          <label>
            Expense for
            <select
              value={effectiveScope}
              onChange={(event) => {
                setScope(event.target.value as "company" | "project");
                setProjectId("");
              }}
              disabled={busy || ledger?.group !== "Indirect Expense"}
            >
              <option value="company">Company</option>
              <option value="project">Project</option>
            </select>
          </label>
          {effectiveScope === "project" && (
            <label>
              Project
              <select
                name="projectId"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                required
                disabled={busy}
              >
                <option value="">Select project</option>
                {projects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              {projects.length === 0 && (
                <span className="expense-field-hint">
                  No projects are available. Create a project before recording a
                  direct expense.
                </span>
              )}
            </label>
          )}
          <label>
            Description / reference
            <input
              name="description"
              defaultValue="Office supplies"
              maxLength={140}
              required
              disabled={busy}
            />
          </label>
          <label>
            Receipt image or PDF
            <input
              name="file"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              capture="environment"
              disabled={busy}
            />
            <span className="expense-field-hint">
              Optional · PNG, JPEG or PDF · maximum 2 MB
            </span>
          </label>
        </div>
        {error && (
          <p className="review-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="review-success" role="status">
            {notice}
          </p>
        )}
        <button
          className="button button-primary"
          type="submit"
          disabled={busy || creatingLedger}
        >
          {busy ? "Saving…" : "Record paid expense"}
        </button>
        <p className="aside-note">
          This records a payment in the fictional demo journal. Real approvals
          and VAT treatment remain subject to owner policy.
        </p>
      </form>
      <div className="panel table-panel expense-records">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "Expense",
                  "Payee / description",
                  "Ledger / group",
                  "Company / project",
                  "Date",
                  "Paid from",
                  "Amount / file",
                ].map((head) => (
                  <th key={head}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data.expenses as ExpenseDetail[]).map((item) => {
                const savedLedger = ledgers.find(
                  (entry) => entry.id === item.ledgerId,
                );
                const ledgerName =
                  item.ledgerName ?? savedLedger?.name ?? "Operating expenses";
                const group =
                  item.expenseGroup ??
                  savedLedger?.group ??
                  "Legacy operating expense";
                const projectName = item.projectId
                  ? (projects.find((entry) => entry.id === item.projectId)
                      ?.name ?? item.projectId)
                  : "Company";
                return (
                  <tr key={item.id}>
                    <td>
                      <details className="expense-saved-detail">
                        <summary>
                          {item.id}
                          <small>View saved details</small>
                        </summary>
                        <dl>
                          <dt>Expense Ledger</dt>
                          <dd>{ledgerName}</dd>
                          <dt>Expense Group</dt>
                          <dd>{group}</dd>
                          <dt>Expense for</dt>
                          <dd>{projectName}</dd>
                          <dt>Description</dt>
                          <dd>{item.description}</dd>
                        </dl>
                        <small>Saved record · read only</small>
                      </details>
                    </td>
                    <td>
                      {item.payee}
                      <small>{item.description}</small>
                    </td>
                    <td>
                      {ledgerName}
                      <small>{group}</small>
                    </td>
                    <td>{projectName}</td>
                    <td>{displayDate(item.date)}</td>
                    <td>
                      {item.account === "bank" ? "Business bank" : "Petty cash"}
                    </td>
                    <td className="money">
                      {money(item.amountFils)}
                      {item.attachmentId && (
                        <small>
                          <a
                            href={`/api/accounts-review/attachment/${encodeURIComponent(item.attachmentId)}`}
                          >
                            Download receipt
                          </a>
                        </small>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data.expenses.length === 0 && (
                <tr>
                  <td colSpan={7} className="invoice-empty">
                    No paid expenses recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
