import React, { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import EmployeeFormModal from "./EmployeeFormModal.jsx";

// Mirrors the classification used in TimesheetPage.jsx, so an employee's
// Teaching / Non-Teaching group is always derived consistently from their
// Sub-Group rather than relying on a `group` field that isn't reliably
// populated on every employee record.
const TEACHING_SUBGROUPS = [
  "Kinder",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "SNED",
  "Departmental",
  "Subject Teacher",
  "Alive",
  "Substitute Teacher",
];

const isTeachingSubgroup = (subGroup = "") => {
  const normalized = subGroup.trim().toLowerCase();
  return (
    TEACHING_SUBGROUPS.some((sg) => sg.toLowerCase() === normalized) ||
    normalized === "sped" ||
    normalized.startsWith("subject teacher") ||
    normalized.startsWith("substitute teacher")
  );
};

const resolveGroup = (e) => {
  if (e.group === "Teaching" || e.group === "Non-Teaching") return e.group;
  return isTeachingSubgroup(e.subGroup) ? "Teaching" : "Non-Teaching";
};

export default function EmployeesPage({ employees, setEmployees }) {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [modalState, setModalState] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return employees.filter((e) => {
      if (groupFilter !== "all" && resolveGroup(e) !== groupFilter)
        return false;

      if (!q) return true;
      return (
        e.familyName?.toLowerCase().includes(q) ||
        e.firstName?.toLowerCase().includes(q) ||
        e.registryNumber?.toLowerCase().includes(q)
      );
    });
  }, [employees, search, groupFilter]);

  const registryNumbers = employees.map((e) => e.registryNumber);

  const handleSave = (employee) => {
    setEmployees((prev) => {
      if (modalState !== "add") {
        return prev.map((e) =>
          e.registryNumber === modalState.registryNumber ? employee : e,
        );
      }
      return [...prev, employee];
    });
    setModalState(null);
  };

  const handleRemove = (registryNumber) => {
    if (!confirm("Remove this employee?")) return;
    setEmployees((prev) =>
      prev.filter((e) => e.registryNumber !== registryNumber),
    );
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Employees</h2>
        <div className="page-header-actions">
          <select
            className="group-filter-select"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="all">All Groups</option>
            <option value="Teaching">Teaching</option>
            <option value="Non-Teaching">Non-Teaching</option>
          </select>
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search by family or first name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button onClick={() => setModalState("add")}>
            <Plus size={16} /> Add Employee
          </button>
        </div>
      </div>

      <div className="panel">
        {filtered.length === 0 ? (
          <p className="hint">
            {employees.length === 0
              ? 'No employees yet — click "Add Employee" to get started.'
              : "No employees match that search."}
          </p>
        ) : (
          <table className="employee-table">
            <thead>
              <tr style={{ verticalAlign: "middle" }}>
                <th style={{ textAlign: "center" }}>Registry No.</th>
                <th style={{ textAlign: "left" }}>Name</th>
                <th style={{ textAlign: "center" }}>Group</th>
                <th style={{ textAlign: "center" }}>Sub-Group</th>
                <th style={{ textAlign: "center" }}>FPrint Assigned</th>
                <th style={{ textAlign: "center" }}>Staff No. On Dev</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice()
                .sort((a, b) => a.familyName.localeCompare(b.familyName))
                .map((e) => (
                  <tr
                    key={e.registryNumber}
                    style={{ verticalAlign: "middle" }}
                  >
                    {/* Registry No. (Centered) */}
                    <td style={{ textAlign: "center" }}>{e.registryNumber}</td>

                    {/* Name (Left Aligned) */}
                    <td style={{ textAlign: "left" }}>
                      {e.familyName}, {e.firstName}{" "}
                      {e.middleInitial ? `${e.middleInitial}.` : ""}
                    </td>

                    {/* Group (Centered) */}
                    <td style={{ textAlign: "center" }}>
                      <span
                        className={`badge badge-${resolveGroup(e) === "Teaching" ? "teaching" : "nonteaching"}`}
                      >
                        {resolveGroup(e)}
                      </span>
                    </td>

                    {/* Sub-Group (Centered) */}
                    <td style={{ textAlign: "center" }}>{e.subGroup}</td>

                    {/* FPrint Assigned (Centered) */}
                    <td style={{ textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontWeight: "600",
                          color: e.fprintAssigned ? "#16a34a" : "#9ca3af",
                        }}
                      >
                        {e.fprintAssigned ? (
                          <CheckCircle2 size={15} />
                        ) : (
                          <XCircle size={15} />
                        )}
                        {e.fprintAssigned ? "Yes" : "No"}
                      </span>
                    </td>

                    {/* Staff No. On Dev (Centered) */}
                    <td style={{ textAlign: "center" }}>
                      {e.fprintAssigned && e.staffNoOnDev ? (
                        <strong>{e.staffNoOnDev}</strong>
                      ) : (
                        <span style={{ color: "#9ca3af" }}>—</span>
                      )}
                    </td>

                    {/* Actions (Centered) */}
                    <td className="row-actions" style={{ textAlign: "center" }}>
                      <button
                        className="icon-btn"
                        onClick={() => setModalState(e)}
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="icon-btn danger"
                        onClick={() => handleRemove(e.registryNumber)}
                        title="Remove"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      {modalState && (
        <EmployeeFormModal
          initial={modalState === "add" ? null : modalState}
          existingRegistryNumbers={registryNumbers}
          onSave={handleSave}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  );
}
