import React, { useMemo, useState } from "react";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  X,
  ChevronUp,
  ChevronDown,
  Users,
} from "lucide-react";
import EmployeeFormModal from "./EmployeeFormModal.jsx";
import "./EmployeesPage.css";
import {
  TEACHING_SUBGROUPS,
  NON_TEACHING_SUBGROUPS,
  isTeachingSubgroup,
  isNonTeachingSubgroup,
  getGroupOptions,
  employeeMatchesGroup,
  subgroupMatches,
  isImportedGroupValue,
} from "../utils/employeeGroups.js";

// Mirrors the classification used during report preparation, so an employee's
// Teaching / Non-Teaching group is always derived consistently from their
// Sub-Group rather than relying on a `group` field that isn't reliably
// populated on every employee record.
const resolveGroup = (e) => {
  return isTeachingSubgroup(e.subGroup) ? "Teaching" : "Non-Teaching";
};

// Middle initials are stored with or without a trailing period ("H" / "H." /
// "H.A."), so only add one when it is missing.
const formatName = (e) => {
  const mi = String(e.middleInitial ?? "").trim();
  const initial = mi ? (mi.endsWith(".") ? mi : `${mi}.`) : "";
  return [`${e.familyName ?? ""}, ${e.firstName ?? ""}`, initial]
    .filter(Boolean)
    .join(" ");
};

const text = (value) => String(value ?? "");
const byName = (a, b) =>
  text(a.familyName).localeCompare(text(b.familyName)) ||
  text(a.firstName).localeCompare(text(b.firstName));

const SORTERS = {
  registryNumber: (a, b) =>
    text(a.registryNumber).localeCompare(text(b.registryNumber), undefined, {
      numeric: true,
    }),
  name: byName,
  group: (a, b) => resolveGroup(a).localeCompare(resolveGroup(b)),
  subGroup: (a, b) => text(a.subGroup).localeCompare(text(b.subGroup)),
  fprintAssigned: (a, b) =>
    Number(Boolean(b.fprintAssigned)) - Number(Boolean(a.fprintAssigned)),
  staffNoOnDev: (a, b) =>
    text(a.staffNoOnDev).localeCompare(text(b.staffNoOnDev), undefined, {
      numeric: true,
    }),
};

const COLUMNS = [
  { key: "registryNumber", label: "Registry No.", className: "col-registry" },
  { key: "name", label: "Name", className: "col-name" },
  { key: "group", label: "Group", className: "col-group" },
  { key: "subGroup", label: "Sub-Group", className: "col-subgroup" },
  { key: "fprintAssigned", label: "FPrint Assigned", className: "col-fprint" },
  { key: "staffNoOnDev", label: "Staff No. on Dev", className: "col-staff" },
];

