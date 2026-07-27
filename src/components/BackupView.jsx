import React, { useState } from "react";
import {
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  Users,
} from "lucide-react";

export default function BackupView({ employees = [], setEmployees }) {
  const [status, setStatus] = useState(null);
  const [importing, setImporting] = useState(false);

  const handleImportVinea = async () => {
    setImporting(true);
    try {
      const res = await window.dtrApi.importVineaEmployees();

      if (res.canceled) {
        setImporting(false);
        return;
      }

      if (!res.success) {
        setStatus({
          type: "error",
          msg: res.error || "Failed to read the Vinea backup file.",
        });
        setImporting(false);
        return;
      }

      // Merge into the existing roster by registryNumber: update matches,
      // append anything new. Nothing already in the app is deleted.
      const byRegistryNumber = new Map(
        employees.map((emp) => [emp.registryNumber, emp]),
      );

      let addedCount = 0;
      let updatedCount = 0;

      res.employees.forEach((emp) => {
        if (byRegistryNumber.has(emp.registryNumber)) {
          updatedCount++;
        } else {
          addedCount++;
        }
        byRegistryNumber.set(emp.registryNumber, {
          ...byRegistryNumber.get(emp.registryNumber),
          ...emp,
        });
      });

      setEmployees(Array.from(byRegistryNumber.values()));

      const notes = [];
      if (res.skippedCount > 0) {
        notes.push(
          `${res.skippedCount} employee row(s) skipped (no employee ID)`,
        );
      }
      if (res.unmappedDepartments?.length > 0) {
        notes.push(
          `unmapped department(s) — please review: ${res.unmappedDepartments.join(", ")}`,
        );
      }
      if (res.punchesTableFound === false) {
        notes.push('no attendance log ("DTR" table) found in this file');
      }

      const punchesMsg =
        res.punchesTableFound === false
          ? ""
          : ` Also imported ${res.punchesImported} attendance log entr${res.punchesImported === 1 ? "y" : "ies"}${res.punchesSkipped > 0 ? ` (${res.punchesSkipped} skipped as duplicates/incomplete)` : ""}.`;

      setStatus({
        type: "success",
        msg: `Imported ${res.employees.length} employee(s) from ${res.sourceFile}: ${addedCount} added, ${updatedCount} updated.${punchesMsg}${notes.length ? " Note: " + notes.join("; ") + "." : ""}`,
      });
    } catch (err) {
      console.error("Vinea import error:", err);
      setStatus({ type: "error", msg: `Import failed: ${err.message}` });
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    const res = await window.dtrApi.exportBackup();
    if (res.success) {
      setStatus({ type: "success", msg: `Backup saved to ${res.filePath}` });
    } else if (res.error) {
      setStatus({ type: "error", msg: `Export failed: ${res.error}` });
    }
  };

  const handleImport = async () => {
    if (
      !window.confirm(
        "WARNING: Restoring a backup will replace all current employees and time logs on this machine. Do you want to continue?",
      )
    ) {
      return;
    }

    const res = await window.dtrApi.importBackup();
    if (res.success) {
      setStatus({
        type: "success",
        msg: "Database restored successfully! Reloading data...",
      });
      setTimeout(() => window.location.reload(), 1500);
    } else if (res.error) {
      setStatus({ type: "error", msg: `Import failed: ${res.error}` });
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Data Backup & Restore</h2>
      <p className="text-gray-600">
        Export your entire database (employees, time logs, and settings) to
        transfer to another computer or keep a safe offline copy.
      </p>

      {status && (
        <div
          className={`p-4 rounded-md flex items-center gap-2 ${status.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
        >
          {status.type === "success" ? (
            <CheckCircle size={20} />
          ) : (
            <AlertCircle size={20} />
          )}
          <span>{status.msg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-semibold text-lg">Export Backup</h3>
            <p className="text-sm text-gray-500 mt-1">
              Save a `.db` snapshot file to your flash drive or local disk.
            </p>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
          >
            <Download size={18} />
            <span>Export Backup</span>
          </button>
        </div>

        <div className="border rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-semibold text-lg">Import Backup</h3>
            <p className="text-sm text-gray-500 mt-1">
              Restore records from a previously exported `.db` backup file.
            </p>
          </div>
          <button
            onClick={handleImport}
            className="flex items-center justify-center gap-2 bg-amber-600 text-white py-2 px-4 rounded-md hover:bg-amber-700"
          >
            <Upload size={18} />
            <span>Restore Backup</span>
          </button>
        </div>

        <div className="border rounded-lg p-5 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-semibold text-lg">Import from Vinea (.mdb)</h3>
            <p className="text-sm text-gray-500 mt-1">
              Load employees and their attendance history directly from a Vinea
              Management System backup file. Existing employees are matched by
              ID and updated; new ones are added. Nothing is deleted.
            </p>
          </div>
          <button
            onClick={handleImportVinea}
            disabled={importing}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 px-4 rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            <Users size={18} />
            <span>
              {importing
                ? "Importing... this may take a moment"
                : "Import Vinea Backup"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
