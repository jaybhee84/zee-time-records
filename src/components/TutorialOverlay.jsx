import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

const MINI_PAGES = [
  {
    target: "employees",
    title: "1. Add your employees",
    text: "Start here. Add each employee and assign the correct group and sub-group. The registry number should match the employee’s biometric identity whenever possible.",
  },
  {
    target: "attendance",
    title: "2. Link and import attendance",
    text: "Open Attendance / DTR to connect employee records to biometric device IDs and import USER.DAT and ATTLOG.DAT files.",
  },
  {
    target: "officialTime",
    title: "3. Set official working hours",
    text: "Configure Teaching and Non-Teaching schedules before reviewing undertime and generating reports.",
  },
  {
    target: "printDtr",
    title: "4. Review and print",
    text: "Use Print DTR to choose an employee, month, and paper size, then preview the official Civil Service Form No. 48 before printing.",
  },
  {
    target: "backup",
    title: "5. Protect your records",
    text: "Export a backup regularly. This is also where you can restore data or import employee information from an older Vinea backup.",
  },
];

const FULL_PAGES = [
  {
    title: "Getting Started",
    text: "Zee Time Records turns ZKTeco attendance exports into organized employee records and print-ready Civil Service Form No. 48 reports. A good workflow is: Employees → Attendance → Official Time → Print DTR → Backup.",
  },
  {
    title: "Employee Records",
    text: "Open Employees and add every person who will appear in a DTR. Enter the registry number carefully, then provide the name, group, and sub-group. Editing names or classifications will not remove a saved biometric link.",
  },
  {
    title: "Linking Biometric IDs",
    text: "Open Attendance / DTR and analyze the device’s user file. Matching IDs are linked automatically. For unmatched records, choose the correct employee manually. Verify each link before importing attendance because punches are assigned through the device PIN.",
  },
  {
    title: "Importing Attendance Logs",
    text: "Download ATTLOG.DAT from the ZKTeco device, select the USB drive or file, and import it. The app stores matched punches locally. Re-importing can be used when newer device records become available.",
  },
  {
    title: "Official Working Hours",
    text: "Set the expected arrival and departure times for Teaching and Non-Teaching employees. These schedules drive automatic undertime calculations, so confirm them before preparing final reports.",
  },
  {
    title: "Printing the DTR",
    text: "Open Print DTR, choose the year, month, employee or category, and paper size. Inspect the preview first. The printed sheet contains Office and Employee copies in the Civil Service Form No. 48 layout.",
  },
  {
    title: "Backup and Vinea Migration",
    text: "Create backups regularly and keep copies outside the computer. Backup & Restore can also import employee information from a Vinea Management backup, helping migrate older records into the newer workflow.",
  },
  {
    title: "Recommended Routine",
    text: "Keep employee links accurate, import logs on a regular schedule, review exceptions before printing, back up after important changes, and use Help → Check for Updates to stay on the latest version.",
  },
];

export default function TutorialOverlay({ mode, onClose }) {
  const pages = mode === "mini" ? MINI_PAGES : FULL_PAGES;
  const [page, setPage] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const current = pages[page];

  useEffect(() => setPage(0), [mode]);

  useEffect(() => {
    if (mode !== "mini" || !current.target) {
      setTargetRect(null);
      return undefined;
    }
    const updateRect = () => {
      const element = document.querySelector(
        `[data-tutorial="${current.target}"]`,
      );
      setTargetRect(element?.getBoundingClientRect() || null);
    };
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [current, mode]);

  const cardStyle = useMemo(() => {
    if (!targetRect) return undefined;
    return {
      left: Math.min(targetRect.right + 22, window.innerWidth - 410),
      top: Math.max(20, Math.min(targetRect.top - 12, window.innerHeight - 300)),
    };
  }, [targetRect]);

  const finish = page === pages.length - 1;

  return (
    <div className="tutorial-overlay" role="dialog" aria-modal="true">
      {targetRect && (
        <div
          className="tutorial-spotlight"
          style={{
            left: targetRect.left - 5,
            top: targetRect.top - 5,
            width: targetRect.width + 10,
            height: targetRect.height + 10,
          }}
        />
      )}
      <section
        className={`tutorial-card ${mode === "full" ? "tutorial-card-full" : ""}`}
        style={cardStyle}
      >
        <button className="tutorial-exit" onClick={onClose} aria-label="Exit tutorial">
          <X size={19} /> Exit
        </button>
        <div className="tutorial-kicker">
          {mode === "mini" ? "QUICK TOUR" : "ZEE TIME RECORDS TUTORIAL"}
        </div>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        {mode === "mini" && <div className="tutorial-pointer">← Click here</div>}
        <footer className="tutorial-footer">
          <button
            className="tutorial-arrow"
            onClick={() => setPage((value) => value - 1)}
            disabled={page === 0}
            aria-label="Previous tutorial page"
          >
            <ChevronLeft size={22} />
          </button>
          <span>{page + 1} / {pages.length}</span>
          <button
            className="tutorial-arrow"
            onClick={() => (finish ? onClose() : setPage((value) => value + 1))}
            aria-label={finish ? "Finish tutorial" : "Next tutorial page"}
          >
            {finish ? "Finish" : <ChevronRight size={22} />}
          </button>
        </footer>
      </section>
    </div>
  );
}
