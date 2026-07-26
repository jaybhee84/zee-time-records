import React, { useEffect, useState } from "react";

export default function Login({ onLoginSuccess }) {
  const [userCount, setUserCount] = useState(null); // null = still checking
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    window.dtrApi?.authUserCount().then(setUserCount);
  }, []);

  const isFirstRun = userCount === 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await window.dtrApi?.authLogin({ username, password });
    setSubmitting(false);

    if (!result?.success) {
      setError(result?.error || "Login failed.");
      return;
    }
    onLoginSuccess(result.username);
  };

  if (userCount === null) {
    return (
      <div className="login-shell">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Zee Time Records</h1>

        {isFirstRun && (
          <p className="login-firstrun-note">
            First time setup — you can continue without an account, or set a
            username and password now so this device requires login next time.
          </p>
        )}

        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={isFirstRun ? "Optional" : ""}
            autoFocus
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isFirstRun ? "Optional" : ""}
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Please wait..." : isFirstRun ? "Continue" : "Log In"}
        </button>
      </form>
    </div>
  );
}
