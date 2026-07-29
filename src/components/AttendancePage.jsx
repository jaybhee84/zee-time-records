import React, { useState, useEffect, useMemo } from "react";
import { parseAttlog } from "../utils/parseAttlog.js";
import { parseUserDat, base64ToText } from "../utils/parseDeviceFiles.js";
import {
  buildMonthlyDTR,
  groupByPin,
  normalizePin,
} from "../utils/dtrCalculator.js";
import DTRView from "./DTRView.jsx";
import {
  Usb,
  RefreshCw,
  UserCheck,
  Download,
  AlertTriangle,
  CheckCircle2,
  UserX,
  AlertCircle,
  Link2,
  Unlink,
  Search,
} from "lucide-react";

const now = new Date();

function toTimestampString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

export default function AttendancePage({
  employees = [],
  setEmployees,
  punches = [],
  setPunches,
}) {
  const [drives, setDrives] = useState([]);
  const [selectedDrive, setSelectedDrive] = useState("");
  const [loadingDrives, setLoadingDrives] = useState(false);

  // User Audit / Linking State
  const [auditDone, setAuditDone] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deviceUsers, setDeviceUsers] = useState([]);
  const [auditMessage, setAuditMessage] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [autoSyncedDrive, setAutoSyncedDrive] = useState(null);

  // Attendance Import State
  const [importStatus, setImportStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  // Selection & Preview State
  const [selectedRegistry, setSelectedRegistry] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [officeName, setOfficeName] = useState("");

  const byPin = useMemo(() => groupByPin(punches || []), [punches]);

  // Load attached USB drives on mount
  useEffect(() => {
    refreshUsbDrives();
  }, []);

  const refreshUsbDrives = async () => {
    setLoadingDrives(true);
    try {
      if (window.dtrApi?.getUsbDrives) {
        const detected = await window.dtrApi.getUsbDrives();
        setDrives(detected || []);
        if (detected?.length > 0) setSelectedDrive(detected[0].path);
        else {
          // No removable drives auto-detected — fall back to manual pick.
          setDrives([
            { label: "Default USB Drive / File Picker", path: "file_picker" },
          ]);
          setSelectedDrive("file_picker");
        }
      } else {
        setDrives([
          { label: "Default USB Drive / File Picker", path: "file_picker" },
        ]);
        setSelectedDrive("file_picker");
      }
    } catch (err) {
      console.error("Error fetching USB drives:", err);
    } finally {
      setLoadingDrives(false);
    }
  };

  // STEP 1: ANALYZE USERS/STAFFS FROM USB (USER.DAT)
  // user.dat is a binary file (fixed 72-byte records per user), NOT
  // tab-delimited text — see parseDeviceFiles.js for the byte layout.
  // Reads directly off the selected drive — no manual "browse for
  // user.dat" step, same as Vinea's "Analyze Users Staffs".
  const handleSyncUsers = async () => {
    setAuditMessage("");
    setAuditDone(false);
    setSyncing(true);

    try {
      const result = await window.dtrApi?.readUsbFile({
        drivePath: selectedDrive,
        fileName: "user.dat",
      });

      if (!result || !result.base64) {
        setAuditMessage("Could not read user.dat from the selected USB drive.");
        return;
      }

      const parsedDeviceUsers = parseUserDat(result.base64);

      if (parsedDeviceUsers.length === 0) {
        setAuditMessage(
          "user.dat was read but no user records were decoded — the file may be empty, or this device's firmware may use a different record layout than expected.",
        );
        return;
      }

      setDeviceUsers(parsedDeviceUsers);

      // Auto-match anywhere the device PIN already equals an employee's
      // Registry ID / staffNoOnDev, same as before. Anything left over
      // (mismatched IDs) is handled in the Assign/Unassign grid below.
      let newlyBoundCount = 0;
      const updatedEmployees = employees.map((emp) => {
        const empNorm = normalizePin(emp.staffNoOnDev || emp.registryNumber);
        const matchedDeviceUser = parsedDeviceUsers.find(
          (du) => normalizePin(du.pin) === empNorm,
        );

        if (matchedDeviceUser) {
          if (!emp.fprintAssigned) newlyBoundCount++;
          return {
            ...emp,
            fprintAssigned: true,
            staffNoOnDev: String(matchedDeviceUser.pin),
          };
        }
        return emp;
      });

      if (setEmployees) {
        setEmployees(updatedEmployees);
      }

      setAuditDone(true);
      setAuditMessage(
        `Analyzed ${parsedDeviceUsers.length} user record(s) from the device. ${newlyBoundCount} newly auto-matched by ID.`,
      );
    } finally {
      setSyncing(false);
    }
  };

  // Auto-run the analysis the first time a real USB drive is picked, if
  // there's anything still unlinked — so linking always happens before I/O
  // download without the admin having to remember to click a button first,
  // mirroring Vinea's flow.
  useEffect(() => {
    if (!selectedDrive || selectedDrive === "file_picker") return;
    if (autoSyncedDrive === selectedDrive) return; // already ran for this drive
    const hasUnlinked = employees.some((e) => !e.fprintAssigned);
    if (!hasUnlinked) return;

    setAutoSyncedDrive(selectedDrive);
    handleSyncUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDrive, employees, autoSyncedDrive]);

  // Audit Calculations
  const linkedEmployees = useMemo(
    () => employees.filter((e) => e.fprintAssigned),
    [employees],
  );

  const unlinkedAppEmployees = useMemo(
    () => employees.filter((emp) => !emp.fprintAssigned),
    [employees],
  );

  // MANUAL LINKING: assign / unassign a device Staff ID <-> app employee.
  // One device ID can only belong to one employee at a time, so assigning
  // a device ID that's already claimed unassigns the previous holder first
  // — same rule Vinea's Fingerprint Assignment Module enforces.
  const handleAssign = (devicePin, registryNumber) => {
    if (!registryNumber) return;
    const normDevicePin = normalizePin(devicePin);

    const updated = employees.map((emp) => {
      if (
        emp.registryNumber !== registryNumber &&
        emp.fprintAssigned &&
        normalizePin(emp.staffNoOnDev) === normDevicePin
      ) {
        return {
          ...emp,
          staffNoOnDev: emp.registryNumber,
          fprintAssigned: false,
        };
      }
      if (emp.registryNumber === registryNumber) {
        return {
          ...emp,
          staffNoOnDev: String(devicePin),
          fprintAssigned: true,
        };
      }
      return emp;
    });

    if (setEmployees) setEmployees(updated);
  };

  const handleUnassign = (devicePin) => {
    const normDevicePin = normalizePin(devicePin);
    const updated = employees.map((emp) => {
      if (
        emp.fprintAssigned &&
        normalizePin(emp.staffNoOnDev) === normDevicePin
      ) {
        return {
          ...emp,
          staffNoOnDev: emp.registryNumber,
          fprintAssigned: false,
        };
      }
      return emp;
    });
    if (setEmployees) setEmployees(updated);
  };

  const filteredDeviceUsers = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return deviceUsers;
    return deviceUsers.filter(
      (du) =>
        du.pin.toLowerCase().includes(q) ||
        (du.name || "").toLowerCase().includes(q),
    );
  }, [deviceUsers, staffSearch]);

  const employeeLinkedToPin = (devicePin) => {
    const normDevicePin = normalizePin(devicePin);
    return employees.find(
      (emp) =>
        emp.fprintAssigned && normalizePin(emp.staffNoOnDev) === normDevicePin,
    );
  };

  // STEP 2: DOWNLOAD ATTENDANCE LOGS (ATTLOG.DAT)
  // attlog.dat is plain text, so the base64 payload just needs decoding
  // back to a string before it goes to the existing parseAttlog(). Only
  // pulls punches for employees already linked in Step 1, same as Vinea
  // only downloading I/O for assigned Staff IDs.
  const handleDownloadAttendance = async () => {
    setImportStatus(null);
    setSaving(true);

    try {
      const result = await window.dtrApi?.readUsbFile({
        drivePath: selectedDrive,
        fileName: "attlog.dat",
      });

      if (!result || !result.base64) {
        setImportStatus({
          type: "error",
          message: "Could not read attlog.dat from the selected USB drive.",
        });
        return;
      }

      const parsedLogs = parseAttlog(base64ToText(result.base64));
      if (parsedLogs.length === 0) {
        setImportStatus({
          type: "warning",
          message: "No attendance punch records found in attlog.dat.",
        });
        return;
      }

      const boundEmployees = employees.filter((e) => e.fprintAssigned);
      let totalSavedPunches = 0;
      let matchedEmpCount = 0;

      for (const emp of boundEmployees) {
        const empNorm = normalizePin(emp.staffNoOnDev || emp.registryNumber);
        const empPunches = parsedLogs.filter(
          (p) => normalizePin(p.pin) === empNorm,
        );
        if (empPunches.length === 0) continue;

        matchedEmpCount++;
        const byMonth = {};
        for (const p of empPunches) {
          const key = `${p.datetime.getFullYear()}-${p.datetime.getMonth() + 1}`;
          (byMonth[key] ??= []).push(p);
        }

        for (const key of Object.keys(byMonth)) {
          const [y, m] = key.split("-").map(Number);
          const savePin = emp.staffNoOnDev || emp.registryNumber;
          const newPunches = byMonth[key].map((p) => ({
            pin: String(savePin),
            staffNoOnDev: String(savePin),
            timestamp: toTimestampString(p.datetime),
            rawTime: p.raw,
          }));

          await window.dtrApi?.savePunches({
            pin: String(savePin),
            year: y,
            month: m,
            newPunches,
          });

          totalSavedPunches += newPunches.length;
        }
      }

      const refreshed = await window.dtrApi?.getPunches({});
      if (setPunches) setPunches(refreshed || []);

      setImportStatus({
        type: totalSavedPunches > 0 ? "success" : "warning",
        message: `Processed ${parsedLogs.length} total raw logs. Successfully saved ${totalSavedPunches} punch records for ${matchedEmpCount} linked employee(s).`,
      });
    } catch (err) {
      console.error("Attendance Download Error:", err);
      setImportStatus({
        type: "error",
        message: `Failed to download logs: ${err.message}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedEmployee = employees.find(
    (e) => e.registryNumber === selectedRegistry,
  );

  const devicePin = selectedEmployee
    ? selectedEmployee.staffNoOnDev || selectedEmployee.registryNumber
    : selectedRegistry;

  const employeeName = selectedEmployee
    ? `${selectedEmployee.familyName}, ${selectedEmployee.firstName} ${
        selectedEmployee.middleInitial
          ? selectedEmployee.middleInitial + "."
          : ""
      }`
    : selectedRegistry;

  const dtrRows = useMemo(() => {
    if (!selectedRegistry || !devicePin) return [];
    const normDevPin = normalizePin(devicePin);
    const matchedPunches = (punches || []).filter(
      (p) => normalizePin(p.pin || p.staffNoOnDev) === normDevPin,
    );
    return buildMonthlyDTR(matchedPunches, year, month);
  }, [punches, selectedRegistry, devicePin, year, month]);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Attendance / DTR</h2>
      </div>

      {/* STEP 1: DETECT USB DRIVE */}
      <section className="panel">
        <h3>1. Select USB Drive</h3>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <select
            value={selectedDrive}
            onChange={(e) => setSelectedDrive(e.target.value)}
            style={{ width: "320px", maxWidth: "100%", padding: "8px" }}
          >
            {drives.length === 0 && (
              <option value="">No USB drive detected</option>
            )}
            {drives.map((d) => (
              <option key={d.path} value={d.path}>
                {d.label || d.path}
              </option>
            ))}
          </select>
          <button
            onClick={refreshUsbDrives}
            disabled={loadingDrives}
            className="secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
          >
            <RefreshCw size={16} className={loadingDrives ? "spin" : ""} />{" "}
            Refresh Drives
          </button>
        </div>
      </section>

      {/* STEP 2: ANALYZE USERS/STAFFS & LINK IDs */}
      <section className="panel">
        <h3>2. Analyze Users / Staffs & Link IDs</h3>
        <p className="hint" style={{ marginBottom: "12px" }}>
          Reads <strong>user.dat</strong> directly from the selected USB — no
          need to browse for the file manually. IDs that already match are
          linked automatically; anything left over can be linked below.
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            onClick={handleSyncUsers}
            disabled={!selectedDrive || syncing}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            <UserCheck size={16} />{" "}
            {syncing ? "Analyzing..." : "Analyze Users / Staffs (user.dat)"}
          </button>
          {unlinkedAppEmployees.length > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "0.85rem",
                color: "#b45309",
                fontWeight: "600",
              }}
            >
              <AlertTriangle size={16} />
              {unlinkedAppEmployees.length} app employee(s) not linked yet
            </span>
          )}
        </div>

        {auditMessage && (
          <p
            className="hint"
            style={{ marginTop: "8px", color: "#2563eb", fontWeight: "500" }}
          >
            {auditMessage}
          </p>
        )}

        {/* ASSIGN / UNASSIGN GRID — device Staff IDs on the left, linked (or
            linkable) app employee on the right, same pairing Vinea's
            Fingerprint Assignment Module grid does. */}
        {auditDone && (
          <div style={{ marginTop: "16px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "10px",
              }}
            >
              <Search size={16} style={{ color: "#6b7280" }} />
              <input
                placeholder="Search Staff ID or device name..."
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                style={{ flex: 1, maxWidth: "320px", padding: "6px 10px" }}
              />
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                overflow: "hidden",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f9fafb", textAlign: "left" }}>
                    <th style={{ padding: "8px 12px", fontSize: "0.8rem" }}>
                      Staff ID (Device)
                    </th>
                    <th style={{ padding: "8px 12px", fontSize: "0.8rem" }}>
                      Device Name
                    </th>
                    <th style={{ padding: "8px 12px", fontSize: "0.8rem" }}>
                      Linked Employee
                    </th>
                    <th style={{ padding: "8px 12px", fontSize: "0.8rem" }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeviceUsers.map((du) => {
                    const linkedEmp = employeeLinkedToPin(du.pin);
                    return (
                      <tr
                        key={du.pin}
                        style={{ borderTop: "1px solid #e5e7eb" }}
                      >
                        <td style={{ padding: "8px 12px", fontWeight: "600" }}>
                          {du.pin}
                        </td>
                        <td style={{ padding: "8px 12px", color: "#6b7280" }}>
                          {du.name}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {linkedEmp ? (
                            <span style={{ color: "#166534" }}>
                              {linkedEmp.familyName}, {linkedEmp.firstName} (
                              {linkedEmp.registryNumber})
                            </span>
                          ) : (
                            <span style={{ color: "#9ca3af" }}>Not linked</span>
                          )}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {linkedEmp ? (
                            <button
                              onClick={() => handleUnassign(du.pin)}
                              className="secondary"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                fontSize: "0.85rem",
                              }}
                            >
                              <Unlink size={14} /> Unassign
                            </button>
                          ) : (
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                handleAssign(du.pin, e.target.value);
                                e.target.value = "";
                              }}
                              style={{ fontSize: "0.85rem", padding: "4px" }}
                            >
                              <option value="" disabled>
                                Assign to employee...
                              </option>
                              {unlinkedAppEmployees.map((emp) => (
                                <option
                                  key={emp.registryNumber}
                                  value={emp.registryNumber}
                                >
                                  {emp.familyName}, {emp.firstName} (
                                  {emp.registryNumber})
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredDeviceUsers.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          padding: "16px",
                          textAlign: "center",
                          color: "#9ca3af",
                        }}
                      >
                        No device users match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {unlinkedAppEmployees.length > 0 && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "12px",
                  border: "1px solid #fde68a",
                  backgroundColor: "#fffbeb",
                  borderRadius: "6px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#b45309",
                    fontWeight: "600",
                    marginBottom: "6px",
                  }}
                >
                  <UserX size={18} />
                  <span>
                    App Employees Still Not Linked (
                    {unlinkedAppEmployees.length})
                  </span>
                </div>
                <ul
                  style={{
                    fontSize: "0.85rem",
                    paddingLeft: "18px",
                    margin: 0,
                    color: "#92400e",
                  }}
                >
                  {unlinkedAppEmployees.map((e) => (
                    <li key={e.registryNumber}>
                      {e.familyName}, {e.firstName} (Registry ID:{" "}
                      {e.registryNumber}) — use the grid above to link them to a
                      Staff ID.
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* STEP 3: DOWNLOAD ATTENDANCE */}
      <section className="panel">
        <h3>3. Download Attendance Logs</h3>
        <p className="hint" style={{ marginBottom: "12px" }}>
          Import <strong>attlog.dat</strong> from the selected USB drive for the{" "}
          {linkedEmployees.length} currently linked employee(s).
        </p>

        <button
          onClick={handleDownloadAttendance}
          disabled={saving || !selectedDrive}
          className="primary-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <Download size={16} />{" "}
          {saving ? "Downloading..." : "Download Attendance Logs (attlog.dat)"}
        </button>

        {linkedEmployees.length === 0 && (
          <p className="hint" style={{ marginTop: "8px", color: "#b45309" }}>
            No employees are linked yet — run Step 2 first so punches have
            somewhere to go.
          </p>
        )}

        {importStatus && (
          <div
            style={{
              marginTop: "12px",
              padding: "10px 14px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.9rem",
              backgroundColor:
                importStatus.type === "success"
                  ? "#f0fdf4"
                  : importStatus.type === "warning"
                    ? "#fffbeb"
                    : "#fef2f2",
              color:
                importStatus.type === "success"
                  ? "#166534"
                  : importStatus.type === "warning"
                    ? "#b45309"
                    : "#991b1b",
              border: `1px solid ${
                importStatus.type === "success"
                  ? "#bbf7d0"
                  : importStatus.type === "warning"
                    ? "#fde68a"
                    : "#fecaca"
              }`,
            }}
          >
            {importStatus.type === "success" && <CheckCircle2 size={18} />}
            {importStatus.type !== "success" && <AlertCircle size={18} />}
            <span>{importStatus.message}</span>
          </div>
        )}
      </section>

      {/* STEP 4: EMPLOYEE DTR PREVIEW */}
      <section className="panel">
        <h3>4. Select Employee & Period</h3>
        <div
          className="select-row"
          style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}
        >
          <select
            value={selectedRegistry}
            onChange={(e) => setSelectedRegistry(e.target.value)}
          >
            <option value="">-- Select Employee --</option>
            {employees.map((emp) => {
              const isBound = emp.fprintAssigned;
              const devPin = emp.staffNoOnDev || emp.registryNumber;
              return (
                <option key={emp.registryNumber} value={emp.registryNumber}>
                  {isBound ? "✓ [Linked]" : "✗ [Unlinked]"} {emp.familyName},{" "}
                  {emp.firstName} (Device ID: {devPin})
                </option>
              );
            })}
          </select>

          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i, 1).toLocaleString("en-US", {
                  month: "long",
                })}
              </option>
            ))}
          </select>

          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ width: "90px" }}
          />

          <input
            placeholder="Office / School name (optional)"
            value={officeName}
            onChange={(e) => setOfficeName(e.target.value)}
          />
        </div>
      </section>

      {selectedRegistry && (
        <section className="panel">
          <h3>5. DTR Preview</h3>
          <div className="dtr-preview">
            <DTRView
              employeeName={employeeName}
              year={year}
              month={month}
              rows={dtrRows}
              officeName={officeName}
            />
          </div>
        </section>
      )}
    </div>
  );
}
