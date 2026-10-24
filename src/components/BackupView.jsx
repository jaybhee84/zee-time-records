import React, { useState, useEffect } from "react";
import {
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  Users,
  X,
} from "lucide-react";

function Toast({ status, onClose }) {
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [status, onClose]);

  if (!status) return null;

  const isSuccess = status.type === "success";
  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 50,
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        maxWidth: "384px",
        width: "100%",
        padding: "16px",
        borderRadius: "8px",
        border: `1px solid ${isSuccess ? "#bbf7d0" : "#fecaca"}`,
        backgroundColor: isSuccess ? "#f0fdf4" : "#fef2f2",
        color: isSuccess ? "#166534" : "#991b1b",
        boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
      }}
    >
      {isSuccess ? (
        <CheckCircle size={20} style={{ flexShrink: 0, marginTop: "2px" }} />
      ) : (
        <AlertCircle size={20} style={{ flexShrink: 0, marginTop: "2px" }} />
      )}
      <span style={{ fontSize: "14px", flex: 1 }}>{status.msg}</span>
      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          opacity: 0.6,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Continue",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "448px",
          width: "100%",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
        }}
      >
        <div style={{ display: "flex", gap: "12px" }}>
          <AlertCircle size={22} style={{ color: "#f59e0b", flexShrink: 0 }} />
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              {title}
            </h3>
            <p
              style={{
                margin: "4px 0 0 0",
                fontSize: "14px",
                color: "#4b5563",
              }}
            >
              {message}
            </p>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
            marginTop: "20px",
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: "#dc2626",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BackupView({ employees = [], setEmployees }) {
  const [status, setStatus] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
      if (res.punchesRepaired > 0) {
        notes.push(`${res.punchesRepaired} incorrect timestamps repaired; previous database saved to ${res.repairBackupPath}`);
      }
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
          : ` Also imported ${res.punchesImported} attendance log entr${
              res.punchesImported === 1 ? "y" : "ies"
            }${
              res.punchesSkipped > 0
                ? ` (${res.punchesSkipped} skipped as duplicates/incomplete)`
                : ""
            }.`;

      setStatus({
        type: "success",
        msg: `Imported ${res.employees.length} employee(s) from ${res.sourceFile}: ${addedCount} added, ${updatedCount} updated.${punchesMsg}${
          notes.length ? " Note: " + notes.join("; ") + "." : ""
        }`,
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

  const handleImport = () => {
    setConfirmOpen(true);
  };

  const handleImportConfirmed = async () => {
    setConfirmOpen(false);
    const res = await window.dtrApi.importBackup();
    if (res.success) {
      setStatus({
        type: "success",
        msg: "Database restored successfully! Reloading data...",
      });
      setTimeout(() => window.location.reload(), 1500);
    } else if (res.error) {
      setStatus({ type: "error", msg: `Restore failed: ${res.error}` });
    }
  };

  const baseButtonStyle = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 500,
    padding: "10px 16px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
    transition: "background-color 0.2s",
  };

  const cardStyle = {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  };

  return (
    <div
      style={{
        padding: "32px",
        maxWidth: "1200px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <Toast status={status} onClose={() => setStatus(null)} />

      <ConfirmModal
        open={confirmOpen}
        title="Restore Backup"
        message="This will replace all current employees and time logs on this machine with the backup file. This cannot be undone. Do you want to continue?"
        confirmLabel="Yes, Restore"
        onConfirm={handleImportConfirmed}
        onCancel={() => setConfirmOpen(false)}
      />

      <div style={{ marginBottom: "24px" }}>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "#111827",
            margin: 0,
          }}
        >
          Data Backup & Restore
        </h2>
        <p style={{ fontSize: "14px", color: "#6b7280", marginTop: "4px" }}>
          Export your entire database to keep a safe offline copy, restore it,
          or import records from a Vinea backup.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
        }}
      >
        <div style={cardStyle}>
          <div style={{ marginBottom: "16px" }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#111827",
                margin: 0,
              }}
            >
              Export Backup
            </h3>
            <p
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginTop: "8px",
                lineHeight: "1.5",
              }}
            >
              Save a{" "}
              <code
                style={{
                  backgroundColor: "#f3f4f6",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  border: "1px solid #e5e7eb",
                }}
              >
                .db
              </code>{" "}
              snapshot file to your flash drive or local disk.
            </p>
          </div>
          <button
            onClick={handleExport}
            style={{ ...baseButtonStyle, backgroundColor: "#2563eb" }}
          >
            <Download size={16} />
            <span>Export Backup</span>
          </button>
        </div>

        <div style={cardStyle}>
          <div style={{ marginBottom: "16px" }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#111827",
                margin: 0,
              }}
            >
              Import Backup
            </h3>
            <p
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginTop: "8px",
                lineHeight: "1.5",
              }}
            >
              Restore records from a previously exported{" "}
              <code
                style={{
                  backgroundColor: "#f3f4f6",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  border: "1px solid #e5e7eb",
                }}
              >
                .db
              </code>{" "}
              backup file.
            </p>
          </div>
          <button
            onClick={handleImport}
            style={{ ...baseButtonStyle, backgroundColor: "#d97706" }}
          >
            <Upload size={16} />
            <span>Restore Backup</span>
          </button>
        </div>



        <div style={cardStyle}>
          <div style={{ marginBottom: "16px" }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#111827",
                margin: 0,
              }}
            >
              Import from Vinea (.mdb)
            </h3>
            <p
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginTop: "8px",
                lineHeight: "1.5",
              }}
            >
              Load employees and history directly from a Vinea Management backup
              file.
            </p>
          </div>
          <button
            onClick={handleImportVinea}
            disabled={importing}
            style={{
              ...baseButtonStyle,
              backgroundColor: "#059669",
              opacity: importing ? 0.5 : 1,
              cursor: importing ? "not-allowed" : "pointer",
            }}
          >
            <Users size={16} />
            <span>{importing ? "Importing…" : "Import Vinea Backup"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
