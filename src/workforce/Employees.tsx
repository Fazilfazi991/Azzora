import { useState } from "react";
import type { Person } from "../domain/model";
import { uid } from "../domain/logic";
import { canStoreAction, useStoreCommand } from "../store";
import { Field, Modal } from "../components/ui";
import { ActorField, WorkflowError } from "./ui";
import { saveEmployee, setEmployeeActive } from "./commands";

export function EmployeeEditor({
  employee,
  onClose,
}: {
  employee?: Person;
  onClose: () => void;
}) {
  const { store, run, pending } = useStoreCommand(),
    { db } = store;
  const [draft, setDraft] = useState<Person>(() =>
    employee
      ? structuredClone(employee)
      : {
          id: uid(),
          name: "",
          email: "",
          phone: "",
          department: "Site Operations",
          role: "Site Engineer",
          status: "Active",
          capacity: 100,
          employeeCode: "",
          notes: "",
        },
  );
  const [actor, setActor] = useState("");
  const existing = db.people.some((p) => p.id === draft.id);
  return (
    <Modal
      title={existing ? "Edit Employee" : "Add Employee"}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form
        aria-busy={pending}
        inert={pending}
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              "employee.save",
              { employee: draft },
              (d) => saveEmployee(d, draft, actor),
              "Employee saved",
            )
          )
            onClose();
        }}
      >
        <div className="form-grid">
          {(
            [
              ["name", "Employee name"],
              ["employeeCode", "Employee code"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["department", "Department"],
              ["role", "Role"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                readOnly={
                  store.mode === "staging" && existing && key === "email"
                }
                required={["name", "email", "department", "role"].includes(key)}
                type={
                  key === "email" ? "email" : key === "phone" ? "tel" : "text"
                }
                value={draft[key] || ""}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <div className="form-grid">
          <Field label="Employment status">
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value as Person["status"],
                })
              }
            >
              <option>Active</option>
              <option>Away</option>
            </select>
          </Field>
          <Field label="Capacity %">
            <input
              required
              type="number"
              min={1}
              max={100}
              value={draft.capacity}
              onChange={(e) =>
                setDraft({ ...draft, capacity: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <Field label="Employee notes">
          <textarea
            value={draft.notes || ""}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </Field>
        <ActorField value={actor} onChange={setActor} />
        {store.mode === "staging" && (
          <p className="muted">
            Employee role labels describe staffing and do not grant sign-in
            permissions. Existing login email changes require the identity
            administration workflow.
          </p>
        )}
        <WorkflowError />
        <button
          className="primary"
          disabled={pending || !canStoreAction(store, "access.manage")}
        >
          Save Employee
        </button>
      </form>
    </Modal>
  );
}
export function EmployeeStatus({
  employee,
  onClose,
}: {
  employee: Person;
  onClose: () => void;
}) {
  const { store, run, pending } = useStoreCommand();
  const [actor, setActor] = useState("");
  const [reason, setReason] = useState("");
  const active = employee.status === "Inactive";
  return (
    <Modal
      title={active ? "Reactivate Employee" : "Deactivate Employee"}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <form
        aria-busy={pending}
        inert={pending}
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await run(
              "employee.status",
              { id: employee.id, active, reason },
              (d) => setEmployeeActive(d, employee.id, active, actor, reason),
            )
          )
            onClose();
        }}
      >
        <p>
          {employee.name}. Historical project and task assignments remain linked
          to this employee. Deactivated staff cannot receive new work.
        </p>
        <ActorField value={actor} onChange={setActor} />
        <Field label="Reason">
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <button
          className="primary"
          disabled={pending || !canStoreAction(store, "access.manage")}
        >
          {active ? "Reactivate" : "Deactivate"}
        </button>
        <WorkflowError />
      </form>
    </Modal>
  );
}
