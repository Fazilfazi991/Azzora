import type { WorkflowEvent } from "../domain/model";
import { useStore } from "../store";
import { Field, Empty } from "../components/ui";

export function WorkflowError() {
  const { error } = useStore();
  return error ? (
    <p className="notice error" role="alert">
      {error}
    </p>
  ) : null;
}

export function ActorField({
  value,
  onChange,
  label = "Demo actor",
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const { db } = useStore();
  return (
    <Field label={label}>
      <select required value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose demo actor</option>
        {db.people
          .filter((p) => p.status !== "Inactive")
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.role}
            </option>
          ))}
      </select>
    </Field>
  );
}
export function History({ entries = [] }: { entries?: WorkflowEvent[] }) {
  return (
    <section className="workflow-history" aria-label="Workflow history">
      <h3>Review & change history</h3>
      {entries.length ? (
        [...entries].reverse().map((entry) => (
          <article key={entry.id}>
            <strong>{entry.action}</strong>
            <p>{entry.reason}</p>
            <small>
              {entry.actorName} ·{" "}
              {new Date(entry.timestamp).toLocaleString("en-GB", {
                timeZone: "Asia/Dubai",
              })}{" "}
              (Dubai)
            </small>
            {entry.previous && (
              <details>
                <summary>Previous record</summary>
                <pre>{JSON.stringify(JSON.parse(entry.previous), null, 2)}</pre>
              </details>
            )}
          </article>
        ))
      ) : (
        <Empty>No review actions recorded. Legacy metadata is retained.</Empty>
      )}
    </section>
  );
}
