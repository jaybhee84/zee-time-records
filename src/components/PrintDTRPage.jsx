import React, { useState, useMemo, useEffect } from "react";
import {
  Printer,
  Filter,
  Calendar,
  User,
  Layers,
  Eye,
  Users,
  X,
  Loader2,
  AlertTriangle,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FileX,
} from "lucide-react";
import {
  groupByPin,
  buildMonthlyDTR,
  normalizePin,
} from "../utils/dtrCalculator.js";
import CSForm48View from "./CSForm48View.jsx";

const now = new Date();

const TEACHING_SUBGROUPS = [
  "Kinder",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "SNED",
  "Departmental",
  "Subject Teacher",
  "Alive",
  "Substitute Teacher",
];

const NON_TEACHING_SUBGROUPS = ["Admin", "Job Order"];

const isTeachingSubgroup = (subGroup = "") => {
  const normalized = subGroup.trim().toLowerCase();
  return (
    TEACHING_SUBGROUPS.some((sg) => sg.toLowerCase() === normalized) ||
    normalized === "sped" ||
    normalized.startsWith("subject teacher") ||
    normalized.startsWith("substitute teacher")
  );
};

const isNonTeachingSubgroup = (subGroup = "") => {
  const normalized = subGroup.trim().toLowerCase();
  return (
    NON_TEACHING_SUBGROUPS.some((sg) => sg.toLowerCase() === normalized) ||
    !isTeachingSubgroup(subGroup)
  );
};

// Converts a base64 string into a Blob object URL. This is used instead of
// a `data:application/pdf;base64,...` URI because Electron/Chromium's
// built-in PDF viewer frequently fails to paint data: URIs inside an
// <iframe> (renders blank), especially once the PDF is a few dozen KB+.
// Object URLs are the reliable way to preview binary content in an iframe.
function base64ToBlobUrl(base64, mimeType = "application/pdf") {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  return URL.createObjectURL(blob);
}

