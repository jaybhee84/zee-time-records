import React, { useEffect, useState } from "react";
import Login from "./components/Login.jsx";
import Sidebar from "./components/Sidebar.jsx";
import EmployeesPage from "./components/EmployeesPage.jsx";
import AttendancePage from "./components/AttendancePage.jsx";
import TimesheetPage from "./components/TimesheetPage.jsx";
import PrintDTRPage from "./components/PrintDTRPage.jsx";
import BackupView from "./components/BackupView.jsx";
import PrintRenderWindow from "./components/PrintRenderWindow.jsx";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("employees");

  const [employees, setEmployees] = useState([]);
  const [punches, setPunches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load employees & punches once the user is logged in
  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    setLoading(true);

    Promise.all([
      window.dtrApi?.loadEmployees(),
      window.dtrApi?.getPunches({}),
    ]).then(([loadedEmployees, loadedPunches]) => {
      if (cancelled) return;
      setEmployees(loadedEmployees || []);
      setPunches(loadedPunches || []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  // Persist the employee roster to SQLite whenever it changes
  useEffect(() => {
    if (!currentUser || loading) return;
    window.dtrApi?.saveEmployees(employees);
  }, [employees, currentUser, loading]);

  const handleLoginSuccess = (username) => {
    setCurrentUser(username);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setEmployees([]);
    setPunches([]);
    setActiveTab("employees");
  };

  // The hidden print window (see main.js's createPrintWindow()) loads this
  // same bundle with a `?print=1&jobId=...` query string. It has no logged
  // in user of its own (it's a fresh, separate renderer process) — so this
  // check must come BEFORE the Login gate below, or the print window would
  // just show a login screen forever. This is deliberately checked after
  // all hooks above have already run, matching the same early-return
  // pattern used for the Login gate.
  const printParams = new URLSearchParams(window.location.search);
  if (printParams.get("print") === "1") {
    return <PrintRenderWindow jobId={printParams.get("jobId")} />;
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app-shell-with-sidebar">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <main className="main-content">
        {loading ? (
          <p className="hint">Loading...</p>
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
            {activeTab === "printDtr" && (
              <PrintDTRPage employees={employees} punches={punches} />
            )}
            {activeTab === "backup" && (
              <BackupView employees={employees} setEmployees={setEmployees} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
