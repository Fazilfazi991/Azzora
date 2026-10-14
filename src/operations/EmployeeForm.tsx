import { useState } from "react";
import { useStore } from "../store";
import type { Person } from "../domain/model";
import { Modal, Field } from "../components/ui";
import { uid } from "../domain/logic";
import { saveEmployee } from "./repository";
export function EmployeeForm({
  person,
  onClose,
}: {
  person?: Person;
  onClose: () => void;
}) {
  const { db, mutate } = useStore();
  const [p, setP] = useState<Person>(() =>
    structuredClone(
      person || {
        id: uid(),
        name: "",
        role: "Project Manager",
        department: "Operations",
        email: "",
        phone: "",
        status: "Active",
        capacity: 100,
      },
    ),
  );
  return (
    <Modal title={person ? "Edit Employee" : "Add Employee"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (
            mutate((d) =>
              saveEmployee(
                d,
                p,
                db.people.find((x) => x.status !== "Inactive")!.id,
              ),
            )
          )
            onClose();
        }}
      >
        <div className="form-grid">
          {(
            [
              ["name", "Employee name"],
              ["department", "Employee department"],
              ["email", "Employee email"],
              ["phone", "Employee phone"],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                required={key === "name"}
                type={key === "email" ? "email" : "text"}
                value={p[key] || ""}
                onChange={(e) => setP({ ...p, [key]: e.target.value })}
              />
            </Field>
          ))}
          <Field label="Employee role">
            <select
              value={p.role}
              onChange={(e) => setP({ ...p, role: e.target.value })}
            >
              {Array.from(
                new Set([
                  p.role,
                  "Owner",
                  "Project Manager",
                  "Designer",
                  "Site Engineer",
                  "Supervisor",
                  "Procurement",
                  "QS/Estimator",
                  "Accounts",
                  "Admin",
                ]),
              ).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Employee status">
            <select
              value={p.status}
              onChange={(e) =>
                setP({ ...p, status: e.target.value as Person["status"] })
              }
            >
              <option>Active</option>
              <option>Away</option>
              <option>Inactive</option>
            </select>
          </Field>
          <Field label="Employee capacity %">
            <input
              required
              type="number"
              min="1"
              value={p.capacity}
              onChange={(e) => setP({ ...p, capacity: Number(e.target.value) })}
            />
          </Field>
        </div>
        <p className="notice">
          Deactivation preserves projects, task ownership, completed work and
          assignment history. New assignments require an active employee.
        </p>
        <button className="primary">Save Employee</button>
      </form>
    </Modal>
  );
}
