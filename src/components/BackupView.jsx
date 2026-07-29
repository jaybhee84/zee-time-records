import React, { useState } from "react";
import { Download, Upload, CheckCircle, AlertCircle } from "lucide-react";

export default function BackupView() {
  const [status, setStatus] = useState(null);

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      </div>
    </div>
  );
}
