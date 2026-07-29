import React, { useState } from "react";
import { X } from "lucide-react";

const GROUPS = ["Teaching", "Nonteaching"];

// Dynamic Sub-Group lists
const TEACHING_SUBGROUPS = [
  "Kinder",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "SPED",
  "Departmental",
  "Subject Teachers",
];

const NON_TEACHING_SUBGROUPS = ["Admin", "Job Order"];

const getSubGroups = (group) =>
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

  // Name fields list for targeting uppercase conversion
  const nameFields = ["familyName", "firstName", "middleInitial"];

  const update = (field) => (e) => {
    const value = nameFields.includes(field)
      ? e.target.value.toUpperCase()
      : e.target.value;

    setForm((f) => ({ ...f, [field]: value }));
  };

  // Dynamic handler when Group changes so Sub-Group updates automatically
  const handleGroupChange = (e) => {
    const newGroup = e.target.value;
    const availableSubGroups = getSubGroups(newGroup);
    setForm((f) => ({
      ...f,
      group: newGroup,
      // Default to the first available option for the new group if current is invalid
      subGroup: availableSubGroups.includes(f.subGroup)
        ? f.subGroup
        : availableSubGroups[0],
    }));
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

  const currentSubGroups = getSubGroups(form.group);

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
              <select
                style={{ width: "100%", boxSizing: "border-box" }}
                value={form.subGroup}
                onChange={update("subGroup")}
              >
                {currentSubGroups.map((sg) => (
                  <option key={sg} value={sg}>
                    {sg}
                  </option>
                ))}
              </select>
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
    </div>
  );
}
