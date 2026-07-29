import React, { useEffect, useState, useRef } from "react";
import { UserCheck, AlertTriangle } from "lucide-react";
import Login from "./components/Login.jsx";
import Sidebar from "./components/Sidebar.jsx";
import EmployeesPage from "./components/EmployeesPage.jsx";
import AttendancePage from "./components/AttendancePage.jsx";
import TimesheetPage from "./components/TimesheetPage.jsx";
import OfficialTimePage from "./components/OfficialTimePage.jsx";
import PrintDTRPage from "./components/PrintDTRPage.jsx";
import BackupView from "./components/BackupView.jsx";
import UserAccountPage from "./components/UserAccountPage.jsx";
import PrintRenderWindow from "./components/PrintRenderWindow.jsx";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("employees");

  const [employees, setEmployees] = useState([]);
  const [punches, setPunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [welcomeMessage, setWelcomeMessage] = useState(null);
  const isInitialMount = useRef(true);

  // Check early for dedicated print windows
  const printParams = new URLSearchParams(window.location.search);
  if (printParams.get("print") === "1") {
    return <PrintRenderWindow jobId={printParams.get("jobId")} />;
  }

  // Release focus safely on document click
  useEffect(() => {
    const handlePointerDown = (e) => {
      const active = document.activeElement;
      if (active && active !== document.body && !active.contains(e.target)) {
        if (typeof active.blur === "function") {
          active.blur();
        }
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      window.removeEventListener("pointerdown", handlePointerDown, true);
  }, []);

  // Welcome message auto-dismiss
  useEffect(() => {
    if (!welcomeMessage) return;
    const timer = setTimeout(() => setWelcomeMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [welcomeMessage]);

  // Fetch initial data on login
  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    if (!window.dtrApi) {
      setLoadError(
        "Desktop API (dtrApi) is unavailable. Please check preload settings.",
      );
      setLoading(false);
      return;
    }

    Promise.all([window.dtrApi.loadEmployees(), window.dtrApi.getPunches({})])
      .then(([loadedEmployees, loadedPunches]) => {
        if (cancelled) return;
        setEmployees(loadedEmployees || []);
        setPunches(loadedPunches || []);
        setLoading(false);
        isInitialMount.current = false;
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load application data:", err);
        setLoadError("Failed to load records from storage.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // Safe auto-save: skip initial mount to prevent overwriting existing DB with defaults
  useEffect(() => {
    if (!currentUser || loading || loadError || isInitialMount.current) return;
    window.dtrApi?.saveEmployees(employees);
  }, [employees, currentUser, loading, loadError]);

  const handleLoginSuccess = (username) => {
    setCurrentUser(username);
    setWelcomeMessage(`Welcome, ${username || "Administrator"}!`);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setEmployees([]);
    setPunches([]);
    setActiveTab("employees");
    setWelcomeMessage(null);
    setLoadError(null);
    isInitialMount.current = true;
  };

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-shell-with-sidebar">
      {welcomeMessage && (
        <div className="app-toast-overlay" role="status">
          <div className="app-toast-welcome">
            <div className="app-toast-icon">
              <UserCheck size={22} strokeWidth={2.4} />
            </div>
            <div>
              <div className="app-toast-title">{welcomeMessage}</div>
              <div className="app-toast-subtitle">
                You're logged in to Zee Time Records.
              </div>
            </div>
          </div>
        </div>
      )}

      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="main-content">
        {loading ? (
          <p className="hint">Loading application data...</p>
        ) : loadError ? (
          <div className="error-banner">
            <AlertTriangle size={20} />
            <span>{loadError}</span>
          </div>
        ) : (
          <>
            {activeTab === "employees" && (
              <EmployeesPage
                employees={employees}
                setEmployees={setEmployees}
              />
            )}
            {activeTab === "attendance" && (
              <AttendancePage
                employees={employees}
                setEmployees={setEmployees}
                punches={punches}
                setPunches={setPunches}
              />
            )}
            {activeTab === "timesheet" && (
              <TimesheetPage onClose={() => setActiveTab("employees")} />
            )}
            {activeTab === "officialTime" && <OfficialTimePage />}
            {activeTab === "printDtr" && (
              <PrintDTRPage employees={employees} punches={punches} />
            )}
            {activeTab === "backup" && (
              <BackupView
                employees={employees}
                setEmployees={setEmployees}
                punches={punches}
                setPunches={setPunches}
              />
            )}
            {activeTab === "userAccount" && (
              <UserAccountPage currentUser={currentUser} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
