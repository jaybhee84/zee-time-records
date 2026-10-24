import React, { useState, useEffect } from "react";
import { FileDown, AlertTriangle } from "lucide-react";
import "./AttendanceExport.css";

const formatExportDate = (isoString) => {
  if (!isoString) return "an earlier date";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "an earlier date";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export default function AttendanceExport({ employees = [], onStatus, onExported }) {
  const now = new Date();
  const [exportingAttlog, setExportingAttlog] = useState(false);
  const [exportMonth, setExportMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );

  const [exportLog, setExportLog] = useState([]);
  useEffect(() => {
    window.dtrApi?.getExportLog()
      .then((data) => setExportLog(data || []))
      .catch((err) => console.error("Failed to load export log:", err));
  }, []);
  const exportMonthExport = exportLog.find((entry) => entry.monthKey === exportMonth);
  const setSaveMessage = ({ type, text }) => onStatus({ type, msg: text });

  const handleExportAttlog = async () => {
    if (!exportMonth) {
      setSaveMessage({
        type: "error",
        text: "Select a month before exporting.",
      });
      return;
    }

    const selectedMonth = exportMonth;
    const [exportYear, exportMonthNumber] = selectedMonth.split("-").map(Number);
    setExportingAttlog(true);

    try {
      let monthPunches = await window.dtrApi?.getPunches({
        year: exportYear,
        month: exportMonthNumber,
      });
      if (!Array.isArray(monthPunches)) monthPunches = [];

      const filteredPunches = monthPunches.filter((punch) => {
        const timestamp =
          punch.timestamp || punch.rawTime || punch.datetime || "";
        return timestamp.startsWith(selectedMonth);
      });

      if (filteredPunches.length === 0) {
        setSaveMessage({
          type: "error",
          text: `No attendance records found for ${selectedMonth}.`,
        });
        return;
      }

      const normalizeIdentifier = (value) => {
        const trimmed = String(value || "").trim();
        const withoutLeadingZeros = trimmed.replace(/^0+/, "");
        return withoutLeadingZeros || (trimmed ? "0" : "");
      };

      const aliasToEmployee = new Map();
      employees.forEach((employee) => {
        const canonical =
          normalizeIdentifier(employee.registryNumber) ||
          normalizeIdentifier(employee.staffNoOnDev);

        [employee.registryNumber, employee.staffNoOnDev].forEach((value) => {
          const alias = normalizeIdentifier(value);
          if (alias && canonical) aliasToEmployee.set(alias, canonical);
        });
      });

      const punchesByEmployeeDay = new Map();
      filteredPunches.forEach((punch) => {
        const timestamp =
          punch.timestamp || punch.rawTime || punch.datetime || "";
        const rawPin =
          punch.pin || punch.staffNoOnDev || punch.registryNumber || "0";
        const normalizedPin = normalizeIdentifier(rawPin);
        const employeeKey = aliasToEmployee.get(normalizedPin) || normalizedPin;
        const day = String(timestamp).slice(0, 10);
        const key = `${employeeKey}|${day}`;

        if (!punchesByEmployeeDay.has(key)) {
          punchesByEmployeeDay.set(key, []);
        }
        punchesByEmployeeDay.get(key).push(punch);
      });

      const finalizedPunches = Array.from(punchesByEmployeeDay.values())
        .flatMap((dayPunches) =>
          dayPunches
            .sort((a, b) =>
              String(a.timestamp || "").localeCompare(
                String(b.timestamp || ""),
              ),
            )
            .slice(0, 4),
        )
        .sort((a, b) => {
          const pinCompare = String(a.pin || "").localeCompare(
            String(b.pin || ""),
          );
          return (
            pinCompare ||
            String(a.timestamp || "").localeCompare(String(b.timestamp || ""))
          );
        });

      const lines = finalizedPunches.map((punch) => {
        const pin =
          punch.pin || punch.staffNoOnDev || punch.registryNumber || "0";
        const timestamp =
          punch.timestamp || punch.rawTime || punch.datetime || "";
        const punchStatus = punch.status ?? "0";
        const verifyType = punch.verifyType ?? "1";
        const workCode = punch.workCode ?? "0";
        const reserved = punch.reserved ?? "0";

        return `${pin}\t${timestamp}\t${punchStatus}\t${verifyType}\t${workCode}\t${reserved}`;
      });

      const blob = new Blob([lines.join("\r\n")], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `attlog_${selectedMonth}.dat`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      window.dtrApi?.recordAttlogExport(selectedMonth);
      onExported?.(selectedMonth);
      setExportLog((prev) => [
        ...prev.filter((entry) => entry.monthKey !== selectedMonth),
        { monthKey: selectedMonth, exportedAt: new Date().toISOString() },
      ]);

      setSaveMessage({
        type: "success",
        text: `Exported ${finalizedPunches.length} attendance records for ${selectedMonth}.`,
      });
    } catch (err) {
      console.error("Export error:", err);
      setSaveMessage({
        type: "error",
        text: `Export failed: ${err.message}`,
      });
    } finally {
      setExportingAttlog(false);
    }
  };

  return (
      <section className="attendance-export modern-card">
        <div className="card-title-row">
          <div>
            <h3>
              <FileDown size={18} className="text-blue" />
              Export Attendance Log
            </h3>
            <p className="subtext">
              Create an attlog.dat file for any available attendance month.
            </p>
          </div>
          <div className="action-buttons">
            <div className="form-group" style={{ minWidth: "170px" }}>
              <label className="form-label" htmlFor="export-month">
                Export Month
              </label>
              <input
                id="export-month"
                className="form-input"
                type="month"
                value={exportMonth}
                onChange={(event) => setExportMonth(event.target.value)}
              />
            </div>
            <button
              className="btn-primary-modern"
              onClick={handleExportAttlog}
              disabled={exportingAttlog || !exportMonth}
            >
              <FileDown size={16} />
              {exportingAttlog ? "Exporting..." : "Export attlog.dat"}
            </button>
          </div>
        </div>

        {exportMonthExport && (
          <div className="rp-export-warning">
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>
              {`This month was already exported on ${formatExportDate(
                exportMonthExport.exportedAt,
              )}. Exporting again will only add whatever changed since then — Vinea will still be holding the earlier version of any record you've since edited, so clear those old entries in Vinea before importing this file.`}
            </span>
          </div>
        )}
      </section>
  );
}
