import { useState } from "react";
import { Field, Modal } from "../components/ui";
import { useStore } from "../store";

/** Explicit project selection preserves scoped permissions without guessing a project. */
export function StagingNewQuotation({
  projectId = "",
  onClose,
  onCreated,
}: {
  projectId?: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const store = useStore();
  const [selected, setSelected] = useState(projectId);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="New quotation"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !selected) return;
          setBusy(true);
          try {
            const previous = new Set(
              store.db.quotations.map((item) => item.id),
            );
            if (
              await store.command?.(
                "quotation.new",
                { projectId: selected },
                "Quotation draft created in shared staging",
              )
            ) {
              const created = store
                .latestDb?.()
                .quotations.find((item) => !previous.has(item.id));
              if (created) onCreated(created.id);
            }
          } finally {
            setBusy(false);
          }
        }}
        aria-busy={busy}
      >
        <p className="muted">
          Choose the permitted project for this fictional quotation. Its
          registered customer will be linked automatically.
        </p>
        <Field label="Quotation project">
          <select
            required
            autoFocus
            disabled={busy}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">Select project…</option>
            {store.db.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </select>
        </Field>
        {!store.db.projects.length && (
          <p className="muted">
            Create or assign a project before starting a shared quotation.
          </p>
        )}
        {store.error && <p role="alert">{store.error}</p>}
        <div className="sticky-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy || !selected}>
            {busy ? "Creating…" : "Create quotation draft"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
