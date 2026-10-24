import React, { useState } from "react";
import { Database } from "lucide-react";
import "./AttendanceExport.css";

export default function VdiExport({ onStatus }) {
  const [exportingVdi, setExportingVdi] = useState(false);

  const handleExportVdi = async () => {
    setExportingVdi(true);
    try {
      const res = await window.dtrApi.exportVdiBackup();
      if (res.canceled) return;
      if (!res.success) {
        onStatus({
          type: "error",
          msg: `VDI export failed: ${res.error || "unknown error"}`,
        });
        return;
      }

      const notes = [];
      if (res.recordsAdded > 0 || res.recordsRemoved > 0) {
        notes.push(
          `${res.recordsAdded} added and ${res.recordsRemoved} replaced/removed compared with VDI`,
        );
      }
      if (res.employeesAdded > 0 || res.employeesUpdated > 0) {
        notes.push(
          `${res.employeesAdded} employee(s) added, ${res.employeesUpdated} updated`,
        );
      }
      if (res.recordsKeptFromVdi > 0) {
        notes.push(
          `${res.recordsKeptFromVdi} older VDI record(s) kept for months not in Zee Time Records`,
        );
      }
      if (res.unmatchedPunches > 0) {
        notes.push(
          `${res.unmatchedPunches} record(s) skipped — no employee has ID ${res.unmatchedPins.join(", ")}`,
        );
      }
      if (res.employeesSkipped?.length > 0) {
        notes.push(
          `employee ID too long for VDI, skipped: ${res.employeesSkipped.join(", ")}`,
        );
      }

      onStatus({
        type: "success",
        msg: `VDI backup ${res.replaced ? "saved (replaced the existing file)" : "saved"} to ${res.filePath} with ${res.records} attendance record(s).${
          notes.length ? " " + notes.join("; ") + "." : ""
        } Restore it in VDI to apply.`,
      });
    } catch (err) {
      console.error("VDI export error:", err);
      onStatus({ type: "error", msg: `VDI export failed: ${err.message}` });
    } finally {
      setExportingVdi(false);
    }
  };

  return (
    <section className="attendance-export modern-card">
      <div className="card-title-row">
        <div>
          <h3>
            <Database size={18} className="text-blue" />
            Export to VDI (.zip)
          </h3>
          <p className="subtext">
            Create a ZIP containing the Microsoft Access database
            (MSEEDBioOfficedb.mdb) with your employees and attendance. Time
            edits made here overwrite VDI when the backup is restored.
          </p>
        </div>
        <div className="action-buttons">
          <button
            className="btn-primary-modern"
            onClick={handleExportVdi}
            disabled={exportingVdi}
          >
            <Database size={16} />
            {exportingVdi ? "Exporting… please wait" : "Export VDI Backup"}
          </button>
        </div>
      </div>
    </section>
  );
}
