import { useState } from "react";
import { useStore } from "../store";
import { Header, Field, Modal, Badge, Empty } from "../components/ui";
import { DataTable } from "../commercial/Registers";
import {
  aed,
  amountString,
  cents,
  invoiceTotals,
  paidAmount,
} from "../commercial/calculations";
import { tabularPdf } from "../commercial/document";
import { uid, today } from "../domain/logic";
import { getOperations } from "./migration";
import type { CreditNote, Refund } from "./model";
import {
  saveCredit,
  submitApproval,
  issueCredit,
  postRefund,
  reverseRefund,
} from "./repository";
import { credited, refunded, invoicePosition } from "./calculations";
import { ActorFields, Decision, History, useActors } from "./Controls";
import { FinancialDialogError } from "./FinancialDialogError";
export function Credits({
  section = "credit-notes",
  id,
  startNew = false,
}: {
  section?: string;
  id?: string;
  startNew?: boolean;
}) {
  const { db, mutate } = useStore(),
    op = getOperations(db),
    actors = useActors();
  const [credit, setCredit] = useState<CreditNote | null>(() =>
      startNew ? blank() : null,
    ),
    [refund, setRefund] = useState<Refund | null>(null),
    [reverse, setReverse] = useState(""),
    [failedAttempts, setFailedAttempts] = useState(0),
    [error, setError] = useState("");
  function openCredit(draft: CreditNote) {
    setFailedAttempts(0);
    setCredit(draft);
  }
  function blank(): CreditNote {
    const i = db.invoices.find((i) => i.status === "Issued");
    return {
      id: uid(),
      number: "",
      invoiceId: i?.id || "",
      customerId: i?.customerId || "",
      projectId: i?.projectId || "",
      date: today(),
      reason: "",
      gross: "0",
      itemId: "",
      status: "Draft",
    };
  }
  async function pdf(c: CreditNote) {
    try {
      const snapshot = c.snapshot ? JSON.parse(c.snapshot) : null;
      const i = db.invoices.find((i) => i.id === c.invoiceId)!;
      await tabularPdf(
        `${c.status === "Issued" ? "" : "DRAFT "}CREDIT NOTE ${c.number}`,
        `${snapshot?.company.name || op.settings.company.name}\nCustomer: ${snapshot?.invoice.snapshot?.customer.name || i.snapshot?.customer.name}\nInvoice: ${i.number} · ${c.date}\nReason: ${c.reason}`,
        {
          headers: ["Adjustment", "Amount AED"],
          rows: [
            ["Net credit", c.net ? aed(BigInt(c.net)) : "Pending issue"],
            ["VAT credit", c.vat ? aed(BigInt(c.vat)) : "Calculated on issue"],
            ["Gross credit", aed(cents(c.gross))],
          ],
        },
        c.number + ".pdf",
        snapshot?.company || op.settings.company,
      );
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <Header
        eyebrow="Customer account adjustments"
        title={section === "refunds" ? "Customer Refunds" : "Credit Notes"}
        description="Credits, receipts and refunds remain separate in the invoice ledger."
        action={
          <>
            <button className="primary" onClick={() => openCredit(blank())}>
              New Credit Note
            </button>
            <button
              onClick={() => {
                setFailedAttempts(0);
                const i = db.invoices.find(
                  (i) => i.status === "Issued" && invoicePosition(db, i) < 0n,
                );
                setRefund({
                  id: uid(),
                  number: "",
                  invoiceId: i?.id || "",
                  projectId: i?.projectId || "",
                  customerId: i?.customerId || "",
                  date: today(),
                  amount: i
                    ? (-invoicePosition(db, i) / 100n).toString() +
                      "." +
                      (-invoicePosition(db, i) % 100n)
                        .toString()
                        .padStart(2, "0")
                    : "0",
                  reference: "",
                  method: "Bank Transfer",
                  reason: "",
                });
              }}
            >
              Record Customer Refund
            </button>
            <a className="button" href="#/accounts/overview">
              Accounts
            </a>
          </>
        }
      />
      <ActorFields actors={actors} />
      <nav className="tabs">
        <a href="#/accounts/credit-notes">Credit Notes</a>
        <a href="#/accounts/refunds">Refunds</a>
      </nav>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {section === "credit-notes" ? (
        <>
          <DataTable
            headers={[
              "Credit Note",
              "Invoice",
              "Date",
              "Gross Credit AED",
              "VAT Credit AED",
              "State",
            ]}
            rows={op.credits
              .filter((c) => !id || c.id === id)
              .map((c) => [
                <a href={`#/accounts/credit-notes/${c.id}`}>
                  {c.number}
                  <small>{c.reason}</small>
                </a>,
                <a href={`#/accounts/invoices/${c.invoiceId}`}>
                  {db.invoices.find((i) => i.id === c.invoiceId)?.number}
                </a>,
                c.date,
                aed(cents(c.gross)),
                c.vat ? aed(BigInt(c.vat)) : "On issue",
                <Badge>{c.status}</Badge>,
              ])}
          />
          {op.credits
            .filter((c) => !id || c.id === id)
            .map((c) => (
              <section className="panel" key={c.id}>
                <h3>
                  {c.number} · {c.reason}
                </h3>
                <div className="actions">
                  {["Draft", "Rejected"].includes(c.status) && (
                    <>
                      <button onClick={() => openCredit(structuredClone(c))}>
                        Edit Credit Draft
                      </button>
                      <button
                        onClick={() =>
                          mutate((d) => {
                            submitApproval(
                              d,
                              "Credit Note",
                              c.id,
                              "Credit authorization",
                              actors.actor,
                              actors.approver,
                            );
                          })
                        }
                      >
                        Submit Credit Note
                      </button>
                    </>
                  )}
                  {c.status === "Approved" && (
                    <button
                      className="primary"
                      onClick={() =>
                        mutate((d) => {
                          issueCredit(d, c.id, actors.actor);
                        })
                      }
                    >
                      Issue Credit Note
                    </button>
                  )}
                  <button onClick={() => void pdf(c)}>
                    Preview / Download Credit PDF
                  </button>
                </div>
                <Decision entityId={c.id} actor={actors.actor} />
                <History id={c.id} />
              </section>
            ))}
        </>
      ) : (
        <>
          <DataTable
            headers={[
              "Refund",
              "Invoice",
              "Date",
              "Amount AED",
              "Reference",
              "Status",
              "Action",
            ]}
            rows={op.refunds.map((r) => [
              r.number,
              db.invoices.find((i) => i.id === r.invoiceId)?.number,
              r.date,
              aed(cents(r.amount)),
              r.reference,
              r.reversedAt ? "Reversed" : "Posted",
              !r.reversedAt && (
                <button
                  onClick={() => {
                    setFailedAttempts(0);
                    setReverse(r.id);
                  }}
                >
                  Reverse Refund
                </button>
              ),
            ])}
          />
          {op.refunds.map((r) => (
            <History key={r.id} id={r.id} />
          ))}
        </>
      )}
      <h3>Invoice reconciliation</h3>
      <DataTable
        headers={[
          "Invoice",
          "Invoiced AED",
          "Credits AED",
          "Receipts AED",
          "Refunds AED",
          "Receivable / (Credit) AED",
        ]}
        rows={db.invoices
          .filter((i) => i.status === "Issued")
          .map((i) => [
            <a href={`#/accounts/invoices/${i.id}`}>{i.number}</a>,
            aed(invoiceTotals(i).grand),
            aed(credited(db, i.id)),
            aed(paidAmount(db, i.id)),
            aed(refunded(db, i.id)),
            aed(invoicePosition(db, i)),
          ])}
      />
      {credit && (
        <Modal title="Credit Note Draft" onClose={() => setCredit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                mutate((d) => {
                  saveCredit(d, credit, actors.actor);
                })
              )
                setCredit(null);
              else setFailedAttempts((attempt) => attempt + 1);
            }}
          >
            <div className="form-grid">
              <Field label="Credit invoice">
                <select
                  required
                  value={credit.invoiceId}
                  onChange={(e) => {
                    const i = db.invoices.find((i) => i.id === e.target.value)!;
                    setCredit({
                      ...credit,
                      invoiceId: i.id,
                      projectId: i.projectId,
                      customerId: i.customerId,
                      itemId: "",
                      variationId: undefined,
                    });
                  }}
                >
                  <option value="">Select issued invoice…</option>
                  {db.invoices
                    .filter((i) => i.status === "Issued")
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.number} · {i.snapshot?.customer.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Credit item adjustment">
                <select
                  value={credit.itemId}
                  onChange={(e) =>
                    setCredit({ ...credit, itemId: e.target.value })
                  }
                >
                  <option value="">Amount-level adjustment</option>
                  {db.invoices
                    .find((i) => i.id === credit.invoiceId)
                    ?.lines.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.description}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Approved deduction variation">
                <select
                  value={credit.variationId || ""}
                  onChange={(e) => {
                    const v = op.variations.find(
                      (v) => v.id === e.target.value,
                    );
                    setCredit({
                      ...credit,
                      variationId: v?.id,
                      gross: v ? amountString(-BigInt(v.gross!)) : credit.gross,
                    });
                  }}
                >
                  <option value="">No variation association</option>
                  {op.variations
                    .filter(
                      (v) =>
                        v.projectId === credit.projectId &&
                        v.status === "Approved" &&
                        BigInt(v.gross!) < 0n,
                    )
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.number} · {v.title}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Credit date">
                <input
                  required
                  type="date"
                  value={credit.date}
                  onChange={(e) =>
                    setCredit({ ...credit, date: e.target.value })
                  }
                />
              </Field>
              <Field label="Gross credit amount AED">
                <input
                  required
                  inputMode="decimal"
                  value={credit.gross}
                  onChange={(e) =>
                    setCredit({ ...credit, gross: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Credit reason">
              <textarea
                required
                value={credit.reason}
                onChange={(e) =>
                  setCredit({ ...credit, reason: e.target.value })
                }
              />
            </Field>
            <p className="muted">
              VAT follows the issued invoice snapshot. Approval is required
              before issue; existing receipts may then create a refundable
              credit balance.
            </p>
            <FinancialDialogError attempt={failedAttempts} />
            <button className="primary">Save Credit Note</button>
          </form>
        </Modal>
      )}
      {refund && (
        <Modal title="Customer Refund" onClose={() => setRefund(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                mutate((d) => {
                  postRefund(d, refund, actors.actor);
                })
              )
                setRefund(null);
              else setFailedAttempts((attempt) => attempt + 1);
            }}
          >
            <Field label="Refund invoice">
              <select
                required
                value={refund.invoiceId}
                onChange={(e) => {
                  const i = db.invoices.find((i) => i.id === e.target.value)!;
                  setRefund({
                    ...refund,
                    invoiceId: i.id,
                    customerId: i.customerId,
                    projectId: i.projectId,
                  });
                }}
              >
                <option value="">Select eligible credit balance…</option>
                {db.invoices
                  .filter(
                    (i) => i.status === "Issued" && invoicePosition(db, i) < 0n,
                  )
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.number} · Credit {aed(-invoicePosition(db, i))}
                    </option>
                  ))}
              </select>
            </Field>
            {(
              [
                ["date", "Refund date"],
                ["amount", "Refund amount AED"],
                ["reference", "Refund reference"],
                ["reason", "Refund reason"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  required
                  type={key === "date" ? "date" : "text"}
                  value={refund[key]}
                  onChange={(e) =>
                    setRefund({ ...refund, [key]: e.target.value })
                  }
                />
              </Field>
            ))}
            <Field label="Refund method">
              <select
                value={refund.method}
                onChange={(e) =>
                  setRefund({ ...refund, method: e.target.value })
                }
              >
                {["Bank Transfer", "Cash", "Cheque", "Other"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            {!refund.invoiceId && (
              <Empty>
                Refunds require a genuine credit balance from posted receipts
                and issued credits.
              </Empty>
            )}
            <FinancialDialogError attempt={failedAttempts} />
            <button className="primary" disabled={!refund.invoiceId}>
              Post Customer Refund
            </button>
          </form>
        </Modal>
      )}
      {reverse && (
        <Modal title="Reverse Refund" onClose={() => setReverse("")}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              if (
                mutate((d) =>
                  reverseRefund(
                    d,
                    reverse,
                    String(data.get("reason")),
                    actors.actor,
                  ),
                )
              )
                setReverse("");
              else setFailedAttempts((attempt) => attempt + 1);
            }}
          >
            <Field label="Refund reversal reason">
              <input required name="reason" />
            </Field>
            <FinancialDialogError attempt={failedAttempts} />
            <button className="primary">Confirm Refund Reversal</button>
          </form>
        </Modal>
      )}
    </>
  );
}
