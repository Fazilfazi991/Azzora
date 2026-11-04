import { useState } from "react";
import { useStore } from "../store";
import { Field, Badge } from "../components/ui";

/** Existing expense/approval pages share the same submitted-source queue. */
export function StagingExpenseQueue() {
  const store = useStore();
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  if (store.mode !== "staging") return null;
  const entries = store.expenseSubmissions || [];
  const canApprove = [
    "owner",
    "owner_admin",
    "admin",
    "project_manager",
  ].includes(store.actor?.role || "");
  async function decide(id: string, approved: boolean) {
    setBusy(id);
    try {
      await store.command?.(
        "expense.approve",
        { id, approved, comments: comments[id] || "" },
        approved
          ? "Expense approved for Accountant review. No posting."
          : "Expense returned for correction.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="panel" aria-label="Shared expense submissions">
      <h3>Expense submissions</h3>
      <p className="muted">
        Submission and approval do not post. An Accountant records an approved
        fictional expense as a separate action.
      </p>
      {!entries.length && (
        <p>No expense submissions in your permitted projects.</p>
      )}
      {entries.map((item) => (
        <article className="staging-expense-row" key={item.id}>
          <div className="between">
            <strong>{item.description}</strong>
            <Badge>{item.status}</Badge>
          </div>
          <p>
            {store.db.projects.find((project) => project.id === item.projectId)
              ?.name || item.projectId}{" "}
            · {item.payee} · AED {item.amount} · {item.date}
          </p>
          {item.comments && <p className="muted">{item.comments}</p>}
          {canApprove && item.status === "Submitted" && (
            <>
              <Field label={`Decision comments for ${item.description}`}>
                <input
                  value={comments[item.id] || ""}
                  onChange={(event) =>
                    setComments((value) => ({
                      ...value,
                      [item.id]: event.target.value,
                    }))
                  }
                />
              </Field>
              {item.submittedBy === store.actor?.userId ? (
                <p className="muted">
                  Another authorized reviewer must decide your own submission.
                </p>
              ) : (
                <div className="actions">
                  <button
                    disabled={busy === item.id || !comments[item.id]?.trim()}
                    onClick={() => void decide(item.id, true)}
                  >
                    Approve expense
                  </button>
                  <button
                    disabled={busy === item.id || !comments[item.id]?.trim()}
                    onClick={() => void decide(item.id, false)}
                  >
                    Reject expense
                  </button>
                </div>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
