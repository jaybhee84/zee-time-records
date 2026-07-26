import React from "react";
import {
  Users,
  ScanLine,
  Printer,
  Clock,
  LogOut,
  Database,
} from "lucide-react";

const NAV_ITEMS = [
  { key: "employees", label: "Employees", icon: Users },
  { key: "attendance", label: "Attendance / DTR", icon: ScanLine },
  { key: "timesheet", label: "Timesheet", icon: Clock },
  { key: "printDtr", label: "Print DTR", icon: Printer },
  { key: "backup", label: "Backup & Restore", icon: Database },
];

export default function Sidebar({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark">DTR</span>
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
    </aside>
  );
}
