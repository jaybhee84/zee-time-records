import React, { useEffect, useRef, useState } from "react";
import CSForm48View from "./CSForm48View.jsx";

/**
 * The entire content of the hidden print window created by
 * main.js's createPrintWindow(). App.jsx renders ONLY this component
 * (nothing else — no sidebar, no login, no modals) when it detects the
 * `print=1` query flag, which is the whole point of this architecture:
 * there's nothing else in this window that could leak into a printed page
 * or that needs hiding via CSS classes/@media print.
 *
 * Flow:
 *   1. Fetch this job's data (employee names + already-computed DTR rows)
 *      from main.js's in-memory store via the jobId in the URL.
 *   2. Render every employee's CS Form 48 card.
 *   3. Once rendered, wait a full paint cycle (double requestAnimationFrame)
 *      and then tell main.js it's safe to capture — main.js's
 *      createPrintWindow() is waiting on exactly this signal before it
 *      calls printToPDF()/print().
 */
export default function PrintRenderWindow({ jobId }) {
  const [jobData, setJobData] = useState(null);
  const [error, setError] = useState(null);
  const readySent = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!jobId) {
        setError("No print job id was provided.");
        return;
      }
      try {
        const data = await window.dtrApi?.getPrintJobData?.(jobId);
        if (cancelled) return;
        if (!data) {
          setError("No print job data found for this job.");
          return;
        }
        setJobData(data);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to load print job data.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  useEffect(() => {
    if (!jobData || readySent.current) return;
    readySent.current = true;

    // Two nested requestAnimationFrame calls guarantee at least one full
    // paint has completed before we signal readiness — this window has
    // nothing else on it, so once this fires the CS Form 48 content is
    // guaranteed to be visually present for printToPDF()/print() to
    // capture.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.dtrApi?.notifyPrintReady?.(jobId);
      });
    });
  }, [jobData, jobId]);

  if (error) {
    // Rendered content here doesn't matter much — main.js's timeout will
    // eventually reject the print job if this path is hit, but showing the
    // error is useful if anyone opens devtools on this hidden window while
    // debugging.
    return <div style={{ padding: 20, color: "#b91c1c" }}>{error}</div>;
  }

  if (!jobData) {
    return <div style={{ padding: 20 }}>Loading print data…</div>;
  }

  const { employees = [], year, month } = jobData;

  return (
    <div className="print-render-window">
      {employees.map((emp, idx) => (
        <div key={emp.registryNumber || idx} className="cs48-employee-block">
          <CSForm48View
            employeeName={emp.employeeName}
            year={year}
            month={month}
            rows={emp.rows}
            isPrintMode={true}
          />
        </div>
      ))}
    </div>
  );
}
