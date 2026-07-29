import React, { useEffect, useState } from "react";
import { Clock, Save, GraduationCap, Briefcase, Info } from "lucide-react";
import { formatOfficialHours } from "../utils/dtrCalculator.js";

const DEFAULTS = {
  teaching: { amIn: "07:00", amOut: "12:00", pmIn: "13:00", pmOut: "16:30", graceMinutes: 0 },
  nonTeaching: { amIn: "08:00", amOut: "12:00", pmIn: "13:00", pmOut: "17:00", graceMinutes: 0 },
};

function ScheduleCard({ title, icon: Icon, value, onChange }) {
  const update = (field, val) => onChange({ ...value, [field]: val });

  return (
    <div className="modern-card ot-card">
      <div className="card-title-row">
        <h3>
          <Icon size={18} className="text-blue" />
          {title}
        </h3>
      </div>

      <div className="ot-grid">
        <div className="form-group">
          <label className="form-label">A.M. In</label>
          <input
            className="form-input"
            type="time"
            value={value.amIn}
            onChange={(e) => update("amIn", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">A.M. Out</label>
          <input
            className="form-input"
            type="time"
            value={value.amOut}
            onChange={(e) => update("amOut", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">P.M. In</label>
          <input
            className="form-input"
            type="time"
            value={value.pmIn}
            onChange={(e) => update("pmIn", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">P.M. Out</label>
          <input
            className="form-input"
            type="time"
            value={value.pmOut}
            onChange={(e) => update("pmOut", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Grace Period (min)</label>
          <input
            className="form-input"
            type="number"
            min={0}
            max={60}
            value={value.graceMinutes}
            onChange={(e) => update("graceMinutes", e.target.value)}
          />
        </div>
      </div>

      <div className="ot-preview">
        <Clock size={14} />
        <span>{formatOfficialHours(value) || "Set all four times above"}</span>
        {Number(value.graceMinutes) > 0 && (
          <span className="ot-grace-pill">
            {value.graceMinutes} min grace
          </span>
        )}
      </div>
    </div>
  );
}

export default function OfficialTimePage() {
  const [teaching, setTeaching] = useState(DEFAULTS.teaching);
  const [nonTeaching, setNonTeaching] = useState(DEFAULTS.nonTeaching);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }

  useEffect(() => {
    let cancelled = false;
    if (window.dtrApi) {
      window.dtrApi
        .getOfficialTime()
        .then((settings) => {
          if (cancelled || !settings) return;
          if (settings.teaching) {
            setTeaching({ ...DEFAULTS.teaching, ...settings.teaching });
          }
          if (settings.nonTeaching) {
            setNonTeaching({ ...DEFAULTS.nonTeaching, ...settings.nonTeaching });
          }
        })
        .catch((err) => console.error("Failed to load Official Time settings:", err))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [message]);

  const validate = (val) =>
    val.amIn && val.amOut && val.pmIn && val.pmOut;

  const handleSaveAll = async () => {
    if (!validate(teaching) || !validate(nonTeaching)) {
      setMessage({
        type: "error",
        text: "Please fill in all four time fields for both categories.",
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const [teachingResult, nonTeachingResult] = await Promise.all([
        window.dtrApi.saveOfficialTime({ category: "teaching", ...teaching }),
        window.dtrApi.saveOfficialTime({ category: "nonTeaching", ...nonTeaching }),
      ]);

      if (teachingResult?.success && nonTeachingResult?.success) {
        setMessage({
          type: "success",
          text: "Official Time saved. This now drives automatic undertime on the Timesheet and DTR report.",
        });
      } else {
        setMessage({
          type: "error",
          text:
            teachingResult?.error ||
            nonTeachingResult?.error ||
            "Failed to save Official Time settings.",
        });
      }
    } catch (err) {
      console.error("Save Official Time error:", err);
      setMessage({ type: "error", text: "Failed to save Official Time settings." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page official-time-page">
      <style>{`
        .official-time-page { max-width: 1000px; margin: 0 auto; padding: 8px 12px; font-family: system-ui, -apple-system, sans-serif; }
        .modern-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .modern-header h2 { font-size: 1.4rem; font-weight: 700; color: #0f172a; margin: 0; }
        .modern-header .subtext { font-size: 0.85rem; color: #64748b; margin-top: 4px; }
        .btn-primary-modern { display: inline-flex; align-items: center; gap: 8px; background-color: #2563eb; color: #ffffff; font-weight: 600; font-size: 0.875rem; padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; }
        .btn-primary-modern:disabled { opacity: 0.5; cursor: not-allowed; }
        .ts-save-banner { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; margin-bottom: 16px; }
        .ts-save-banner.success { background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
        .ts-save-banner.error { background-color: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
        .modern-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04); margin-bottom: 20px; }
        .card-title-row { margin-bottom: 16px; }
        .card-title-row h3 { font-size: 0.95rem; font-weight: 600; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 8px; }
        .text-blue { color: #2563eb; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-label { font-size: 0.725rem; font-weight: 700; text-transform: uppercase; color: #64748b; }
        .form-input { height: 40px; padding: 0 12px; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.875rem; color: #0f172a; outline: none; }
        .form-input:focus { background-color: #eff6ff; border-color: #2563eb; }
        .ot-card { max-width: 100%; }
        .ot-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; align-items: end; }
        .ot-preview { display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 10px 14px; background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; font-size: 0.85rem; font-weight: 600; color: #334155; }
        .ot-grace-pill { margin-left: auto; background-color: #dbeafe; color: #1e40af; font-size: 0.7rem; font-weight: 700; padding: 3px 8px; border-radius: 12px; }
        .ot-info { display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; color: #64748b; margin-top: 4px; margin-bottom: 20px; }
        @media (max-width: 720px) {
          .ot-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      <div className="modern-header">
        <div>
          <h2>Official Time</h2>
          <p className="subtext">
            Set office hours per employee category. Anything outside these
            bounds is auto-flagged as undertime on the Timesheet and printed
            DTR — you can still edit any single day's undertime manually
            afterward.
          </p>
        </div>
        <button
          className="btn-primary-modern"
          onClick={handleSaveAll}
          disabled={loading || saving}
        >
          <Save size={16} /> {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {message && (
        <div className={`ts-save-banner ${message.type}`} role="status">
          {message.text}
        </div>
      )}

      <div className="ot-info">
        <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>
          Grace period is the number of minutes past the bound that's still
          considered on time (e.g. a 5-minute grace means a 7:04 AM arrival
          against a 7:00 AM in-time is not marked undertime).
        </span>
      </div>

      {loading ? (
        <p className="hint">Loading current settings...</p>
      ) : (
        <>
          <ScheduleCard
            title="Teaching"
            icon={GraduationCap}
            value={teaching}
            onChange={setTeaching}
          />
          <ScheduleCard
            title="Non-Teaching"
            icon={Briefcase}
            value={nonTeaching}
            onChange={setNonTeaching}
          />
        </>
      )}
    </div>
  );
}
