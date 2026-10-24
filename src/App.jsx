import React, { useEffect, useState, useRef } from "react";
import { UserCheck, AlertTriangle } from "lucide-react";
import Login from "./components/Login.jsx";
import Sidebar from "./components/Sidebar.jsx";
import EmployeesPage from "./components/EmployeesPage.jsx";
import AttendancePage from "./components/AttendancePage.jsx";
import ReportPreparationView from "./components/ReportPreparationView.jsx";
import OfficialTimePage from "./components/OfficialTimePage.jsx";
import PrintDTRPage from "./components/PrintDTRPage.jsx";
import BackupView from "./components/BackupView.jsx";
import UserAccountPage from "./components/UserAccountPage.jsx";
import PrintRenderWindow from "./components/PrintRenderWindow.jsx";
import TutorialOverlay from "./components/TutorialOverlay.jsx";
import AppLoadingScreen from "./components/AppLoadingScreen.jsx";

const FIRST_RUN_TUTORIAL_KEY = "zee-time-records-tutorial-v1-complete";

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("employees");

  const [employees, setEmployees] = useState([]);
  const [punches, setPunches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [welcomeMessage, setWelcomeMessage] = useState(null);
  const [tutorialMode, setTutorialMode] = useState(null);
  const isInitialMount = useRef(true);

  // Check early for dedicated print windows
  const printParams = new URLSearchParams(window.location.search);
  if (printParams.get("print") === "1") {
    return <PrintRenderWindow jobId={printParams.get("jobId")} />;
  }

  // Welcome message auto-dismiss
  useEffect(() => {
    if (!welcomeMessage || loading) return;
    const timer = setTimeout(() => setWelcomeMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [welcomeMessage, loading]);

  useEffect(() => {
    const removeListener = window.dtrApi?.onShowTutorial?.(() => {
      setTutorialMode("full");
    });
    return () => removeListener?.();
  }, []);

  useEffect(() => {
    if (!currentUser || loading || loadError) return;
    if (localStorage.getItem(FIRST_RUN_TUTORIAL_KEY)) return;
    const timer = setTimeout(() => setTutorialMode("mini"), 900);
    return () => clearTimeout(timer);
  }, [currentUser, loading, loadError]);

  const closeTutorial = () => {
    if (tutorialMode === "mini") {
      localStorage.setItem(FIRST_RUN_TUTORIAL_KEY, "true");
    }
    setTutorialMode(null);
  };

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
  }, [currentUser, loadAttempt]);

  // Safe auto-save: skip initial mount to prevent overwriting existing DB with defaults
  const [saveError, setSaveError] = useState(null);
  const [saveAttempt, setSaveAttempt] = useState(0);
  useEffect(() => {
    if (!currentUser || loading || loadError || isInitialMount.current) return;
    let cancelled = false;
    Promise.resolve(window.dtrApi?.saveEmployees(employees))
      .then((ok) => {
        if (cancelled) return;
        setSaveError(
          ok === false
            ? "Employee changes could not be saved to the database."
            : null,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to save employees:", err);
        setSaveError("Employee changes could not be saved to the database.");
      });
    return () => {
      cancelled = true;
    };
  }, [employees, currentUser, loading, loadError, saveAttempt]);

  const handleLoginSuccess = (username) => {
    setLoading(true);
    setCurrentUser(username);
    setWelcomeMessage(`Welcome, ${username || "Administrator"}!`);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setEmployees([]);
    setPunches([]);
    setActiveTab("employees");
    setWelcomeMessage(null);
    setTutorialMode(null);
    setLoadError(null);
    setSaveError(null);
    isInitialMount.current = true;
  };

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (loading) return <AppLoadingScreen />;

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

      <main
        className={`main-content${activeTab === "employees" && !loadError ? " main-content--fluid" : ""}`}
      >
        {loadError ? (
          <div className="error-banner">
            <AlertTriangle size={20} />
            <span>{loadError}</span>
            <button type="button" onClick={() => {
              setLoading(true);
              setLoadAttempt((attempt) => attempt + 1);
            }}>Try again</button>
          </div>
        ) : (
          <>
            {saveError && (
              <div className="error-banner">
                <AlertTriangle size={20} />
                <span>{saveError}</span>
                <button
                  type="button"
                  onClick={() => setSaveAttempt((attempt) => attempt + 1)}
                >
                  Retry
                </button>
              </div>
            )}
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
            {activeTab === "reportPreparation" && (
              <ReportPreparationView
                onClose={() => setActiveTab("employees")}
              />
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

      {tutorialMode && (
        <TutorialOverlay mode={tutorialMode} onClose={closeTutorial} />
      )}
    </div>
  );
}
