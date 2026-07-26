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

export default function EmployeesPage({ employees, setEmployees }) {
  const [search, setSearch] = useState("");
  const [modalState, setModalState] = useState(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.familyName?.toLowerCase().includes(q) ||
        e.firstName?.toLowerCase().includes(q) ||
        e.registryNumber?.toLowerCase().includes(q),
    );
  }, [employees, search]);

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
                        className={`badge badge-${e.group === "Teaching" ? "teaching" : "nonteaching"}`}
                      >
                        {e.group}
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