export default function PrintDTRPage({ employees = [], punches = [] }) {
  const [category, setCategory] = useState("all");
  const [subCategory, setSubCategory] = useState("all");
  const [selectedEmployeeReg, setSelectedEmployeeReg] = useState("all");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState(null);
  const [openingExternal, setOpeningExternal] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Which employee (index into targetEmployees) the on-screen preview is
  // currently showing. The screen preview shows ONE employee at a time
  // with Prev/Next arrows rather than stacking every matching employee's
  // full CS Form 48 card in one long scrolling page.
  const [previewIndex, setPreviewIndex] = useState(0);

  // Blank DTR toggle — when on, all rows are printed empty (no log data)
  const [blankDtr, setBlankDtr] = useState(false);

  // Printer selection state
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState("");
  const [printing, setPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);

  // Dynamically include added Teaching Subgroups from employees
  const teachingSubgroupOptions = useMemo(() => {
    const list = [...TEACHING_SUBGROUPS];
    if (Array.isArray(employees)) {
      employees.forEach((emp) => {
        const sg = emp?.subGroup?.trim();
        if (sg && isTeachingSubgroup(sg)) {
          if (!list.some((item) => item.toLowerCase() === sg.toLowerCase())) {
            list.push(sg);
          }
        }
      });
    }
    return list;
  }, [employees]);

  // Dynamically include added Non-Teaching Subgroups from employees
  const nonTeachingSubgroupOptions = useMemo(() => {
    const list = [...NON_TEACHING_SUBGROUPS];
    if (Array.isArray(employees)) {
      employees.forEach((emp) => {
        const sg = emp?.subGroup?.trim();
        if (sg && isNonTeachingSubgroup(sg)) {
          if (!list.some((item) => item.toLowerCase() === sg.toLowerCase())) {
            list.push(sg);
          }
        }
      });
    }
    return list;
  }, [employees]);

  const byPin = useMemo(() => groupByPin(punches), [punches]);

  // Always release the previous blob URL when it changes or the component
  // unmounts, to avoid leaking memory across repeated previews.
  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const handleCategoryChange = (e) => {
    setHasInteracted(true);
    setCategory(e.target.value);
    setSubCategory("all");
    setSelectedEmployeeReg("all");
  };

  const handleSubCategoryChange = (e) => {
    setHasInteracted(true);
    setSubCategory(e.target.value);
    setSelectedEmployeeReg("all");
  };

  const categoryEmployees = useMemo(() => {
    if (!Array.isArray(employees)) return [];

    return employees.filter((emp) => {
      const sg = emp?.subGroup || "";

      if (category === "teaching") {
        if (!isTeachingSubgroup(sg)) return false;
        if (subCategory !== "all") {
          const normSg = sg.trim().toLowerCase();
          const normSubCat = subCategory.trim().toLowerCase();
          if (
            (normSubCat === "sned" || normSubCat === "sped") &&
            (normSg === "sned" || normSg === "sped")
          ) {
            return true;
          }
          if (
            normSubCat.startsWith("subject teacher") &&
            normSg.startsWith("subject teacher")
          ) {
            return true;
          }
          if (
            normSubCat.startsWith("substitute teacher") &&
            normSg.startsWith("substitute teacher")
          ) {
            return true;
          }
          return normSg === normSubCat;
        }
        return true;
      }

      if (category === "non-teaching") {
        if (!isNonTeachingSubgroup(sg)) return false;
        if (subCategory !== "all") {
          return sg.trim().toLowerCase() === subCategory.trim().toLowerCase();
        }
        return true;
      }

      return true;
    });
  }, [employees, category, subCategory]);

  const targetEmployees = useMemo(() => {
    if (selectedEmployeeReg === "all" || !selectedEmployeeReg) {
      return categoryEmployees;
    }
    return categoryEmployees.filter(
      (e) => e?.registryNumber === selectedEmployeeReg,
    );
  }, [categoryEmployees, selectedEmployeeReg]);

  // Keep the preview pointer valid whenever the filtered list changes size
  // (new filter picked, employee count changed, etc.) instead of pointing
  // at a now-nonexistent index.
  useEffect(() => {
    setPreviewIndex(0);
  }, [category, subCategory, selectedEmployeeReg]);

  const clampedPreviewIndex =
    targetEmployees.length === 0
      ? 0
      : Math.min(previewIndex, targetEmployees.length - 1);

  const activePreviewEmployee = targetEmployees[clampedPreviewIndex] || null;

  const goToPreviousEmployee = () => {
    setPreviewIndex((idx) => Math.max(0, idx - 1));
  };

  const goToNextEmployee = () => {
    setPreviewIndex((idx) => Math.min(targetEmployees.length - 1, idx + 1));
  };

  const monthNameFor = (m) =>
    new Date(2000, m - 1, 1).toLocaleString("en-US", { month: "long" });

  const buildSuggestedFileName = () => {
    const monthName = monthNameFor(month);
    if (selectedEmployeeReg !== "all" && targetEmployees.length === 1) {
      const emp = targetEmployees[0];
      const family = (emp.familyName || "Employee").replace(/\s+/g, "_");
      const first = (emp.firstName || "").replace(/\s+/g, "_");
      return `DTR_${family}_${first}_${monthName}${year}.pdf`;
    }
    return `DTR_Batch_${monthName}${year}.pdf`;
  };

  // Builds the plain-data payload sent to main.js for actual printing/PDF
  // generation — employee names and already-computed DTR rows, not "go
  // capture whatever's currently on screen". main.js hands this to a
  // hidden, dedicated print window (see PrintRenderWindow.jsx) that
  // renders it in isolation, so what gets printed is exactly this data
  // regardless of what's happening in this page's own DOM/preview state.
  const buildPrintPayload = () => ({
    employees: targetEmployees.map((emp) => {
      const devPin = emp.staffNoOnDev || emp.registryNumber;
      const familyStr = (emp.familyName || "").toUpperCase();
      const firstStr = (emp.firstName || "").toUpperCase();
      const middleStr = emp.middleInitial
        ? `${emp.middleInitial.toUpperCase()}.`
        : "";
      const employeeName = `${familyStr}, ${firstStr} ${middleStr}`.trim();
      // When blankDtr is on, pass an empty punch list so every row is blank
      const rows = buildMonthlyDTR(
        blankDtr ? [] : byPin[normalizePin(devPin)] || [],
        year,
        month,
      );
      return { registryNumber: emp.registryNumber, employeeName, rows };
    }),
    year,
    month,
  });

  const loadPrinters = async () => {
    try {
      const printerList = await window.dtrApi?.getPrinters?.();
      if (Array.isArray(printerList) && printerList.length > 0) {
        setPrinters(printerList);
        const def =
          printerList.find((p) => p.isDefault || p.status === "default") ||
          printerList[0];
        setSelectedPrinter(def?.name || "");
      } else {
        setPrinters([]);
        setSelectedPrinter("");
      }
    } catch (err) {
      console.error("Failed to load printers:", err);
      setPrinters([]);
    }
  };

  const handlePrint = async () => {
    setHasInteracted(true);
    setPreviewOpen(true);
    setPreviewError(null);
    setPrintSuccess(false);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setPreviewLoading(true);
    try {
      const [result] = await Promise.all([
        window.dtrApi?.generateDtrPdfPreview?.(buildPrintPayload()),
        loadPrinters(),
      ]);
      if (result?.success) {
        setPreviewBlobUrl(base64ToBlobUrl(result.data));
      } else {
        setPreviewError(result?.error || "Could not generate the PDF preview.");
      }
    } catch (err) {
      setPreviewError(err?.message || "Could not generate the PDF preview.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setPreviewOpen(false);
    setPreviewBlobUrl(null);
    setPreviewError(null);
    setPrintSuccess(false);
  };

  const handleSaveAsPdf = async () => {
    setSavingPdf(true);
    try {
      await window.dtrApi?.exportDtrPdf?.({
        ...buildPrintPayload(),
        suggestedName: buildSuggestedFileName(),
      });
    } catch (err) {
      setPreviewError(err?.message || "Could not save the PDF.");
    } finally {
      setSavingPdf(false);
    }
  };

  const handleOpenAndPrint = async () => {
    setOpeningExternal(true);
    setPreviewError(null);
    try {
      const result = await window.dtrApi?.openDtrPdfExternal?.({
        ...buildPrintPayload(),
        suggestedName: buildSuggestedFileName(),
      });
      if (!result?.success) {
        setPreviewError(
          result?.error || "Could not open the PDF for printing.",
        );
      }
    } catch (err) {
      setPreviewError(err?.message || "Could not open the PDF for printing.");
    } finally {
      setOpeningExternal(false);
    }
  };

  const handleDirectPrint = async () => {
    setPrinting(true);
    setPreviewError(null);
    setPrintSuccess(false);
    try {
      const result = await window.dtrApi?.printDtr?.(
        selectedPrinter,
        buildPrintPayload(),
      );
      if (result?.success) {
        setPrintSuccess(true);
      } else {
        setPreviewError(result?.error || "Print failed.");
      }
    } catch (err) {
      setPreviewError(err?.message || "Print failed.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="page print-dtr-page">
      {/* Self-contained Styles - Guarantees Immediate Load */}
      <style>{`
        .print-dtr-page {
          max-width: 1280px;
          margin: 0 auto;
          padding: 8px 12px;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .modern-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .modern-header h2 {
          font-size: 1.4rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }

        .modern-header .subtext {
          font-size: 0.85rem;
          color: #64748b;
          margin-top: 4px;
        }

        .btn-primary-modern {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background-color: #2563eb;
          color: #ffffff;
          font-weight: 600;
          font-size: 0.875rem;
          padding: 10px 18px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
          transition: all 0.2s ease;
        }

        .btn-primary-modern:hover:not(:disabled) {
          background-color: #1d4ed8;
          transform: translateY(-1px);
        }

        .btn-primary-modern:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .modern-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px 24px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
          margin-bottom: 24px;
        }

        .card-title-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .card-title-row h3 {
          font-size: 0.95rem;
          font-weight: 600;
          color: #0f172a;
          margin: 0;
        }

        .text-blue {
          color: #2563eb;
        }

        .controls-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 16px;
          align-items: end;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }

        .form-group-grow {
          grid-column: span 2;
        }

        .form-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.725rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #64748b;
        }

        .form-select,
        .form-input {
          height: 40px;
          padding: 0 12px;
          background-color: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 0.875rem;
          color: #0f172a;
          font-weight: 500;
          outline: none;
          transition: all 0.15s ease-in-out;
        }

        .form-select {
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 32px;
        }

        .form-select:hover,
        .form-input:hover {
          background-color: #ffffff;
          border-color: #94a3b8;
        }

        .form-select:focus,
        .form-input:focus {
          background-color: #ffffff;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }

        .preview-wrapper {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 24px;
        }

        .preview-badge-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }

        .preview-pager {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: auto;
        }

        .pager-arrow-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          color: #0f172a;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .pager-arrow-btn:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #94a3b8;
        }

        .pager-arrow-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .pager-count {
          font-size: 0.8rem;
          font-weight: 600;
          color: #475569;
          min-width: 48px;
          text-align: center;
        }

        .paper-elevation-card {
          background: #ffffff;
          padding: 16px;
          border-radius: 8px;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
          display: block;
          border: 1px solid #e2e8f0;
          /* Cap the on-screen preview to roughly the same width as ONE
             half of the printed page (see .cs48-double-page .cs48-card
             in csForm48.css, which renders two of these side by side per
             sheet). Without this the card has nothing constraining its
             width, so it stretches to fill the container and reads as
             much bigger/blurrier than what actually prints. */
          width: 100%;
          max-width: 460px;
          margin: 0 auto;
        }

        .badge-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.825rem;
          font-weight: 600;
          color: #0f172a;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }

        .subgroup-tag {
          font-size: 0.75rem;
          font-weight: 600;
          background-color: #e2e8f0;
          color: #475569;
          padding: 4px 10px;
          border-radius: 6px;
        }

        .btn-secondary-modern {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background-color: #ffffff;
          color: #0f172a;
          font-weight: 600;
          font-size: 0.875rem;
          padding: 10px 18px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-secondary-modern:hover:not(:disabled) {
          background-color: #f8fafc;
          border-color: #94a3b8;
        }

        .btn-secondary-modern:disabled,
        .btn-primary-modern:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pdf-preview-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 24px;
        }

        .pdf-preview-modal {
          background: #ffffff;
          border-radius: 12px;
          width: min(900px, 100%);
          height: min(85vh, 900px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
        }

        .pdf-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .pdf-preview-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          color: #0f172a;
        }

        .pdf-preview-close {
          background: transparent;
          border: none;
          cursor: pointer;
          color: #64748b;
          padding: 6px;
          border-radius: 6px;
          display: flex;
        }

        .pdf-preview-close:hover {
          background: #f1f5f9;
          color: #0f172a;
        }

        .pdf-preview-body {
          flex: 1;
          background: #f1f5f9;
          display: flex;
          align-items: stretch;
          justify-content: stretch;
          overflow: hidden;
        }

        .pdf-preview-frame {
          width: 100%;
          height: 100%;
          border: none;
        }

        .pdf-preview-status {
          margin: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          color: #64748b;
          text-align: center;
          padding: 24px;
        }

        .pdf-preview-error {
          color: #b91c1c;
        }

        .pdf-preview-success-banner {
          margin: 12px 20px 0;
          padding: 10px 14px;
          border-radius: 8px;
          background: #ecfdf5;
          color: #047857;
          font-size: 0.825rem;
          font-weight: 600;
          text-align: center;
        }

        .spin {
          animation: pdf-preview-spin 1s linear infinite;
        }

        @keyframes pdf-preview-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .pdf-preview-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 14px 20px;
          border-top: 1px solid #e2e8f0;
          flex-wrap: wrap;
        }

        .pdf-preview-hint {
          font-size: 0.75rem;
          color: #94a3b8;
          max-width: 300px;
        }

        .pdf-preview-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .printer-select {
          height: 40px;
          padding: 0 12px;
          background-color: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          font-size: 0.825rem;
          color: #0f172a;
          font-weight: 500;
          outline: none;
          cursor: pointer;
          max-width: 220px;
        }

        .printer-select:focus {
          background-color: #ffffff;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
        }

        .empty-state {
          text-align: center;
          padding: 48px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }

        /* ---------- Blank DTR Toggle ---------- */
        .blank-dtr-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 40px;
          padding: 0 12px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.85rem;
          font-weight: 600;
          color: #475569;
          width: 100%;
          box-sizing: border-box;
        }

        .blank-dtr-toggle:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }

        .blank-dtr-toggle--on {
          background: #fff7ed;
          border-color: #fb923c;
          color: #c2410c;
        }

        .blank-dtr-toggle--on:hover {
          background: #ffedd5;
        }

        .blank-dtr-toggle__track {
          width: 32px;
          height: 18px;
          background: #cbd5e1;
          border-radius: 999px;
          position: relative;
          transition: background 0.2s ease;
          flex-shrink: 0;
        }

        .blank-dtr-toggle--on .blank-dtr-toggle__track {
          background: #f97316;
        }

        .blank-dtr-toggle__thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          transition: transform 0.2s ease;
        }

        .blank-dtr-toggle--on .blank-dtr-toggle__thumb {
          transform: translateX(14px);
        }

        .blank-dtr-toggle__label {
          flex: 1;
          text-align: left;
        }
      `}</style>

      {/* Controls Section */}
      <div>
        <div className="modern-header">
          <div>
            <h2>Print DTR (CS Form 48)</h2>
            <p className="subtext">
              Configure parameters, view previews, and print official employee
              logs
            </p>
          </div>
          <button
            onClick={handlePrint}
            className="btn-primary-modern"
            disabled={targetEmployees.length === 0}
          >
            <Printer size={18} /> Preview & Print ({targetEmployees.length})
          </button>
        </div>

        <section className="modern-card">
          <div className="card-title-row">
            <Filter size={18} className="text-blue" />
            <h3>Print Selection Controls</h3>
          </div>

          <div className="controls-grid">
            {/* 1st Dropdown: Category */}
            <div className="form-group">
              <label className="form-label">
                <Users size={14} /> Group Selection
              </label>
              <select
                className="form-select"
                value={category}
                onChange={handleCategoryChange}
              >
                <option value="all">ALL</option>
                <option value="teaching">Teaching</option>
                <option value="non-teaching">Non-Teaching</option>
              </select>
            </div>

            {/* 2nd Dropdown: Teaching Grade Levels */}
            {category === "teaching" && (
              <div className="form-group">
                <label className="form-label">
                  <Layers size={14} /> Grade Levels
                </label>
                <select
                  className="form-select"
                  value={subCategory}
                  onChange={handleSubCategoryChange}
                >
                  <option value="all">ALL</option>
                  {teachingSubgroupOptions.map((sg) => (
                    <option key={sg} value={sg}>
                      {sg}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 2nd Dropdown: Non-Teaching Categories */}
            {category === "non-teaching" && (
              <div className="form-group">
                <label className="form-label">
                  <Layers size={14} /> Category
                </label>
                <select
                  className="form-select"
                  value={subCategory}
                  onChange={handleSubCategoryChange}
                >
                  <option value="all">ALL</option>
                  {nonTeachingSubgroupOptions.map((sg) => (
                    <option key={sg} value={sg}>
                      {sg}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 3rd Dropdown: Select Employee — only shown once the user has
                fully narrowed down: a category AND its subcategory
                (Grade Level / Admin-Job Order) both chosen, not left on
                "ALL". Before that, the list would just be the mixed,
                unfiltered roster, which isn't a useful picker yet. */}
            {subCategory !== "all" && (
              <div className="form-group form-group-grow">
                <label className="form-label">
                  <User size={14} /> Select Employee
                </label>
                <select
                  className="form-select"
                  value={selectedEmployeeReg}
                  onChange={(e) => {
                    setHasInteracted(true);
                    setSelectedEmployeeReg(e.target.value);
                  }}
                >
                  <option value="all">ALL</option>
                  {categoryEmployees.map((e) => (
                    <option
                      key={e.registryNumber || Math.random()}
                      value={e.registryNumber || ""}
                    >
                      {(e.familyName || "Unnamed").toUpperCase()},{" "}
                      {(e.firstName || "Employee").toUpperCase()}{" "}
                      {e.middleInitial
                        ? `${e.middleInitial.toUpperCase()}. `
                        : ""}
                      ({e.subGroup || "N/A"})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Month & Year Selectors */}
            <div className="form-group">
              <label className="form-label">
                <Calendar size={14} /> Month
              </label>
              <select
                className="form-select"
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i, 1).toLocaleString("en-US", {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ maxWidth: "110px" }}>
              <label className="form-label">Year</label>
              <input
                className="form-input"
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </div>

            {/* Blank DTR Toggle */}
            <div className="form-group" style={{ justifyContent: "flex-end" }}>
              <label className="form-label">
                <FileX size={14} /> Print Mode
              </label>
              <button
                type="button"
                onClick={() => setBlankDtr((v) => !v)}
                className={`blank-dtr-toggle${blankDtr ? " blank-dtr-toggle--on" : ""}`}
                title={
                  blankDtr
                    ? "Blank DTR mode is ON — no time logs will be printed"
                    : "Click to print blank DTR forms with no time logs"
                }
              >
                <span className="blank-dtr-toggle__track">
                  <span className="blank-dtr-toggle__thumb" />
                </span>
                <span className="blank-dtr-toggle__label">
                  {blankDtr ? "Blank DTR" : "With Logs"}
                </span>
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Screen Preview & Print Container */}
      <div className="cs48-print-container">
        {/* Screen-only guidance messages — purely UX, no longer need to
            worry about gating anything printToPDF() depends on, since
            actual printing happens in the separate PrintRenderWindow. */}
        {!hasInteracted && (
          <div className="modern-card no-print empty-state">
            <Filter size={36} className="text-muted" />
            <p className="hint">
              Choose a group, employee, or category above to load a preview.
            </p>
          </div>
        )}
        {hasInteracted && targetEmployees.length === 0 && (
          <div className="modern-card no-print empty-state">
            <Eye size={36} className="text-muted" />
            <p className="hint">
              No employees match your selected filter criteria.
            </p>
          </div>
        )}

        {hasInteracted &&
          activePreviewEmployee &&
          (() => {
            const emp = activePreviewEmployee;
            const devPin = emp.staffNoOnDev || emp.registryNumber;

            const familyStr = (emp.familyName || "").toUpperCase();
            const firstStr = (emp.firstName || "").toUpperCase();
            const middleStr = emp.middleInitial
              ? `${emp.middleInitial.toUpperCase()}.`
              : "";
            const empName = `${familyStr}, ${firstStr} ${middleStr}`.trim();

            const rows = buildMonthlyDTR(
              blankDtr ? [] : byPin[normalizePin(devPin)] || [],
              year,
              month,
            );

            return (
              <div
                key={emp.registryNumber || "preview"}
                className="cs48-employee-block"
              >
                {/* Screen View — purely a UX preview, one employee at a time.
                  Actual printing happens in a separate hidden window (see
                  PrintRenderWindow.jsx), which gets sent the FULL
                  targetEmployees batch via IPC regardless of which single
                  employee is currently shown here, so what gets printed
                  doesn't depend on this pagination state at all. */}
                <div className="preview-wrapper">
                  <div className="preview-badge-header">
                    {selectedEmployeeReg !== "all" && (
                      <span className="badge-pill">
                        <User size={13} /> {empName || "NO NAME"}
                      </span>
                    )}
                    <span className="subgroup-tag">
                      {emp.subGroup || "N/A"}
                    </span>

                    {targetEmployees.length > 1 && (
                      <div className="preview-pager">
                        <button
                          type="button"
                          className="pager-arrow-btn"
                          onClick={goToPreviousEmployee}
                          disabled={clampedPreviewIndex === 0}
                          aria-label="Previous employee"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="pager-count">
                          {clampedPreviewIndex + 1} / {targetEmployees.length}
                        </span>
                        <button
                          type="button"
                          className="pager-arrow-btn"
                          onClick={goToNextEmployee}
                          disabled={
                            clampedPreviewIndex === targetEmployees.length - 1
                          }
                          aria-label="Next employee"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="paper-elevation-card">
                    <CSForm48View
                      employeeName={empName}
                      year={year}
                      month={month}
                      rows={rows}
                      isPrintMode={false}
                    />
                  </div>
                </div>
              </div>
            );
          })()}
      </div>

      {/* PDF Preview Modal */}
      {previewOpen && (
        <div className="no-print pdf-preview-overlay" onClick={closePreview}>
          <div
            className="pdf-preview-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pdf-preview-header">
              <h3>DTR Print Preview</h3>
              <button
                className="pdf-preview-close"
                onClick={closePreview}
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
            </div>

            <div className="pdf-preview-body">
              {previewLoading && (
                <div className="pdf-preview-status">
                  <Loader2 size={28} className="spin" />
                  <p>Generating PDF preview…</p>
                </div>
              )}

              {!previewLoading && previewError && (
                <div className="pdf-preview-status pdf-preview-error">
                  <AlertTriangle size={28} />
                  <p>{previewError}</p>
                  <button
                    className="btn-secondary-modern"
                    onClick={handlePrint}
                  >
                    Try Again
                  </button>
                </div>
              )}

              {!previewLoading && !previewError && previewBlobUrl && (
                <iframe
                  title="DTR PDF Preview"
                  className="pdf-preview-frame"
                  src={previewBlobUrl}
                />
              )}
            </div>

            {printSuccess && (
              <div className="pdf-preview-success-banner">
                Sent to {selectedPrinter || "the selected printer"}.
              </div>
            )}

            <div className="pdf-preview-footer">
              <span className="pdf-preview-hint">
                Pick a printer and hit Print to print directly, or use Save as
                PDF / Open Externally for full OS print-preview controls.
              </span>
              <div className="pdf-preview-actions">
                {printers.length > 0 && (
                  <select
                    className="printer-select"
                    value={selectedPrinter}
                    onChange={(e) => setSelectedPrinter(e.target.value)}
                    disabled={previewLoading || printing}
                    aria-label="Select printer"
                  >
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName || p.name}
                        {p.isDefault ? " (Default)" : ""}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="btn-secondary-modern"
                  onClick={handleSaveAsPdf}
                  disabled={previewLoading || !!previewError || savingPdf}
                >
                  <Download size={16} /> {savingPdf ? "Saving…" : "Save as PDF"}
                </button>
                <button
                  className="btn-secondary-modern"
                  onClick={handleOpenAndPrint}
                  disabled={previewLoading || !!previewError || openingExternal}
                >
                  <ExternalLink size={16} />{" "}
                  {openingExternal ? "Opening…" : "Open Externally"}
                </button>
                <button
                  className="btn-primary-modern"
                  onClick={handleDirectPrint}
                  disabled={
                    previewLoading ||
                    !!previewError ||
                    printing ||
                    printers.length === 0
                  }
                >
                  <Printer size={16} /> {printing ? "Printing…" : "Print"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
