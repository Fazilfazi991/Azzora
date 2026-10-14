import { EmployeeEditor } from "../workforce/Employees";
import type { Person } from "../domain/model";
// Compatibility export; all edits use the canonical workforce editor/commands.
export function EmployeeForm({
  person,
  onClose,
}: {
  person?: Person;
  onClose: () => void;
}) {
  return <EmployeeEditor employee={person} onClose={onClose} />;
}
