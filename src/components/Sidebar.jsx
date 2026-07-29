import React, { useState } from "react";
import { Users, ScanLine, Printer, LogOut, Database, User, Clock } from "lucide-react";

const NAV_ITEMS = [
  { key: "employees", label: "Employees", icon: Users },
  { key: "attendance", label: "Attendance / DTR", icon: ScanLine },
  { key: "officialTime", label: "Official Time", icon: Clock },
  { key: "printDtr", label: "Print DTR", icon: Printer },
  { key: "backup", label: "Backup & Restore", icon: Database },
  { key: "userAccount", label: "User Account", icon: User },
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
          onDoubleClick={openCodeModal}
          style={{ cursor: "default", userSelect: "none" }}
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
            background: "rgba(15, 23, 42, 0.45)",
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
              borderRadius: 10,
              padding: "24px",
              width: 280,
              boxShadow: "0 8px 24px rgba(18, 40, 63, 0.2)",
            }}
          >
            <form onSubmit={handleCodeSubmit}>
              <label
                htmlFor="timesheet-code-input"
                style={{
                  display: "block",
                  marginBottom: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: "#5b6673",
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
                  border: codeError ? "1px solid #c24444" : "1px solid #e1e5ea",
                  marginBottom: codeError ? 6 : 12,
                  boxSizing: "border-box",
                }}
              />
              {codeError && (
                <p
                  style={{
                    color: "#c24444",
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
                    border: "1px solid #e1e5ea",
                    background: "#eef1f5",
                    color: "#17212b",
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
                    background: "#1b3a5c",
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
