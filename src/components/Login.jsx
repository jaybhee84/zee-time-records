import React, { useEffect, useState } from "react";
import logoSrc from "../assets/ZeeTimeRecords_Logo.png";
import bg1 from "../assets/bg1.jpg";
import bg2 from "../assets/bg2.png";
import bg3 from "../assets/bg3.jpg";
import bg4 from "../assets/bg4.jpg";

const BG_IMAGES = [bg1, bg2, bg3, bg4];

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  .zt-login-root {
    display: flex;
    height: 100vh;
    width: 100vw;
    font-family: 'Inter', system-ui, sans-serif;
    background: #0f172a;
    overflow: hidden;
  }

  /* ── Left brand panel ── */
  .zt-brand-panel {
    position: relative;
    width: 42%;
    background: linear-gradient(155deg, #1e3a5f 0%, #0f172a 60%, #162032 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 40px;
    overflow: hidden;
    flex-shrink: 0;
  }

  @keyframes zt-pulse-1 {
    0%   { transform: scale(1);    opacity: 0.55; }
    100% { transform: scale(1.9);  opacity: 0; }
  }
  @keyframes zt-pulse-2 {
    0%   { transform: scale(1);    opacity: 0.4; }
    100% { transform: scale(2.3);  opacity: 0; }
  }
  @keyframes zt-pulse-3 {
    0%   { transform: scale(1);    opacity: 0.25; }
    100% { transform: scale(2.75); opacity: 0; }
  }

  .zt-brand-inner {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    text-align: center;
  }

  .zt-logo-wrap {
    --logo-size: 250px;
    position: relative;
    width: var(--logo-size);
    height: var(--logo-size);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .zt-pulse-ring {
    position: absolute;
    inset: 0;
    border-radius: 16px;
    border: 1.5px solid rgba(245,158,11,0.7);
    animation-duration: 2.6s;
    animation-timing-function: ease-out;
    animation-iteration-count: infinite;
    pointer-events: none;
  }
  .zt-pulse-ring:nth-child(1) { animation-name: zt-pulse-1; animation-delay: 0s; }
  .zt-pulse-ring:nth-child(2) { animation-name: zt-pulse-2; animation-delay: 0.65s; }
  .zt-pulse-ring:nth-child(3) { animation-name: zt-pulse-3; animation-delay: 1.3s; }

  .zt-logo-ring {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    border-radius: 16px;
    background: rgba(255,255,255,0.06);
    border: 1.5px solid rgba(245,158,11,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 28px rgba(37,99,235,0.2);
    overflow: hidden;
  }

  .zt-logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 12px;
  }

  .zt-logo-fallback {
    width: 100%;
    height: 100%;
    border-radius: 12px;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: calc(var(--logo-size) * 0.25);
    font-weight: 700;
    color: #fff;
    letter-spacing: -1px;
  }

  .zt-brand-name {
    font-size: 22px;
    font-weight: 700;
    color: #f1f5f9;
    letter-spacing: -0.3px;
    line-height: 1.2;
  }

  .zt-brand-tagline {
    font-size: 12px;
    font-weight: 400;
    color: #64748b;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    margin-top: 4px;
  }

  .zt-brand-divider {
    width: 40px;
    height: 2px;
    background: linear-gradient(90deg, #2563eb, #f59e0b);
    border-radius: 2px;
  }

  .zt-brand-features {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    max-width: 220px;
  }

  .zt-brand-feature {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
    color: #94a3b8;
    font-weight: 400;
  }

  .zt-feature-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #2563eb;
    flex-shrink: 0;
  }

  /* ── Right form panel with dynamic background slideshow ── */
  .zt-form-panel {
    position: relative;
    flex: 1;
    background: #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 40px;
    overflow: hidden;
  }

  .zt-bg-slide {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    opacity: 0;
    transition: opacity 1.8s ease-in-out, transform 6s ease-out;
    transform: scale(1.06);
    z-index: 0;
  }

  .zt-bg-slide.active {
    opacity: 1;
    transform: scale(1);
  }

  /* ── Light darkness overlay to make background image crisp ── */
  .zt-bg-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      rgba(15, 23, 42, 0.25) 0%,
      rgba(15, 23, 42, 0.1) 100%
    );
    z-index: 1;
  }

  /* ── ULTRA-CLEAR SEE-THROUGH GLASS CARD ── */
  .zt-form-card {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 380px;
    display: flex;
    flex-direction: column;
    gap: 28px;
    /* 20% white tint so background is clearly visible */
    background: rgba(255, 255, 255, 0.2); 
    /* Reduced blur from 20px to 8px so background shapes stay sharp */
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 36px 32px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
  }

  .zt-form-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  @keyframes zt-letter-drop {
    0%   { opacity: 0; transform: translateY(-22px) scale(0.8); }
    60%  { transform: translateY(4px) scale(1.05); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes zt-smiley-bounce {
    0%, 100% { transform: translateY(0) rotate(-8deg) scale(1); }
    30%       { transform: translateY(-10px) rotate(8deg) scale(1.15); }
    60%       { transform: translateY(-4px) rotate(-4deg) scale(1.08); }
  }

  @keyframes zt-smiley-in {
    0%   { opacity: 0; transform: scale(0) rotate(-30deg); }
    70%  { transform: scale(1.2) rotate(10deg); }
    100% { opacity: 1; transform: scale(1) rotate(0deg); }
  }

  .zt-form-title {
    font-size: 28px;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .zt-welcome-letters {
    display: flex;
    gap: 1px;
  }

  .zt-welcome-letter {
    display: inline-block;
    opacity: 0;
    animation: zt-letter-drop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards;
  }

  .zt-smiley {
    display: inline-block;
    font-size: 28px;
    line-height: 1;
    opacity: 0;
    animation:
      zt-smiley-in 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards,
      zt-smiley-bounce 2.2s ease-in-out 1.2s infinite;
  }

  .zt-signin-title {
    font-size: 26px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.4px;
    margin: 0;
  }

  .zt-form-subtitle {
    font-size: 13.5px;
    color: #0f172a;
    font-weight: 600;
    margin: 0;
  }

  /* ── ULTRA-CLEAR NOTICE BOX ── */
  .zt-firstrun-notice {
    background: rgba(239, 246, 255, 0.25);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-left: 3px solid #2563eb;
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 12.5px;
    color: #0f172a;
    line-height: 1.55;
    font-weight: 600;
  }

  .zt-fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .zt-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .zt-label {
    font-size: 12.5px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.1px;
  }

  /* ── ULTRA-CLEAR GLASS INPUT BOXES ── */
  .zt-input {
    height: 42px;
    padding: 0 14px;
    border: 1.5px solid rgba(255, 255, 255, 0.5);
    border-radius: 8px;
    font-size: 14px;
    font-family: 'Inter', system-ui, sans-serif;
    color: #0f172a;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    outline: none;
    transition: all 0.2s ease;
    width: 100%;
    box-sizing: border-box;
    font-weight: 600;
  }

  .zt-input::placeholder {
    color: #334155;
    font-size: 13px;
  }

  .zt-input:focus {
    border-color: #2563eb;
    background: rgba(255, 255, 255, 0.7);
    box-shadow: 0 0 0 3px rgba(37,99,235,0.25);
  }

  .zt-error {
    display: flex;
    align-items: center;
    gap: 7px;
    background: rgba(254, 242, 242, 0.9);
    border: 1px solid #fecaca;
    border-radius: 7px;
    padding: 10px 12px;
    font-size: 12.5px;
    color: #b91c1c;
    font-weight: 600;
  }

  .zt-submit-btn {
    height: 44px;
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    color: #fff;
    border: none;
    border-radius: 9px;
    font-size: 14px;
    font-weight: 600;
    font-family: 'Inter', system-ui, sans-serif;
    cursor: pointer;
    letter-spacing: 0.1px;
    transition: opacity 0.15s, transform 0.1s, box-shadow 0.15s;
    box-shadow: 0 4px 14px rgba(37,99,235,0.4);
    width: 100%;
  }

  .zt-submit-btn:hover:not(:disabled) {
    opacity: 0.95;
    box-shadow: 0 6px 20px rgba(37,99,235,0.5);
    transform: translateY(-1px);
  }

  .zt-submit-btn:active:not(:disabled) {
    transform: translateY(0);
  }

  .zt-submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    box-shadow: none;
  }

  .zt-loading-shell {
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f172a;
    color: #64748b;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 14px;
  }

  @media (max-width: 700px) {
    .zt-brand-panel { display: none; }
    .zt-form-panel { background: #0f172a; }
    .zt-form-card { max-width: 340px; }
  }
`;

export default function Login({ onLoginSuccess }) {
  const [userCount, setUserCount] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    window.dtrApi?.authUserCount().then(setUserCount);
  }, []);

  // Slideshow background timer (5 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setBgIndex((prevIndex) => (prevIndex + 1) % BG_IMAGES.length);
    }, 5000);

    return () => clearInterval(timer);
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
      <>
        <style>{styles}</style>
        <div className="zt-loading-shell">Initializing…</div>
      </>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="zt-login-root">
        {/* ── Left brand panel ── */}
        <div className="zt-brand-panel">
          <div className="zt-brand-inner">
            <div className="zt-logo-wrap">
              <div className="zt-pulse-ring" />
              <div className="zt-pulse-ring" />
              <div className="zt-pulse-ring" />
              <div className="zt-logo-ring">
                {!logoError ? (
                  <img
                    className="zt-logo-img"
                    src={logoSrc}
                    alt="Zee Time Records"
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <div className="zt-logo-fallback">ZT</div>
                )}
              </div>
            </div>

            <div>
              <div className="zt-brand-name">Zee Time Records</div>
              <div className="zt-brand-tagline">Daily Time Record System</div>
            </div>

            <div className="zt-brand-divider" />

            <div className="zt-brand-features">
              {[
                "CS Form 48 — DTR compliance",
                "Biometric device integration",
                "Offline-first, no internet needed",
                "DepEd administrative ready",
              ].map((f) => (
                <div className="zt-brand-feature" key={f}>
                  <div className="zt-feature-dot" />
                  {f}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right form panel with dynamic background images ── */}
        <div className="zt-form-panel">
          {BG_IMAGES.map((url, i) => (
            <div
              key={i}
              className={`zt-bg-slide ${i === bgIndex ? "active" : ""}`}
              style={{ backgroundImage: `url(${url})` }}
            />
          ))}
          <div className="zt-bg-overlay" />

          <div className="zt-form-card">
            <div className="zt-form-header">
              {isFirstRun ? (
                <h1 className="zt-form-title">
                  <span className="zt-welcome-letters">
                    {"WELCOME".split("").map((char, i) => (
                      <span
                        key={i}
                        className="zt-welcome-letter"
                        style={{ animationDelay: `${i * 0.07}s` }}
                      >
                        {char}
                      </span>
                    ))}
                  </span>
                  <span
                    className="zt-smiley"
                    style={{
                      animationDelay: `${7 * 0.07 + 0.1}s`,
                      animationFillMode: "forwards",
                    }}
                    role="img"
                    aria-label="smiley"
                  >
                    😊
                  </span>
                </h1>
              ) : (
                <h1 className="zt-signin-title">Sign in</h1>
              )}
              <p className="zt-form-subtitle">
                {isFirstRun
                  ? "Set up your account or continue without one."
                  : "Enter your credentials to continue."}
              </p>
            </div>

            {isFirstRun && (
              <div className="zt-firstrun-notice">
                First-time setup — you can continue without an account, or set a
                username and password now so this device requires login next
                time.
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="zt-fields">
                <div className="zt-field">
                  <label className="zt-label" htmlFor="zt-username">
                    Username{isFirstRun && " (optional)"}
                  </label>
                  <input
                    id="zt-username"
                    className="zt-input"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={
                      isFirstRun ? "Choose a username" : "Enter username"
                    }
                    autoFocus
                    autoComplete="username"
                  />
                </div>

                <div className="zt-field">
                  <label className="zt-label" htmlFor="zt-password">
                    Password{isFirstRun && " (optional)"}
                  </label>
                  <input
                    id="zt-password"
                    className="zt-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      isFirstRun ? "Choose a password" : "Enter password"
                    }
                    autoComplete="current-password"
                  />
                </div>

                {error && (
                  <div className="zt-error">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="zt-submit-btn"
                  disabled={submitting}
                  style={{ marginTop: 4 }}
                >
                  {submitting
                    ? "Please wait…"
                    : isFirstRun
                      ? "Continue"
                      : "Log In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
