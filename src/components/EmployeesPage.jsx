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
  const [selectedSubGroup, setSelectedSubGroup] = useState("");
  const [modalState, setModalState] = useState(null);
  const [confirmRemoveTarget, setConfirmRemoveTarget] = useState(null);

  // Extract unique sub-groups from current employees
  const subGroupOptions = useMemo(() => {
    const uniqueGroups = new Set(
      employees.map((e) => e.subGroup).filter(Boolean),
    );
    return Array.from(uniqueGroups).sort();
  }, [employees]);

  // Combined filter for search and selected sub-group
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return employees.filter((e) => {
      const matchesSearch =
        !q ||
        e.familyName?.toLowerCase().includes(q) ||
        e.firstName?.toLowerCase().includes(q) ||
        e.registryNumber?.toLowerCase().includes(q);

      const matchesSubGroup =
        !selectedSubGroup || e.subGroup === selectedSubGroup;

      return matchesSearch && matchesSubGroup;
    });
  }, [employees, search, selectedSubGroup]);

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

  const handleRemove = (employee) => {
    setConfirmRemoveTarget(employee);
  };

  const handleCancelRemove = () => {
    setConfirmRemoveTarget(null);
  };

  const handleConfirmRemove = () => {
    if (!confirmRemoveTarget) return;
    setEmployees((prev) =>
      prev.filter(
        (e) => e.registryNumber !== confirmRemoveTarget.registryNumber,
      ),
    );
    setConfirmRemoveTarget(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Employees</h2>
        <div className="page-header-actions">
          {/* Sub-Group Dropdown Filter */}
          <select
            value={selectedSubGroup}
            onChange={(e) => setSelectedSubGroup(e.target.value)}
            className="subgroup-select"
            style={{
              padding: "0.4rem 0.6rem",
              borderRadius: "6px",
              border: "1px solid #ccc",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            <option value="">All</option>
            {subGroupOptions.map((sg) => (
              <option key={sg} value={sg}>
                {sg}
              </option>
            ))}
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
              : "No employees match that search or sub-group filter."}
          </p>
        ) : (
          <table className="employee-table">
            <thead>
              <tr style={{ verticalAlign: "middle" }}>
                <th style={{ textAlign: "center", width: "50px" }}>#</th>
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
                .map((e, index) => (
                  <tr
                    key={e.registryNumber}
                    style={{ verticalAlign: "middle" }}
                  >
                    {/* Index / Row Number */}
                    <td
                      style={{
                        textAlign: "center",
                        fontWeight: "600",
                        color: "#6b7280",
                      }}
                    >
                      {index + 1}
                    </td>

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
                        className={`badge badge-${
                          e.group === "Teaching" ? "teaching" : "nonteaching"
                        }`}
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
                        onClick={() => handleRemove(e)}
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

      {confirmRemoveTarget && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>
                <Trash2 size={18} /> Remove Employee
              </h3>
              <button className="icon-btn" onClick={handleCancelRemove}>
                <XCircle size={18} />
              </button>
            </div>

            <div className="employee-form">
              <p>
                Remove{" "}
                <strong>
                  {confirmRemoveTarget.familyName},{" "}
                  {confirmRemoveTarget.firstName}
                </strong>{" "}
                ({confirmRemoveTarget.registryNumber}) from the roster?
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={handleCancelRemove}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={handleConfirmRemove}
                >
                  Remove Employee
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
