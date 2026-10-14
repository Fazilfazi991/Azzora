import { useState } from "react";
import type { Assignment, Person, Task } from "../domain/model";
import { roles } from "../domain/model";
import { workload, today, uid } from "../domain/logic";
import { record } from "../domain/repository";
import { useStore } from "../store";
import {
  Header,
  Modal,
  Avatar,
  Badge,
  Progress,
  Field,
  Confirm,
  personName,
  Empty,
} from "./ui";
import { TaskList } from "./Tasks";
import { EmployeeEditor, EmployeeStatus } from "../workforce/Employees";
import { ActorField, History, WorkflowError } from "../workforce/ui";
import { saveAssignment } from "../workforce/commands";
import "../workforce/workforce.css";

export function Team({
  projectId,
  onTask,
}: {
  projectId?: string;
  onTask: (t: Task) => void;
}) {
  const { db, mutate } = useStore();
  const [personId, setPersonId] = useState("");
  const person = db.people.find((p) => p.id === personId);
  const [employee, setEmployee] = useState<Person | null | undefined>(
    undefined,
  );
  const [statusEmployee, setStatusEmployee] = useState<Person | null>(null);
  const [draft, setDraft] = useState<Assignment | null>(null);
  const [replacement, setReplacement] = useState("");
  const [reassign, setReassign] = useState(false);
  const [remove, setRemove] = useState<Assignment | null>(null);
  const [actor, setActor] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const assignments = db.assignments.filter(
    (a) => !projectId || a.projectId === projectId,
  );
  const list = db.people.filter(
    (p) =>
      (!projectId ||
        assignments.some((a) => a.personId === p.id) ||
        db.tasks.some(
          (t) => t.projectId === projectId && t.assigneeId === p.id,
        )) &&
      (!department || p.department === department) &&
      (!status || p.status === status) &&
      [p.name, p.email, p.role, p.employeeCode, p.department]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function edit(a?: Assignment) {
    const project =
      db.projects.find((p) => p.id === (a?.projectId || projectId)) ||
      db.projects[0];
    if (!project) return;
    setDraft(
      a
        ? structuredClone(a)
        : {
            id: uid(),
            projectId: project.id,
            personId: "",
            role: "Site Engineer",
            start: today(),
            end: project.due < today() ? today() : project.due,
            responsibility: "",
            status: "Active",
          },
    );
    setReplacement(a?.personId || "");
    setReassign(false);
    setActor("");
  }
  return (
    <>
      <Header
        title={projectId ? "Project Team" : "Team & Resource Allocation"}
        description="Employee directory, project roles and task allocations."
        action={
          <>
            <button onClick={() => setEmployee(null)}>+ Add Employee</button>
            <button
              className="primary"
              disabled={!db.projects.length}
              onClick={() => edit()}
            >
              + Assign Person
            </button>
          </>
        }
      />
      <div className="kpis">
        {[
          ["Employees", list.length],
          ["Active", list.filter((p) => p.status !== "Inactive").length],
          ["Inactive", list.filter((p) => p.status === "Inactive").length],
          [
            "Over capacity",
            list.filter((p) => workload(db, p.id) > p.capacity).length,
          ],
        ].map(([label, n]) => (
          <div className="panel kpi" key={label}>
            <small>{label}</small>
            <strong>{n}</strong>
          </div>
        ))}
      </div>
      <div className="filters">
        <input
          aria-label="Search employees"
          placeholder="Name, role, email or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Employee department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="">All departments</option>
          {[...new Set(db.people.map((p) => p.department).filter(Boolean))].map(
            (d) => (
              <option key={d}>{d}</option>
            ),
          )}
        </select>
        <select
          aria-label="Employee status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option>Active</option>
          <option>Away</option>
          <option>Inactive</option>
        </select>
      </div>
      <div className="team-grid">
        {list.map((p) => (
          <button
            className="panel team-card"
            key={p.id}
            onClick={() => setPersonId(p.id)}
          >
            <div className="inline">
              <Avatar name={p.name} />
              <div>
                <h3>{p.name}</h3>
                <p>{p.role}</p>
              </div>
            </div>
            <small>
              {p.department || "Department unassigned"} ·{" "}
              {p.employeeCode || p.id}
            </small>
            <Badge>{p.status}</Badge>
            <Progress
              value={Math.min(100, (workload(db, p.id) / p.capacity) * 100)}
            />
            <p>
              {workload(db, p.id)}% allocated / {p.capacity}% capacity ·{" "}
              {
                db.tasks.filter(
                  (t) => t.assigneeId === p.id && t.status !== "Completed",
                ).length
              }{" "}
              active tasks
            </p>
            <small>
              {
                db.assignments.filter(
                  (a) => a.personId === p.id && a.status === "Active",
                ).length
              }{" "}
              project assignments
            </small>
          </button>
        ))}
      </div>
      {!list.length && <Empty>No employees match this view.</Empty>}
      <h2>Project assignments</h2>
      <div className="panel">
        {assignments.map((a) => (
          <div className="list-row" key={a.id}>
            <span>
              <strong>{personName(db, a.personId)}</strong>
              <small>
                {db.projects.find((p) => p.id === a.projectId)?.code} · {a.role}{" "}
                · {a.start} → {a.end}
              </small>
            </span>
            <Badge>{a.status}</Badge>
            {a.status === "Active" && (
              <>
                <button onClick={() => edit(a)}>Edit / replace</button>
                <button onClick={() => setRemove(a)}>Remove</button>
              </>
            )}
          </div>
        ))}
        {!assignments.length && <Empty />}
      </div>
      {person && (
        <Modal drawer title={person.name} onClose={() => setPersonId("")}>
          <Badge>{person.status}</Badge>
          <p>
            {person.department || "Department unassigned"} · {person.role}
          </p>
          <p>
            {person.email}
            <br />
            {person.phone}
          </p>
          <p>{person.notes}</p>
          <p>
            {workload(db, person.id)}% allocated / {person.capacity}% capacity
          </p>
          <div className="actions">
            <button
              disabled={person.status === "Inactive"}
              onClick={() => {
                setEmployee(person);
                setPersonId("");
              }}
            >
              Edit Employee
            </button>
            <button
              onClick={() => {
                setStatusEmployee(person);
                setPersonId("");
              }}
            >
              {person.status === "Inactive"
                ? "Reactivate Employee"
                : "Deactivate Employee"}
            </button>
          </div>
          <h3>Project & assignment history</h3>
          {db.assignments
            .filter((a) => a.personId === person.id)
            .map((a) => (
              <p key={a.id}>
                {db.projects.find((p) => p.id === a.projectId)?.name} · {a.role}
                <small>
                  {a.status} · {a.start} → {a.end}
                </small>
              </p>
            ))}
          <h3>Current & historical tasks</h3>
          <TaskList
            tasks={db.tasks.filter((t) => t.assigneeId === person.id)}
            onTask={(t) => {
              setPersonId("");
              onTask(t);
            }}
          />
          <History entries={person.history} />
        </Modal>
      )}
      {employee !== undefined && (
        <EmployeeEditor
          employee={employee || undefined}
          onClose={() => setEmployee(undefined)}
        />
      )}
      {statusEmployee && (
        <EmployeeStatus
          employee={statusEmployee}
          onClose={() => setStatusEmployee(null)}
        />
      )}
      {draft && (
        <Modal title="Project Assignment" onClose={() => setDraft(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                mutate((d) =>
                  saveAssignment(d, draft, replacement, reassign, actor),
                )
              )
                setDraft(null);
            }}
          >
            <Field label="Project">
              <select
                disabled={db.assignments.some((a) => a.id === draft.id)}
                value={draft.projectId}
                onChange={(e) =>
                  setDraft({ ...draft, projectId: e.target.value })
                }
              >
                {db.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Person">
              <select
                required
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              >
                <option value="">Choose employee</option>
                {db.people
                  .filter(
                    (p) => p.status !== "Inactive" || p.id === replacement,
                  )
                  .map((p) => (
                    <option
                      disabled={p.status === "Inactive"}
                      key={p.id}
                      value={p.id}
                    >
                      {p.name} · {p.status} · {workload(db, p.id)}% /{" "}
                      {p.capacity}%
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Project role">
              <select
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              >
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Start">
                <input
                  type="date"
                  value={draft.start}
                  required
                  onChange={(e) =>
                    setDraft({ ...draft, start: e.target.value })
                  }
                />
              </Field>
              <Field label="Expected end">
                <input
                  type="date"
                  value={draft.end}
                  min={draft.start}
                  required
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Responsibility">
              <textarea
                value={draft.responsibility}
                onChange={(e) =>
                  setDraft({ ...draft, responsibility: e.target.value })
                }
              />
            </Field>
            <label className="choice">
              <input
                type="checkbox"
                checked={reassign}
                onChange={(e) => setReassign(e.target.checked)}
              />
              Reassign active tasks when replacing this person
            </label>
            <ActorField value={actor} onChange={setActor} />
            <p className="muted">
              Previous assignments and completed task history are retained.
            </p>
            <WorkflowError />
            <button className="primary">Save Assignment</button>
          </form>
        </Modal>
      )}
      {remove && (
        <Confirm
          title="Remove project assignment?"
          onClose={() => setRemove(null)}
          onConfirm={() => {
            if (
              mutate((d) => {
                d.assignments.find((a) => a.id === remove.id)!.status =
                  "Removed";
                const project = d.projects.find(
                  (p) => p.id === remove.projectId,
                )!;
                if (
                  remove.role === "Project Manager" &&
                  project.managerId === remove.personId
                )
                  project.managerId = "";
                record(
                  d,
                  remove.projectId,
                  "Assignment",
                  remove.id,
                  "Assignment removed",
                  personName(d, remove.personId),
                );
              })
            )
              setRemove(null);
          }}
        >
          Task assignments and historical work remain available.
        </Confirm>
      )}
    </>
  );
}
