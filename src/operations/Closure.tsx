import { useState } from "react";
import { useStore } from "../store";
import { Field, Badge } from "../components/ui";
import { aed } from "../commercial/calculations";
import { getOperations } from "./migration";
import { closureSummary, closeCommercial } from "./closure-domain";
import { downloadCsv } from "../commercial/reports-data";
export function CommercialClosure({ projectId }: { projectId: string }) {
  const { db, mutate } = useStore();
  const s = closureSummary(db, projectId),
    op = getOperations(db);
  const [notes, setNotes] = useState("");
  const rows = [
    ["Open snags", String(s.openSnags)],
    ["Incomplete tasks", String(s.incompleteTasks)],
    ["Pending approval decisions", String(s.pendingApprovals)],
    ["Pending latest document versions", String(s.pendingDocuments)],
    ["Unresolved material deliveries", String(s.deliveries)],
    ["Open procurement commitments excl. VAT", aed(s.openCommitment)],
    ["Supplier payables incl. VAT", aed(s.payables)],
    ["Uninvoiced contract milestones", String(s.milestones)],
    ["Unbilled approved variations/deductions", String(s.variations)],
    ["Customer receivables incl. VAT", aed(s.receivables)],
    ["Unrefunded customer credit", aed(s.customerCredit)],
    ["Retention allowance (estimate)", aed(s.retention)],
    ["Revised contract excl. VAT", aed(s.revisedContract)],
    ["Recorded actual cost excl. VAT", aed(s.actual)],
  ];
  const closed = op.closures.find((c) => c.projectId === projectId);
  return (
    <section className="panel">
      <div className="between">
        <h2>Commercial Closure</h2>
        <Badge>
          {closed
            ? s.commercialClear
              ? "Recorded · clear"
              : "Recorded · new obligations"
            : s.commercialClear
              ? "Ready for commercial closure"
              : "Outstanding obligations"}
        </Badge>
      </div>
      <p className="muted">
        Operational handover is separate. Financial blocking policy is{" "}
        {op.settings.blockOperationalForFinance ? "enabled" : "off"}. Retention
        allowance requires separate confirmation/configuration; no release
        subledger is inferred.
      </p>
      {rows.map(([label, value]) => (
        <p className="between" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </p>
      ))}
      <div className="actions">
        <a href={`#/projects/${projectId}/documents`}>
          Final handover documents
        </a>
        <a href={`#/projects/${projectId}/procurement`}>
          Procurement obligations
        </a>
        <a href={`#/projects/${projectId}/financials`}>Final account</a>
        <button
          onClick={() =>
            downloadCsv(
              { headers: ["Obligation / Measure", "Value"], rows },
              "azzora-commercial-closure.csv",
            )
          }
        >
          Export Closure Summary
        </button>
      </div>
      {closed ? (
        <p>
          {closed.date} · {db.people.find((p) => p.id === closed.actorId)?.name}{" "}
          · {closed.notes}
        </p>
      ) : (
        <>
          <Field label="Final account review notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <button
            disabled={!s.commercialClear || !notes.trim()}
            onClick={() =>
              mutate((d) =>
                closeCommercial(
                  d,
                  projectId,
                  db.people.find((p) => p.status !== "Inactive")?.id || "",
                  notes,
                ),
              )
            }
          >
            Record Commercial Closure
          </button>
        </>
      )}
    </section>
  );
}
