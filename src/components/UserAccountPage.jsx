import React, { useEffect, useState } from "react";
import {
  UserPlus,
  ShieldCheck,
  ShieldOff,
  KeyRound,
  CheckCircle2,
  Cpu,
  Users,
  Pencil,
  Trash2,
  X,
  Lock,
} from "lucide-react";

export default function UserAccountPage() {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [appVersion, setAppVersion] = useState("1.0.0");

  // New User Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editConfirmPassword, setEditConfirmPassword] = useState("");
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Delete Confirmation State (replaces native window.confirm/alert, which
  // desyncs Electron renderer focus and causes inputs elsewhere in the app
  // to stop accepting keystrokes until the user clicks away and back in)
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Load User List from SQLite API
  const refreshUsers = async () => {
    setLoadingUsers(true);
    try {
      const list = await window.dtrApi?.authListUsers?.();
      setUsers(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Failed to load user list:", err);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    refreshUsers();

    const loadVersion = async () => {
      try {
        if (window.dtrApi?.getAppVersion) {
          const ver = await window.dtrApi.getAppVersion();
          if (ver) setAppVersion(ver);
        } else if (window.dtrApi?.appVersion) {
          setAppVersion(window.dtrApi.appVersion);
        }
      } catch (err) {
        console.error("Failed to load app version:", err);
      }
    };

    loadVersion();
  }, []);

  // Handle Create New User
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!username.trim() || !password) {
      setError("Username and password are required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    let result;
    if (window.dtrApi?.authCreateUser) {
      result = await window.dtrApi.authCreateUser({
        username: username.trim(),
        password,
      });
    } else if (window.dtrApi?.createUser) {
      result = await window.dtrApi.createUser({
        username: username.trim(),
        password,
      });
    }
    setSubmitting(false);

    if (result && result.success === false) {
      setError(result.error || "Failed to create account.");
      return;
    }

    setSuccess(`Account "${username.trim()}" created successfully.`);
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    await refreshUsers();
  };

  // Open Edit Modal
  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setEditUsername(user.username || "");
    setEditPassword("");
    setEditConfirmPassword("");
    setEditError("");
    setEditSuccess("");
  };

  // Close Edit Modal
  const handleCloseEdit = () => {
    setEditingUser(null);
    setEditUsername("");
    setEditPassword("");
    setEditConfirmPassword("");
    setEditError("");
    setEditSuccess("");
  };

  // Handle Save Edit User
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditError("");
    setEditSuccess("");

    if (!editUsername.trim()) {
      setEditError("Username cannot be empty.");
      return;
    }
    if (editPassword && editPassword !== editConfirmPassword) {
      setEditError("New passwords do not match.");
      return;
    }

    setEditSubmitting(true);

    const payload = {
      id: editingUser.id,
      username: editUsername.trim(),
      ...(editPassword ? { password: editPassword } : {}),
    };

    const result = await window.dtrApi?.authUpdateUser?.(payload);
    setEditSubmitting(false);

    if (result && result.success === false) {
      setEditError(result.error || "Failed to update account.");
      return;
    }

    setEditSuccess("Account updated successfully.");
    setTimeout(async () => {
      handleCloseEdit();
      await refreshUsers();
    }, 800);
  };

  // Open Delete Confirmation (no native window.confirm)
  const handleRequestDelete = (user) => {
    setConfirmDeleteTarget(user);
    setDeleteError("");
  };

  const handleCancelDelete = () => {
    setConfirmDeleteTarget(null);
    setDeleteError("");
  };

  // Handle Delete User - Guarantees SQLite deletion before refreshing UI
  const handleConfirmDelete = async () => {
    const user = confirmDeleteTarget;
    if (!user) return;

    setDeleteSubmitting(true);
    setDeleteError("");

    try {
      const result = await window.dtrApi?.authDeleteUser?.(user.id);

      if (result && result.success === false) {
        setDeleteError(
          result.error ||
            `Failed to delete account "${user.username}" from database.`,
        );
        setDeleteSubmitting(false);
        return;
      }

      // Refresh list directly from SQLite database to confirm deletion
      await refreshUsers();
      setDeleteSubmitting(false);
      setConfirmDeleteTarget(null);
    } catch (err) {
      console.error("Error deleting user:", err);
      setDeleteError(
        `An error occurred while deleting account "${user.username}".`,
      );
      setDeleteSubmitting(false);
    }
  };

  const isProtected = users.length > 0;

  return (
    <div className="page user-account-page">
      <div className="page-header">
        <h2>User Account Management</h2>
        <p className="hint">
          Manage login accounts, update passwords, and security settings for
          this device.
        </p>
      </div>

      {/* Top Security Banner */}
      <div className="user-account-status">
        {loadingUsers ? (
          <p className="hint">Checking account status...</p>
        ) : !isProtected ? (
          <div className="status-badge status-badge-open">
            <ShieldOff size={18} strokeWidth={2} />
            <span>
              No accounts set up yet — this device does not require a login.
              Create an account below to require login protection next time.
            </span>
          </div>
        ) : (
          <div className="status-badge status-badge-protected">
            <ShieldCheck size={18} strokeWidth={2} />
            <span>
              Login protection active ({users.length} account
              {users.length === 1 ? "" : "s"} set up).
            </span>
          </div>
        )}
      </div>

      <div className="user-account-layout">
        {/* Form Column */}
        <div className="user-account-main">
          <form className="user-account-form" onSubmit={handleSubmit}>
            <div className="user-account-form-body">
              <h3>
                <UserPlus size={18} strokeWidth={2} />
                <span>Create New Account</span>
              </h3>

              <div className="form-fields-group">
                <label>
                  Username
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                    placeholder="Enter username"
                  />
                </label>

                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Enter password"
                  />
                </label>

                <label>
                  Confirm Password
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Confirm password"
                  />
                </label>
              </div>

              {error && <p className="login-error">{error}</p>}
              {success && <p className="user-account-success">{success}</p>}
            </div>

            <div className="user-account-form-footer">
              <button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Account"}
              </button>
              <div className="security-note">
                <Lock size={12} />
                <span>Hashed & encrypted locally</span>
              </div>
            </div>
          </form>
        </div>

        {/* Status Card Column */}
        <div className="user-account-hero">
          <div className="hero-card">
            <div className="hero-svg-container">
              <svg
                className="hero-svg"
                viewBox="0 0 400 240"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern
                    id="grid"
                    width="20"
                    height="20"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 20 0 L 0 0 0 20"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.05)"
                      strokeWidth="1"
                    />
                  </pattern>
                  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                    <stop
                      offset="0%"
                      stopColor={isProtected ? "#3b82f6" : "#f59e0b"}
                      stopOpacity="0.35"
                    />
                    <stop offset="100%" stopColor="#16233d" stopOpacity="0" />
                  </radialGradient>
                </defs>

                <rect width="400" height="240" rx="12" fill="#16233d" />
                <rect width="400" height="240" rx="12" fill="url(#grid)" />

                <circle cx="200" cy="110" r="90" fill="url(#glow)" />

                <path
                  d="M 50 120 L 130 120 M 270 120 L 350 120"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
                <path
                  d="M 200 40 L 200 70 M 200 150 L 200 185"
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />

                <circle
                  className="pulse-ring"
                  cx="200"
                  cy="110"
                  r="55"
                  stroke={isProtected ? "#60a5fa" : "#fbbf24"}
                  strokeWidth="1.5"
                  strokeOpacity="0.6"
                  fill="none"
                />
                <circle
                  className="pulse-ring-delayed"
                  cx="200"
                  cy="110"
                  r="70"
                  stroke={isProtected ? "#3b82f6" : "#f59e0b"}
                  strokeWidth="1"
                  strokeOpacity="0.3"
                  fill="none"
                />

                <path
                  d="M 200 68 C 225 68 240 60 240 60 V 108 C 240 135 200 152 200 152 C 200 152 160 135 160 108 V 60 C 160 60 175 68 200 68 Z"
                  fill={isProtected ? "#1d4fa3" : "#78350f"}
                  stroke={isProtected ? "#60a5fa" : "#f59e0b"}
                  strokeWidth="2.5"
                />

                <circle cx="200" cy="98" r="7" fill="#ffffff" />
                <path
                  d="M 197 103 L 203 103 L 204 116 L 196 116 Z"
                  fill="#ffffff"
                />

                <circle cx="130" cy="120" r="6" fill="#2f6fed" />
                <circle cx="270" cy="120" r="6" fill="#2f6fed" />
                <circle
                  cx="200"
                  cy="40"
                  r="5"
                  fill={isProtected ? "#10b981" : "#f59e0b"}
                />
              </svg>
            </div>

            <div className="hero-content">
              <div className="hero-header-row">
                <h4>System Security Status</h4>
                <span
                  className={`hero-status-pill ${
                    isProtected ? "pill-protected" : "pill-open"
                  }`}
                >
                  {isProtected ? "ACTIVE PROTECTION" : "UNPROTECTED"}
                </span>
              </div>

              <p className="hero-description">
                {isProtected
                  ? "Local database access is secured with hashed authentication. Authorized accounts are required to manage personnel and DTR records."
                  : "Device security is currently off. Anyone opening this application can view and manage employee records."}
              </p>

              <div className="hero-features-list">
                <div className="feature-item">
                  <CheckCircle2 size={16} className="feature-icon" />
                  <span>Local Data Encryption</span>
                </div>
                <div className="feature-item">
                  <KeyRound size={16} className="feature-icon" />
                  <span>CSC Form 48 Audit Safety</span>
                </div>
                <div
                  className="feature-item"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Cpu size={16} className="feature-icon" />
                    <span>Offline Device Authorization</span>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      color: "#94a3b8",
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      letterSpacing: "0.5px",
                    }}
                  >
                    v{appVersion}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Account Table */}
      <div className="panel user-accounts-panel">
        <div className="panel-header-row">
          <h3>
            <Users size={18} strokeWidth={2} />
            <span>Registered Accounts List ({users.length})</span>
          </h3>
        </div>

        {users.length === 0 ? (
          <p className="hint" style={{ padding: "12px 0" }}>
            No user accounts found. Create an account above to protect this app.
          </p>
        ) : (
          <table className="employee-table users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role / Access</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, idx) => (
                <tr key={u.id || u.username || idx}>
                  <td>
                    <div className="user-table-cell">
                      <div className="user-avatar-circle">
                        {u.username?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <span className="user-table-name">{u.username}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-teaching">Administrator</span>
                  </td>
                  <td>
                    <span className="user-status-online">
                      <span className="dot"></span> Active
                    </span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div
                      className="row-actions"
                      style={{ justifyContent: "flex-end" }}
                    >
                      <button
                        type="button"
                        className="icon-btn"
                        title="Edit Username & Password"
                        onClick={() => handleOpenEdit(u)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Delete Account"
                        onClick={() => handleRequestDelete(u)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>
                <Lock size={18} /> Edit Account ({editingUser.username})
              </h3>
              <button className="icon-btn" onClick={handleCloseEdit}>
                <X size={18} />
              </button>
            </div>

            <form className="employee-form" onSubmit={handleSaveEdit}>
              <label>
                Username
                <input
                  type="text"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  required
                />
              </label>

              <label>
                New Password
                <span className="field-hint">
                  (Leave blank to keep existing password)
                </span>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password"
                  autoComplete="new-password"
                />
              </label>

              {editPassword ? (
                <label>
                  Confirm New Password
                  <input
                    type="password"
                    value={editConfirmPassword}
                    onChange={(e) => setEditConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                  />
                </label>
              ) : null}

              {editError && <p className="login-error">{editError}</p>}
              {editSuccess && (
                <p className="user-account-success">{editSuccess}</p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={handleCloseEdit}
                >
                  Cancel
                </button>
                <button type="submit" disabled={editSubmitting}>
                  {editSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (replaces native window.confirm/alert) */}
      {confirmDeleteTarget && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>
                <Trash2 size={18} /> Delete Account
              </h3>
              <button
                className="icon-btn"
                onClick={handleCancelDelete}
                disabled={deleteSubmitting}
              >
                <X size={18} />
              </button>
            </div>

            <div className="employee-form">
              <p>
                Are you sure you want to permanently delete account{" "}
                <strong>
                  {confirmDeleteTarget.username ||
                    `ID ${confirmDeleteTarget.id}`}
                </strong>{" "}
                from the database? This cannot be undone.
              </p>

              {deleteError && <p className="login-error">{deleteError}</p>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={handleCancelDelete}
                  disabled={deleteSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={handleConfirmDelete}
                  disabled={deleteSubmitting}
                >
                  {deleteSubmitting ? "Deleting..." : "Delete Account"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
