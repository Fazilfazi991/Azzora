import { activeApprovals } from "../workforce/document-approvals";
import { useState } from "react";
import { useStore } from "../store";
import { Header, Field, Modal, Badge } from "../components/ui";
import { DataTable } from "../commercial/Registers";
import { aed } from "../commercial/calculations";
import { uid, today } from "../domain/logic";
import { getOperations } from "./migration";
import type { Budget } from "./model";
import { saveBudget } from "./repository";
import { projectCosts, supplierBalance, orderReceived } from "./calculations";
import { History } from "./Controls";
export function Budgets({ projectId = "" }: { projectId?: string }) {
  const { db, mutate } = useStore();
  const [selected, setSelected] = useState(
      projectId || db.projects[0]?.id || "",
    ),
    [draft, setDraft] = useState<Budget | null>(null);
  const s = projectCosts(db, selected);
  return (
    <>
      <Header
        eyebrow="Project cost control"
        title="Budget & Forecast"
        description="Budgeted, committed, actual and forecast are separate measures."
        action={
          <button
            onClick={() =>
              setDraft(
                structuredClone(
                  s.budget || {
                    id: uid(),
                    projectId: selected,
                    lines: [
                      {
                        id: uid(),
                        category: "Materials",
                        phaseId: "",
                        original: "0",
                        revised: "0",
                      },
                    ],
                    remainingEstimate: "0",
                    notes: "",
                    updatedAt: "",
                  },
                ),
              )
            }
          >
            Set / Revise Cost Budget
          </button>
        }
      />
      {!projectId && (
        <Field label="Budget project">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {db.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="kpis budget-kpis">
        {[
          ["Original Contract", s.originalContract],
          ["Approved Variations", s.variations],
          ["Revised Contract", s.revisedContract],
          ["Original Cost Budget", s.originalBudget],
          ["Revised Cost Budget", s.revisedBudget],
          ["Committed Procurement Cost", s.committed],
          ["Recorded Actual Cost", s.actual],
          ["Open Procurement Commitment", s.openCommitment],
          ["Remaining Budget", s.remainingBudget],
          ["Estimated Cost to Complete", s.toComplete],
          ["Forecast Final Cost", s.forecast],
          ["Forecast Gross Profit", s.profit],
        ].map(([label, value]) => (
          <div className="panel kpi" key={String(label)}>
            <small>{String(label)}</small>
            <strong>{aed(value as bigint)}</strong>
          </div>
        ))}
      </div>
      <p className="notice">
        Forecast final cost = recorded actual + max(open procurement commitment,
        entered remaining-cost estimate). Billed procurement reduces open
        commitments; its linked expense is the single actual-cost entry. All
        measures exclude recoverable VAT. Forecast margin:{" "}
        {s.margin === null ? "No accepted contract" : s.margin.toFixed(2) + "%"}{" "}
        <Badge>
          {s.overrun
            ? "Budget Overrun"
            : s.budget
              ? "Within Budget"
              : "Budget Not Set"}
        </Badge>
      </p>
      <DataTable
        headers={[
          "Category",
          "Phase",
          "Original Budget AED",
          "Revised Budget AED",
        ]}
        rows={(s.budget?.lines || []).map((l) => [
          l.category,
          db.phases.find((p) => p.id === l.phaseId)?.name || "Whole project",
          l.original,
          l.revised,
        ])}
      />
      {s.budget && <History id={s.budget.id} />}
      {draft && (
        <Modal title="Project Cost Budget" onClose={() => setDraft(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                mutate((d) => {
                  saveBudget(
                    d,
                    draft,
                    db.people.find((p) => p.status !== "Inactive")?.id || "",
                  );
                })
              )
                setDraft(null);
            }}
          >
            {draft.lines.map((l, index) => (
              <div className="form-grid panel" key={l.id}>
                <Field label={`Budget ${index + 1} category`}>
                  <input
                    required
                    value={l.category}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lines: draft.lines.map((x) =>
                          x.id === l.id
                            ? { ...x, category: e.target.value }
                            : x,
                        ),
                      })
                    }
                  />
                </Field>
                <Field label={`Budget ${index + 1} phase`}>
                  <select
                    value={l.phaseId}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lines: draft.lines.map((x) =>
                          x.id === l.id ? { ...x, phaseId: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    <option value="">Whole project</option>
                    {db.phases
                      .filter((p) => p.projectId === selected)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={`Budget ${index + 1} amount AED`}>
                  <input
                    required
                    inputMode="decimal"
                    value={l.revised}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        lines: draft.lines.map((x) =>
                          x.id === l.id
                            ? {
                                ...x,
                                revised: e.target.value,
                                original: s.budget
                                  ? x.original
                                  : e.target.value,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </Field>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  lines: [
                    ...draft.lines,
                    {
                      id: uid(),
                      category: "Other",
                      phaseId: "",
                      original: "0",
                      revised: "0",
                    },
                  ],
                })
              }
            >
              Add Budget Line
            </button>
            <Field label="Estimated remaining cost AED">
              <input
                required
                inputMode="decimal"
                value={draft.remainingEstimate}
                onChange={(e) =>
                  setDraft({ ...draft, remainingEstimate: e.target.value })
                }
              />
            </Field>
            <Field label="Budget revision notes">
              <textarea
                required
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
            <button className="primary">Save Cost Budget</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function OperationalDashboard() {
  const { db } = useStore(),
    op = getOperations(db);
  const approved = op.variations
    .filter((v) => v.status === "Approved")
    .reduce((s, v) => s + BigInt(v.net!), 0n);
  const orders = op.orders.filter((o) => o.status === "Approved");
  const late = orders.filter(
    (o) => o.deliveryDate < today() && !orderReceived(db, o),
  );
  const payable = op.bills.reduce(
    (sum, b) => sum + supplierBalance(db, b.id),
    0n,
  );
  const forecast = db.projects.map((p) => projectCosts(db, p.id));
  const contracted = forecast.filter((f) => f.originalContract > 0n),
    contractNet = contracted.reduce((sum, f) => sum + f.revisedContract, 0n),
    forecastProfit = contracted.reduce((sum, f) => sum + f.profit, 0n);
  return (
    <section className="operational-dashboard">
      <div className="between">
        <h2>Operations & Cost Control</h2>
        <a href="#/approvals">Review approvals →</a>
      </div>
      <div className="kpis budget-kpis">
        {[
          [
            "Pending Variations",
            op.variations.filter((v) =>
              ["Submitted", "Internally Approved", "Sent to Client"].includes(
                v.status,
              ),
            ).length,
            "#/variations",
          ],
          ["Approved Variation Value", aed(approved), "#/variations"],
          [
            "Pending Purchase Requests",
            op.requests.filter((r) => r.status === "Submitted").length,
            "#/procurement/requests",
          ],
          ["Active Purchase Orders", orders.length, "#/procurement/orders"],
          ["Late Material Deliveries", late.length, "#/procurement/orders"],
          ["Supplier Payables", aed(payable), "#/procurement/bills"],
          [
            "Forecast Contracted Margin",
            contractNet > 0n
              ? (Number((forecastProfit * 10000n) / contractNet) / 100).toFixed(
                  2,
                ) + "%"
              : "No contracts yet",
            "#/budgets",
          ],
          [
            "Project Budget Overruns",
            forecast.filter((f) => f.overrun).length,
            "#/budgets",
          ],
          [
            "Pending Approvals",
            activeApprovals(db).filter((a) => a.status === "Pending Approval")
              .length,
            "#/approvals",
          ],
        ].map(([label, value, href]) => (
          <a className="panel kpi" href={String(href)} key={String(label)}>
            <small>{label}</small>
            <strong>{value}</strong>
          </a>
        ))}
      </div>
    </section>
  );
}
