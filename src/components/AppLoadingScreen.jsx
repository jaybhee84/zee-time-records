import React from "react";
import logo from "../assets/ZeeTimeRecords_Logo.png";

export default function AppLoadingScreen() {
  return (
    <div className="app-loading-screen" role="status" aria-live="polite" aria-busy="true">
      <img className="app-loading-logo" src={logo} alt="" />
      <h1>Zee Time Records</h1>
      <p>Loading your employees and attendance records…</p>
      <div className="app-loading-progress" aria-hidden="true"><span /></div>
      <small>Please wait while we get everything ready.</small>
    </div>
  );
}
