import React, { useState } from "react";
import { Users, ScanLine, Printer, LogOut, Database } from "lucide-react";

const NAV_ITEMS = [
  { key: "employees", label: "Employees", icon: Users },
  { key: "attendance", label: "Attendance / DTR", icon: ScanLine },
  { key: "printDtr", label: "Print DTR", icon: Printer },
  { key: "backup", label: "Backup & Restore", icon: Database },
];

const TIMESHEET_UNLOCK_CODE = "1984";

export default function Sidebar({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
}) {
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);

  const openCodeModal = () => {
    setCodeInput("");
    setCodeError(false);
    setShowCodeModal(true);
  };

  const closeCodeModal = () => {
    setShowCodeModal(false);
    setCodeInput("");
    setCodeError(false);
  };

  const handleCodeSubmit = (e) => {
    e.preventDefault();
    if (codeInput.trim() === TIMESHEET_UNLOCK_CODE) {
      setActiveTab("timesheet");
      closeCodeModal();
    } else {
      setCodeError(true);
      setCodeInput("");
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span
          className="sidebar-brand-mark"
          onClick={openCodeModal}
          style={{ cursor: "pointer" }}
        >
          DTR
        </span>
        <span className="sidebar-brand-text">Zee Time Records</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`sidebar-nav-item ${activeTab === key ? "active" : ""}`}
            onClick={() => setActiveTab(key)}
          >
            <Icon size={18} strokeWidth={2} />
            <span>{label}</span>
          </button>
        ))}

        {/* Timesheet is intentionally omitted from visible nav.
            It's unlocked only via the hidden code prompt above. */}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">{currentUser}</div>
        <button className="sidebar-logout" onClick={onLogout}>
          <LogOut size={16} strokeWidth={2} />
          <span>Log Out</span>
        </button>
      </div>

      {showCodeModal && (
        <div
          className="modal-overlay"
          onClick={closeCodeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: "24px",
              width: 280,
              boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            }}
          >
            <form onSubmit={handleCodeSubmit}>
              <label
                htmlFor="timesheet-code-input"
                style={{
                  display: "block",
                  marginBottom: 8,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                Enter access code
              </label>
              <input
                id="timesheet-code-input"
                type="password"
                inputMode="numeric"
                autoFocus
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setCodeError(false);
                }}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  fontSize: 14,
                  borderRadius: 6,
                  border: codeError ? "1px solid #d33" : "1px solid #ccc",
                  marginBottom: codeError ? 6 : 12,
                  boxSizing: "border-box",
                }}
              />
              {codeError && (
                <p
                  style={{
                    color: "#d33",
                    fontSize: 12,
                    margin: "0 0 10px",
                  }}
                >
                  Incorrect code.
                </p>
              )}
              <div
                style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
              >
                <button
                  type="button"
                  onClick={closeCodeModal}
                  style={{
                    padding: "6px 12px",
                    fontSize: 13,
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    background: "#f5f5f5",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "6px 12px",
                    fontSize: 13,
                    borderRadius: 6,
                    border: "none",
                    background: "#2563eb",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
