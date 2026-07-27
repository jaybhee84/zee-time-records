import React, { useEffect, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";

const GROUPS = ["Teaching", "Nonteaching"];

// Dynamic Sub-Group lists — kept in sync with TimesheetPage.jsx's
// TEACHING_SUBGROUPS / NON_TEACHING_SUBGROUPS, since that's what actually
// filters/classifies employees when building the DTR. If these two lists
// drift, an employee saved here with a subGroup TimesheetPage doesn't
// recognize falls through to the wrong bucket there.
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

const NON_TEACHING_SUBGROUPS = ["Admin", "Job Order"];

const ADD_CUSTOM_VALUE = "__add_custom_subgroup__";

const getBuiltinSubGroups = (group) =>
  group === "Nonteaching" ? NON_TEACHING_SUBGROUPS : TEACHING_SUBGROUPS;

const emptyForm = {
  registryNumber: "",
  familyName: "",
  firstName: "",
  middleInitial: "",
  group: "Teaching",
  subGroup: "Kinder",
};

export default function EmployeeFormModal({
  initial,
  existingRegistryNumbers = [],
  onSave,
  onClose,
}) {
  // Initialize state with name fields converted to ALL CAPS
  const [form, setForm] = useState(() => {
    const base = initial || emptyForm;
    return {
      ...base,
      familyName: base.familyName?.toUpperCase() || "",
      firstName: base.firstName?.toUpperCase() || "",
      middleInitial: base.middleInitial?.toUpperCase() || "",
    };
  });

  const [error, setError] = useState("");
  const isEditing = Boolean(initial);

  // Custom sub-groups persisted in SQLite (see main.js's custom_subgroups
  // table), loaded once when this modal opens.
  const [customSubgroups, setCustomSubgroups] = useState([]);
  const [showAddSubgroup, setShowAddSubgroup] = useState(false);
  const [newSubgroupName, setNewSubgroupName] = useState("");
  const [subgroupError, setSubgroupError] = useState("");
  const [showManageSubgroups, setShowManageSubgroups] = useState(false);

  useEffect(() => {
    window.dtrApi?.loadCustomSubgroups().then((rows) => {
      if (rows) setCustomSubgroups(rows);
    });
  }, []);

  // Name fields list for targeting uppercase conversion
  const nameFields = ["familyName", "firstName", "middleInitial"];

  const update = (field) => (e) => {
    const value = nameFields.includes(field)
      ? e.target.value.toUpperCase()
      : e.target.value;

    setForm((f) => ({ ...f, [field]: value }));
  };

  // Built-in sub-groups plus any custom ones the user has added for that
  // group, deduped in case a custom entry happens to match a built-in name.
  const getCombinedSubGroups = (group) => {
    const builtins = getBuiltinSubGroups(group);
    const customs = customSubgroups
      .filter((c) => c.groupName === group)
      .map((c) => c.subGroupName)
      .filter((name) => !builtins.includes(name));
    return [...builtins, ...customs];
  };

  // Dynamic handler when Group changes so Sub-Group updates automatically
  const handleGroupChange = (e) => {
    const newGroup = e.target.value;
    const availableSubGroups = getCombinedSubGroups(newGroup);
    setForm((f) => ({
      ...f,
      group: newGroup,
      // Default to the first available option for the new group if current is invalid
      subGroup: availableSubGroups.includes(f.subGroup)
        ? f.subGroup
        : availableSubGroups[0],
    }));
  };

  const handleSubGroupChange = (e) => {
    const value = e.target.value;
    if (value === ADD_CUSTOM_VALUE) {
      setNewSubgroupName("");
      setSubgroupError("");
      setShowAddSubgroup(true);
      return;
    }
    setForm((f) => ({ ...f, subGroup: value }));
  };

  const handleAddSubgroupSubmit = async (e) => {
    e.preventDefault();
    const trimmed = newSubgroupName.trim();

    if (!trimmed) {
      setSubgroupError("Enter a name for the new sub-group.");
      return;
    }
    if (getCombinedSubGroups(form.group).includes(trimmed)) {
      setSubgroupError("That sub-group already exists for this group.");
      return;
    }

    const res = await window.dtrApi?.addCustomSubgroup({
      groupName: form.group,
      subGroupName: trimmed,
    });

    if (!res?.success) {
      setSubgroupError(res?.error || "Failed to add sub-group.");
      return;
    }

    setCustomSubgroups(res.subgroups || []);
    setForm((f) => ({ ...f, subGroup: trimmed }));
    setShowAddSubgroup(false);
  };

  const handleDeleteSubgroup = async (row) => {
    const res = await window.dtrApi?.deleteCustomSubgroup(row.id);
    if (!res?.success) return;

    setCustomSubgroups(res.subgroups || []);

    // If the deleted sub-group was the one currently selected, fall back
    // to the first built-in option for the current group.
    if (form.subGroup === row.subGroupName) {
      setForm((f) => ({ ...f, subGroup: getBuiltinSubGroups(f.group)[0] }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!form.registryNumber.trim()) {
      setError(
        "Registry number is required — this is what links the employee to their biometric ID.",
      );
      return;
    }
    if (!form.familyName.trim() || !form.firstName.trim()) {
      setError("Family name and first name are required.");
      return;
    }

    const isDuplicate =
      existingRegistryNumbers.includes(form.registryNumber.trim()) &&
      (!isEditing || initial.registryNumber !== form.registryNumber.trim());
    if (isDuplicate) {
      setError("That registry number is already used by another employee.");
      return;
    }

    onSave({
      ...form,
      registryNumber: form.registryNumber.trim(),
      familyName: form.familyName.trim().toUpperCase(),
      firstName: form.firstName.trim().toUpperCase(),
      middleInitial: form.middleInitial.trim().toUpperCase(),
    });
  };

  const currentSubGroups = getCombinedSubGroups(form.group);
  const currentGroupCustomSubgroups = customSubgroups.filter(
    (c) => c.groupName === form.group,
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "500px",
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <div className="modal-header">
          <h3>{isEditing ? "Edit Employee" : "Add Employee"}</h3>
          <button className="icon-btn" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="employee-form">
          <label style={{ display: "block", width: "100%" }}>
            Employee Registry Number
            <input
              style={{ width: "100%", boxSizing: "border-box" }}
              value={form.registryNumber}
              onChange={update("registryNumber")}
              placeholder="e.g. matches the ID enrolled on the biometric device"
            />
            <span
              className="field-hint"
              style={{
                fontSize: "0.8rem",
                color: "#666",
                marginTop: "4px",
                display: "block",
              }}
            >
              Custom ID you assign — must match this employee's enrolled ID
              (PIN) on the biometric device 1-to-1, since this is what links
              their punches to their record.
            </span>
          </label>

          {/* Responsive Name Row */}
          <div
            className="form-row"
            style={{
              display: "flex",
              gap: "10px",
              width: "100%",
              boxSizing: "border-box",
              marginTop: "12px",
            }}
          >
            <label style={{ flex: "2", minWidth: 0 }}>
              Family Name
              <input
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  textTransform: "uppercase",
                }}
                value={form.familyName}
                onChange={update("familyName")}
              />
            </label>
            <label style={{ flex: "2", minWidth: 0 }}>
              First Name
              <input
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  textTransform: "uppercase",
                }}
                value={form.firstName}
                onChange={update("firstName")}
              />
            </label>
            <label className="mi-field" style={{ flex: "1", minWidth: 0 }}>
              M.I.
              <input
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  textTransform: "uppercase",
                }}
                value={form.middleInitial}
                onChange={update("middleInitial")}
                maxLength={3}
              />
            </label>
          </div>

          {/* Group & Dynamic Sub-Group Row */}
          <div
            className="form-row"
            style={{
              display: "flex",
              gap: "10px",
              width: "100%",
              boxSizing: "border-box",
              marginTop: "12px",
            }}
          >
            <label style={{ flex: 1, minWidth: 0 }}>
              Group
              <select
                style={{ width: "100%", boxSizing: "border-box" }}
                value={form.group}
                onChange={handleGroupChange}
              >
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1, minWidth: 0 }}>
              Sub-Group
              <div
                style={{ display: "flex", gap: "6px", alignItems: "center" }}
              >
                <select
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={form.subGroup}
                  onChange={handleSubGroupChange}
                >
                  {currentSubGroups.map((sg) => (
                    <option key={sg} value={sg}>
                      {sg}
                    </option>
                  ))}
                  <option value={ADD_CUSTOM_VALUE}>
                    + Add custom sub-group...
                  </option>
                </select>
                {currentGroupCustomSubgroups.length > 0 && (
                  <button
                    type="button"
                    className="icon-btn"
                    title="Manage custom sub-groups"
                    onClick={() => setShowManageSubgroups(true)}
                    style={{ flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </label>
          </div>

          {error && <p className="login-error">{error}</p>}

          <div
            className="modal-actions"
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              marginTop: "16px",
            }}
          >
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit">
              {isEditing ? "Save Changes" : "Add Employee"}
            </button>
          </div>
        </form>
      </div>

      {showAddSubgroup && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            e.stopPropagation();
            setShowAddSubgroup(false);
          }}
          style={{ zIndex: 1100 }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "320px",
              boxSizing: "border-box",
            }}
          >
            <div className="modal-header">
              <h3>Add Sub-Group</h3>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setShowAddSubgroup(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={handleAddSubgroupSubmit}
              style={{ padding: "0 4px" }}
            >
              <label style={{ display: "block", width: "100%" }}>
                New sub-group name (for {form.group})
                <input
                  autoFocus
                  style={{ width: "100%", boxSizing: "border-box" }}
                  value={newSubgroupName}
                  onChange={(e) => {
                    setNewSubgroupName(e.target.value);
                    setSubgroupError("");
                  }}
                  placeholder="e.g. SBFP Coordinator"
                />
              </label>
              {subgroupError && <p className="login-error">{subgroupError}</p>}
              <div
                className="modal-actions"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  marginTop: "16px",
                }}
              >
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowAddSubgroup(false)}
                >
                  Cancel
                </button>
                <button type="submit">
                  <Plus size={14} style={{ marginRight: 4 }} />
                  Add
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showManageSubgroups && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            e.stopPropagation();
            setShowManageSubgroups(false);
          }}
          style={{ zIndex: 1100 }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "320px",
              boxSizing: "border-box",
            }}
          >
            <div className="modal-header">
              <h3>Manage Sub-Groups ({form.group})</h3>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setShowManageSubgroups(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: "4px" }}>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "#666",
                  marginTop: 0,
                  marginBottom: "12px",
                }}
              >
                Only custom sub-groups you've added can be removed here.
                Built-in sub-groups aren't shown since they can't be deleted.
              </p>
              {currentGroupCustomSubgroups.length === 0 ? (
                <p className="hint">No custom sub-groups for this group yet.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {currentGroupCustomSubgroups.map((row) => (
                    <li
                      key={row.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "6px 0",
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      <span>{row.subGroupName}</span>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Delete this sub-group"
                        onClick={() => handleDeleteSubgroup(row)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