export default function EmployeesPage({ employees, setEmployees }) {
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [subGroupFilter, setSubGroupFilter] = useState("all");
  const [modalState, setModalState] = useState(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState(null);
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const groupOptions = useMemo(() => getGroupOptions(employees), [employees]);

  const handleGroupFilterChange = (e) => {
    setGroupFilter(e.target.value);
    setSubGroupFilter("all");
  };

  // Dynamically include any custom subgroups actually present on the
  // roster, on top of the known defaults — same approach as
  // PrintDTRPage.jsx's teachingSubgroupOptions/nonTeachingSubgroupOptions.
  const subGroupOptions = useMemo(() => {
    if (groupFilter === "teaching") {
      const list = [...TEACHING_SUBGROUPS];
      employees.forEach((emp) => {
        const sg = emp?.subGroup?.trim();
        if (sg && isTeachingSubgroup(sg)) {
          if (!list.some((item) => item.toLowerCase() === sg.toLowerCase())) {
            list.push(sg);
          }
        }
      });
      return list;
    }
    if (groupFilter === "non-teaching") {
      const list = [...NON_TEACHING_SUBGROUPS];
      employees.forEach((emp) => {
        const sg = emp?.subGroup?.trim();
        if (sg && isNonTeachingSubgroup(sg)) {
          if (!list.some((item) => item.toLowerCase() === sg.toLowerCase())) {
            list.push(sg);
          }
        }
      });
      return list;
    }
    return [];
  }, [employees, groupFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return employees.filter((e) => {
      if (!employeeMatchesGroup(e, groupFilter)) return false;

      if (
        groupFilter !== "all" &&
        subGroupFilter !== "all" &&
        !subgroupMatches(e.subGroup, subGroupFilter)
      ) {
        return false;
      }

      if (!q) return true;
      return (
        e.familyName?.toLowerCase().includes(q) ||
        e.firstName?.toLowerCase().includes(q) ||
        e.registryNumber?.toLowerCase().includes(q)
      );
    });
  }, [employees, search, groupFilter, subGroupFilter]);

  const sorted = useMemo(() => {
    const compare = SORTERS[sort.key] || byName;
    const dir = sort.dir === "asc" ? 1 : -1;
    return filtered.slice().sort((a, b) => compare(a, b) * dir || byName(a, b));
  }, [filtered, sort]);

  const teachingCount = useMemo(
    () => employees.filter((e) => isTeachingSubgroup(e.subGroup)).length,
    [employees],
  );
  const isFiltered =
    search.trim() !== "" || groupFilter !== "all" || subGroupFilter !== "all";

  const toggleSort = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  const clearFilters = () => {
    setSearch("");
    setGroupFilter("all");
    setSubGroupFilter("all");
  };

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

  // Native window.confirm() blocks the renderer and, in Electron on Windows,
  // can leave the window unable to receive clicks afterward until it loses
  // and regains focus (e.g. alt-tabbing away and back). A plain in-page
  // modal avoids the native dialog entirely, matching how account deletion
  // is already confirmed in UserAccountPage.jsx.
  const handleRemove = (registryNumber) => {
    const target = employees.find((e) => e.registryNumber === registryNumber);
    if (target) setConfirmDeleteTarget(target);
  };

  const handleCancelRemove = () => setConfirmDeleteTarget(null);

  const handleConfirmRemove = () => {
    const registryNumber = confirmDeleteTarget?.registryNumber;
    setEmployees((prev) =>
      prev.filter((e) => e.registryNumber !== registryNumber),
    );
    setConfirmDeleteTarget(null);
  };

  return (
    <div className="page employees-page">
      <div className="employees-header">
        <div className="employees-title">
          <h2>Employees</h2>
          <span className="employees-subtitle">
            {employees.length} total · {teachingCount} teaching ·{" "}
            {employees.length - teachingCount} non-teaching
          </span>
        </div>
        <button className="employees-add" onClick={() => setModalState("add")}>
          <Plus size={16} /> Add Employee
        </button>
      </div>

      <div className="employees-toolbar">
        <div className="employees-search">
          <Search size={15} />
          <input
            placeholder="Search by name or registry no."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="employees-search-clear"
              onClick={() => setSearch("")}
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          className="group-filter-select"
          value={groupFilter}
          onChange={handleGroupFilterChange}
        >
          <option value="all">All Groups</option>
          {groupOptions.map((group) => (
            <option key={group.value} value={group.value}>
              {group.label}
            </option>
          ))}
        </select>
        <select
          className="group-filter-select"
          value={subGroupFilter}
          onChange={(e) => setSubGroupFilter(e.target.value)}
          disabled={
            groupFilter === "all" || isImportedGroupValue(groupFilter)
          }
          title={
            groupFilter === "all"
              ? "Choose Teaching or Non-Teaching first"
              : isImportedGroupValue(groupFilter)
                ? "The imported group is already selected"
              : undefined
          }
        >
          <option value="all">
            {groupFilter === "all" ? "All Sub-Groups" : "All"}
          </option>
          {subGroupOptions.map((sg) => (
            <option key={sg} value={sg}>
              {sg}
            </option>
          ))}
        </select>
        {isFiltered && (
          <button
            type="button"
            className="employees-clear"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        )}
        <span className="employees-count">
          {isFiltered
            ? `Showing ${sorted.length} of ${employees.length}`
            : `${employees.length} employees`}
        </span>
      </div>

      <div className="employees-table-card">
        {sorted.length === 0 ? (
          <div className="employees-empty">
            <Users size={28} />
            <strong>
              {employees.length === 0
                ? "No employees yet"
                : "No matching employees"}
            </strong>
            <span>
              {employees.length === 0
                ? 'Click "Add Employee" or import a Vinea backup to get started.'
                : "Try a different search or clear the filters."}
            </span>
            {employees.length > 0 && isFiltered && (
              <button
                type="button"
                className="employees-clear"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="employees-table-scroll">
            <table className="employees-table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => {
                    const active = sort.key === col.key;
                    return (
                      <th
                        key={col.key}
                        className={col.className}
                        aria-sort={
                          active
                            ? sort.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                        }
                      >
                        <button
                          type="button"
                          className={`employees-sort${active ? " active" : ""}`}
                          onClick={() => toggleSort(col.key)}
                          title={`Sort by ${col.label}`}
                        >
                          {col.label}
                          {active && sort.dir === "desc" ? (
                            <ChevronDown size={13} />
                          ) : (
                            <ChevronUp size={13} />
                          )}
                        </button>
                      </th>
                    );
                  })}
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) => (
                  <tr
                    key={e.registryNumber}
                    onDoubleClick={() => setModalState(e)}
                  >
                    <td className="col-registry">{e.registryNumber}</td>
                    <td className="col-name">{formatName(e)}</td>
                    <td className="col-group">
                      <span
                        className={`badge badge-${isTeachingSubgroup(e.subGroup) ? "teaching" : "nonteaching"}`}
                      >
                        {resolveGroup(e)}
                      </span>
                    </td>
                    <td className="col-subgroup">
                      {e.subGroup || <span className="employees-muted">—</span>}
                    </td>
                    <td className="col-fprint">
                      <span
                        className={`employees-fprint${e.fprintAssigned ? " yes" : ""}`}
                      >
                        {e.fprintAssigned ? (
                          <CheckCircle2 size={15} />
                        ) : (
                          <XCircle size={15} />
                        )}
                        {e.fprintAssigned ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="col-staff">
                      {e.fprintAssigned && e.staffNoOnDev ? (
                        e.staffNoOnDev
                      ) : (
                        <span className="employees-muted">—</span>
                      )}
                    </td>
                    <td className="col-actions">
                      <div className="employees-row-actions">
                        <button
                          className="icon-btn"
                          onClick={() => setModalState(e)}
                          title="Edit"
                          aria-label={`Edit ${formatName(e)}`}
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          className="icon-btn danger"
                          onClick={() => handleRemove(e.registryNumber)}
                          title="Remove"
                          aria-label={`Remove ${formatName(e)}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

      {confirmDeleteTarget && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>
                <Trash2 size={18} /> Remove Employee
              </h3>
              <button className="icon-btn" onClick={handleCancelRemove}>
                <X size={18} />
              </button>
            </div>

            <div className="employee-form">
              <p>
                Are you sure you want to remove{" "}
                <strong>{formatName(confirmDeleteTarget)}</strong> from the
                employee list?
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
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
