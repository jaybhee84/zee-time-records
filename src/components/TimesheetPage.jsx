import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Filter,
  Users,
  Layers,
  User,
  Calendar,
  Save,
  RefreshCw,
  Wifi,
  WifiOff,
  Lock,
  Unlock,
  X,
} from "lucide-react";
import {
  groupByPin,
  buildMonthlyDTR,
  normalizePin,
} from "../utils/dtrCalculator.js";

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

const STATIC_PH_HOLIDAYS = [
  { month: 1, day: 1, name: "New Year's Day", type: "Legal Holiday" },
  {
    month: 1,
    day: 2,
    name: "Special Non-Working Day",
    type: "Special Holiday",
  },
  {
    month: 2,
    day: 25,
    name: "EDSA Revolution Anniversary",
    type: "Special Holiday",
  },
  { month: 4, day: 9, name: "Araw ng Kagitingan", type: "Legal Holiday" },
  { month: 5, day: 1, name: "Labor Day", type: "Legal Holiday" },
  { month: 6, day: 12, name: "Independence Day", type: "Legal Holiday" },
  { month: 8, day: 21, name: "Ninoy Aquino Day", type: "Special Holiday" },
  { month: 11, day: 1, name: "All Saints' Day", type: "Special Holiday" },
  { month: 11, day: 2, name: "All Souls' Day", type: "Special Holiday" },
  { month: 11, day: 30, name: "Bonifacio Day", type: "Legal Holiday" },
  {
    month: 12,
    day: 8,
    name: "Feast of Immaculate Conception",
    type: "Special Holiday",
  },
  { month: 12, day: 24, name: "Christmas Eve", type: "Special Holiday" },
  { month: 12, day: 25, name: "Christmas Day", type: "Legal Holiday" },
  { month: 12, day: 30, name: "Rizal Day", type: "Legal Holiday" },
  { month: 12, day: 31, name: "Last Day of the Year", type: "Special Holiday" },
];

const format12HourWithAmPm = (input = "", field = "") => {
  if (!input) return "";

  const clean = input.trim().toUpperCase();

  let forcedMeridiem = null;
  if (clean.includes("A") || clean.endsWith("AM")) forcedMeridiem = "AM";
  if (clean.includes("P") || clean.endsWith("PM")) forcedMeridiem = "PM";

  const digits = clean.replace(/\D/g, "");
  if (!digits) return forcedMeridiem || "";

  let h = 0;
  let m = "";

  if (digits.length === 1) {
    h = parseInt(digits, 10);
  } else if (digits.length === 2) {
    let val = parseInt(digits, 10);
    if (val >= 1 && val <= 12) {
      h = val;
    } else if (val >= 13 && val <= 23) {
      h = val - 12;
      if (!forcedMeridiem) forcedMeridiem = "PM";
    } else {
      h = parseInt(digits[0], 10);
      m = digits[1];
    }
  } else if (digits.length === 3) {
    h = parseInt(digits[0], 10);
    m = digits.substring(1, 3);
  } else {
    let valH = parseInt(digits.substring(0, 2), 10);
    if (valH >= 13 && valH <= 23) {
      h = valH - 12;
      if (!forcedMeridiem) forcedMeridiem = "PM";
    } else {
      h = valH > 12 ? valH % 12 || 12 : valH;
    }
    m = digits.substring(2, 4);
  }

  if (h === 0) h = 12;
  if (h > 12) h = 12;

  if (m) {
    let mNum = parseInt(m, 10);
    if (mNum > 59) m = "59";
  }

  let meridiem = forcedMeridiem;
  if (!meridiem) {
    if (field === "amOut" && h === 12) {
      meridiem = "PM";
    } else if (field.startsWith("am")) {
      meridiem = "AM";
    } else if (field.startsWith("pm")) {
      meridiem = "PM";
    } else {
      meridiem = "AM";
    }
  }

  if (!m && !clean.includes(":")) {
    return `${h} ${meridiem}`;
  }

  const formattedM = m.length === 1 ? `0${m}` : m.length === 2 ? m : "00";
  return `${h}:${formattedM} ${meridiem}`;
};

const to24HourTime = (formatted = "") => {
  const match = formatted.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = match[2] || "00";
  const meridiem = match[3].toUpperCase();

  if (meridiem === "AM") {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }

  return `${String(h).padStart(2, "0")}:${m}:00`;
};

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

export default function TimesheetPage({ onClose }) {
  const [employees, setEmployees] = useState([]);
  const [punches, setPunches] = useState([]);

  const [category, setCategory] = useState("all");
  const [subCategory, setSubCategory] = useState("all");
  const [selectedEmployeeReg, setSelectedEmployeeReg] = useState("all");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [modifiedRows, setModifiedRows] = useState({});
  const [unlockedDays, setUnlockedDays] = useState({});
  const [officialTime, setOfficialTime] = useState({});
  const [saveMessage, setSaveMessage] = useState(null);

  const [holidays, setHolidays] = useState({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = setTimeout(() => setSaveMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [saveMessage]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadHolidays() {
      const holidayMap = {};

      STATIC_PH_HOLIDAYS.forEach((h) => {
        const dateKey = `${year}-${String(h.month).padStart(2, "0")}-${String(
          h.day,
        ).padStart(2, "0")}`;
        holidayMap[dateKey] = { name: h.name, type: h.type };
      });

      if (navigator.onLine) {
        try {
          const res = await fetch(
            `https://date.nager.at/api/v3/PublicHolidays/${year}/PH`,
          );
          if (res.ok) {
            const apiHolidays = await res.json();
            apiHolidays.forEach((item) => {
              let holidayName = item.name || item.localName;

              if (
                item.date.endsWith("-04-09") ||
                holidayName.toLowerCase().includes("valor")
              ) {
                holidayName = "Araw ng Kagitingan";
              }

              holidayMap[item.date] = {
                name: holidayName,
                type: item.types?.includes("Public")
                  ? "Legal Holiday"
                  : "Special Holiday",
              };
            });
          }
        } catch (err) {
          console.warn("Online holiday fetch failed.", err);
        }
      }

      if (isMounted) {
        setHolidays(holidayMap);
      }
    }

    loadHolidays();
    return () => {
      isMounted = false;
    };
  }, [year]);

  useEffect(() => {
    if (window.dtrApi) {
      window.dtrApi
        .loadEmployees()
        .then((data) => setEmployees(data || []))
        .catch((err) => console.error("Failed to load local employees:", err));

      window.dtrApi
        .getOfficialTime()
        .then((data) => setOfficialTime(data || {}))
        .catch((err) =>
          console.error("Failed to load Official Time settings:", err),
        );
    }
  }, []);

  const loadPunches = useCallback(() => {
    if (window.dtrApi) {
      window.dtrApi
        .getPunches({ year, month })
        .then((data) => setPunches(data || []))
        .catch((err) => console.error("Failed to load local punches:", err));
    }
  }, [year, month]);

  useEffect(() => {
    loadPunches();
  }, [loadPunches]);

  const byPin = useMemo(() => groupByPin(punches), [punches]);

  const handleCategoryChange = (e) => {
    setCategory(e.target.value);
    setSubCategory("all");
    setSelectedEmployeeReg("all");
    setUnlockedDays({});
  };

  const handleSubCategoryChange = (e) => {
    setSubCategory(e.target.value);
    setSelectedEmployeeReg("all");
    setUnlockedDays({});
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
          )
            return true;
          if (
            normSubCat.startsWith("subject teacher") &&
            normSg.startsWith("subject teacher")
          )
            return true;
          if (
            normSubCat.startsWith("substitute teacher") &&
            normSg.startsWith("substitute teacher")
          )
            return true;
          return normSg === normSubCat;
        }
        return true;
      }

      if (category === "non-teaching") {
        if (!isNonTeachingSubgroup(sg)) return false;
        if (subCategory !== "all")
          return sg.trim().toLowerCase() === subCategory.trim().toLowerCase();
        return true;
      }

      return true;
    });
  }, [employees, category, subCategory]);

  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeReg || selectedEmployeeReg === "all") return null;
    return (
      categoryEmployees.find(
        (e) => e?.registryNumber === selectedEmployeeReg,
      ) || null
    );
  }, [categoryEmployees, selectedEmployeeReg]);

  const devPin = selectedEmployee
    ? selectedEmployee.staffNoOnDev || selectedEmployee.registryNumber
    : null;
  const empName = selectedEmployee
    ? `${(selectedEmployee.familyName || "").toUpperCase()}, ${(
        selectedEmployee.firstName || ""
      ).toUpperCase()} ${
        selectedEmployee.middleInitial
          ? `${selectedEmployee.middleInitial.toUpperCase()}.`
          : ""
      }`.trim()
    : null;

  const selectedSchedule = useMemo(() => {
    if (!selectedEmployee) return null;
    const sg = selectedEmployee.subGroup || "";
    if (isTeachingSubgroup(sg)) return officialTime.teaching || null;
    if (isNonTeachingSubgroup(sg)) return officialTime.nonTeaching || null;
    return null;
  }, [selectedEmployee, officialTime]);

  const baseRows = useMemo(() => {
    if (!devPin) return [];
    return buildMonthlyDTR(
      byPin[normalizePin(devPin)] || [],
      year,
      month,
      12,
      selectedSchedule,
    );
  }, [devPin, byPin, year, month, selectedSchedule]);

  const daysInMonth = useMemo(
    () => new Date(year, month, 0).getDate(),
    [year, month],
  );

  const handleCellChange = (dayNum, field, value) => {
    if (!devPin) return;

    setModifiedRows((prev) => ({
      ...prev,
      [dayNum]: {
        ...(prev[dayNum] || {}),
        [field]: value,
      },
    }));
  };

  const handleCellBlur = (dayNum, field) => {
    if (!devPin) return;

    const isTimeField = ["amIn", "amOut", "pmIn", "pmOut"].includes(field);
    if (!isTimeField) return;

    setModifiedRows((prev) => {
      const currentVal = prev[dayNum]?.[field];
      if (currentVal === undefined || currentVal === "") return prev;

      return {
        ...prev,
        [dayNum]: {
          ...(prev[dayNum] || {}),
          [field]: format12HourWithAmPm(currentVal, field),
        },
      };
    });
  };

  const handleReset = () => {
    setModifiedRows({});
    setUnlockedDays({});
  };

  const handleWeekendClick = (e, dayNum, isWeekend) => {
    if (e.target.tagName === "INPUT" || e.target.closest("input")) {
      return;
    }

    if (!selectedEmployee || !isWeekend) return;

    setUnlockedDays((prev) => ({
      ...prev,
      [dayNum]: !prev[dayNum],
    }));
  };

  const getDayInfo = useCallback(
    (dayNum) => {
      const dateObj = new Date(year, month - 1, dayNum);
      const dayOfWeek = dateObj.getDay();
      const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(
        dayNum,
      ).padStart(2, "0")}`;

      const isSaturday = dayOfWeek === 6;
      const isSunday = dayOfWeek === 0;
      const dayName = dateObj.toLocaleDateString("en-US", {
        weekday: "short",
      });

      const holiday = holidays[dateKey];

      return {
        dayName,
        isSaturday,
        isSunday,
        isWeekend: isSaturday || isSunday,
        holiday,
      };
    },
    [year, month, holidays],
  );

  const handleSave = async () => {
    if (!selectedEmployee || !devPin) {
      setSaveMessage({
        type: "error",
        text: "Please select a specific employee to save changes.",
      });
      return;
    }

    // Collect EXACTLY up to 4 punches per day from the UI state
    const newPunches = [];
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const baseDay = baseRows.find((r) => r.day === dayNum) || {};
      const customDay = modifiedRows[dayNum] || {};

      const mergedDay = {
        amIn:
          customDay.amIn !== undefined
            ? customDay.amIn
            : baseDay.amArrival || "",
        amOut:
          customDay.amOut !== undefined
            ? customDay.amOut
            : baseDay.amDeparture || "",
        pmIn:
          customDay.pmIn !== undefined
            ? customDay.pmIn
            : baseDay.pmArrival || "",
        pmOut:
          customDay.pmOut !== undefined
            ? customDay.pmOut
            : baseDay.pmDeparture || "",
      };

      // Exactly 4 slots: AM Arrival (0), AM Departure (1), PM Arrival (0), PM Departure (0)
      const slots = [
        { field: "amIn", value: mergedDay.amIn, status: "0" },
        { field: "amOut", value: mergedDay.amOut, status: "1" },
        { field: "pmIn", value: mergedDay.pmIn, status: "0" },
        { field: "pmOut", value: mergedDay.pmOut, status: "0" },
      ];

      slots.forEach(({ field, value: rawVal, status }) => {
        if (rawVal && rawVal.trim() !== "") {
          const formatted = format12HourWithAmPm(rawVal, field);
          const time24 = to24HourTime(formatted);
          if (!time24) return;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
            dayNum,
          ).padStart(2, "0")} ${time24}`;

          newPunches.push({
            pin: devPin,
            staffNoOnDev: devPin,
            timestamp: dateStr,
            rawTime: formatted,
            status: status,
            verifyType: "1",
            workCode: "0",
            reserved: "0",
          });
        }
      });
    }

    try {
      if (window.dtrApi) {
        // Backend handle handles overwriting all old logs for the employee/month
        await window.dtrApi.savePunches({
          pin: devPin,
          year,
          month,
          newPunches,
        });
        setSaveMessage({
          type: "success",
          text: "Official 4-punch timesheet saved to database! Extra punches removed.",
        });
        setModifiedRows({});
        loadPunches();
      }
    } catch (err) {
      console.error("Save error:", err);
      setSaveMessage({
        type: "error",
        text: "Failed to save changes to database.",
      });
    }
  };

  const handleClose = () => {
    if (typeof onClose === "function") {
      onClose();
    } else if (window.history && window.history.length > 1) {
      window.history.back();
    }
  };

  return (
    <div className="page timesheet-page">
      <style>{`
        .timesheet-page { max-width: 1280px; margin: 0 auto; padding: 8px 12px; font-family: system-ui, -apple-system, sans-serif; }
        .modern-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .modern-header h2 { font-size: 1.4rem; font-weight: 700; color: #0f172a; margin: 0; }
        .modern-header .subtext { font-size: 0.85rem; color: #64748b; margin-top: 4px; }
        .action-buttons { display: flex; gap: 10px; align-items: center; }
        .btn-primary-modern { display: inline-flex; align-items: center; gap: 8px; background-color: #2563eb; color: #ffffff; font-weight: 600; font-size: 0.875rem; padding: 10px 18px; border-radius: 8px; border: none; cursor: pointer; pointer-events: auto !important; }
        .btn-primary-modern:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary-modern { display: inline-flex; align-items: center; gap: 8px; background-color: #f1f5f9; color: #334155; font-weight: 600; font-size: 0.875rem; padding: 10px 18px; border-radius: 8px; border: 1px solid #cbd5e1; cursor: pointer; pointer-events: auto !important; }
        .btn-close-modern { display: inline-flex; align-items: center; gap: 8px; background-color: #fff1f2; color: #be123c; font-weight: 600; font-size: 0.875rem; padding: 10px 18px; border-radius: 8px; border: 1px solid #fecdd3; cursor: pointer; pointer-events: auto !important; }
        .btn-close-modern:hover { background-color: #ffe4e6; }
        .ts-save-banner { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; margin-bottom: 12px; }
        .ts-save-banner.success { background-color: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
        .ts-save-banner.error { background-color: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
        .modern-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04); margin-bottom: 24px; }
        .card-title-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .card-title-row h3 { font-size: 0.95rem; font-weight: 600; color: #0f172a; margin: 0; display: flex; align-items: center; gap: 8px; }
        .text-blue { color: #2563eb; }
        .controls-grid { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; }
        .form-group { display: flex; flex-direction: column; gap: 6px; min-width: 160px; }
        .form-group-grow { flex-grow: 1; min-width: 240px; }
        .form-label { display: flex; align-items: center; gap: 6px; font-size: 0.725rem; font-weight: 700; text-transform: uppercase; color: #64748b; }
        .form-select, .form-input { height: 40px; padding: 0 12px; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.875rem; color: #0f172a; outline: none; pointer-events: auto !important; }
        .ts-employee-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px; }
        .ts-emp-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
        .ts-emp-name { font-size: 1.1rem; font-weight: 700; color: #0f172a; }
        .ts-emp-placeholder { font-size: 0.9rem; color: #64748b; font-style: italic; }
        .ts-emp-badge { background-color: #e2e8f0; color: #475569; font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 6px; }
        
        .dtr-grid-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .dtr-grid-table th, .dtr-grid-table td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: center; }
        .dtr-grid-table th { background-color: #f8fafc; color: #334155; font-weight: 700; font-size: 0.75rem; text-transform: uppercase; }
        
        .dtr-grid-input { width: 100%; border: 1px solid transparent; background: transparent; text-align: center; font-size: 0.85rem; font-family: monospace, monospace; font-weight: 600; padding: 4px 0; color: #0f172a; letter-spacing: 0.5px; pointer-events: auto !important; user-select: text; }
        .dtr-grid-input:focus { background-color: #eff6ff; border-color: #2563eb; outline: none; border-radius: 4px; }
        .dtr-grid-input:disabled { background-color: transparent; cursor: not-allowed; opacity: 0.75; }

        .row-sat { background-color: #f8fafc; }
        .row-sun { background-color: #fef2f2; }
        .row-holiday { background-color: #fffbeb; }
        .row-weekend-clickable { cursor: pointer; transition: background-color 0.15s ease; }
        .row-weekend-clickable:hover { background-color: #f1f5f9; }
        .row-unlocked { background-color: #f0fdf4 !important; }

        .day-cell { display: flex; align-items: center; justify-content: space-between; gap: 4px; padding: 0 4px; font-weight: 600; }
        .badge-sat { background-color: #cbd5e1; color: #334155; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; display: inline-flex; align-items: center; gap: 3px; cursor: pointer; }
        .badge-sun { background-color: #fca5a5; color: #7f1d1d; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; display: inline-flex; align-items: center; gap: 3px; cursor: pointer; }
        .badge-unlocked { background-color: #86efac !important; color: #14532d !important; }
        .badge-holiday { background-color: #fde047; color: #713f12; font-size: 0.65rem; font-weight: 700; padding: 1px 6px; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }

        .net-status { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; font-weight: 600; padding: 4px 10px; border-radius: 20px; }
        .net-online { background-color: #dcfce7; color: #166534; }
        .net-offline { background-color: #fee2e2; color: #991b1b; }
      `}</style>

      {/* Header */}
      <div className="modern-header">
        <div>
          <h2>Timesheet Management</h2>
          <p className="subtext">
            Desktop Local Timesheet Data Editor (Click weekend rows to enable
            time entry)
          </p>
        </div>
        <div className="action-buttons">
          <div
            className={`net-status ${isOnline ? "net-online" : "net-offline"}`}
          >
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            {isOnline
              ? "Online (PH Holiday API Active)"
              : "Offline (Standard PH Rules)"}
          </div>
          <button
            className="btn-secondary-modern"
            onClick={handleReset}
            disabled={!selectedEmployee}
          >
            <RefreshCw size={16} /> Reset
          </button>
          <button
            className="btn-primary-modern"
            onClick={handleSave}
            disabled={!selectedEmployee}
          >
            <Save size={16} /> Save Changes
          </button>
          <button className="btn-close-modern" onClick={handleClose}>
            <X size={16} /> Close
          </button>
        </div>
      </div>

      {saveMessage && (
        <div className={`ts-save-banner ${saveMessage.type}`} role="status">
          {saveMessage.text}
        </div>
      )}

      {/* Filter Controls */}
      <section className="modern-card">
        <div className="card-title-row">
          <h3>
            <Filter size={18} className="text-blue" />
            Timesheet Selection Controls
          </h3>
        </div>

        <div className="controls-grid">
          <div className="form-group">
            <label className="form-label">
              <Users size={14} /> Group Selection
            </label>
            <select
              className="form-select"
              value={category}
              onChange={handleCategoryChange}
            >
              <option value="all">ALL Employees</option>
              <option value="teaching">Teaching</option>
              <option value="non-teaching">Non-Teaching</option>
            </select>
          </div>

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
                <option value="all">All Teaching</option>
                {TEACHING_SUBGROUPS.map((sg) => (
                  <option key={sg} value={sg}>
                    {sg}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                <option value="all">All Non-Teaching</option>
                {NON_TEACHING_SUBGROUPS.map((sg) => (
                  <option key={sg} value={sg}>
                    {sg}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group form-group-grow">
            <label className="form-label">
              <User size={14} /> Select Employee
            </label>
            <select
              className="form-select"
              value={selectedEmployeeReg}
              onChange={(e) => {
                setSelectedEmployeeReg(e.target.value);
                setModifiedRows({});
                setUnlockedDays({});
              }}
            >
              <option value="all">ALL Employees</option>
              {categoryEmployees.map((e) => (
                <option
                  key={e.registryNumber || Math.random()}
                  value={e.registryNumber || ""}
                >
                  {(e.familyName || "Unnamed").toUpperCase()},{" "}
                  {(e.firstName || "Employee").toUpperCase()} (
                  {e.subGroup || "N/A"})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">
              <Calendar size={14} /> Month
            </label>
            <select
              className="form-select"
              value={month}
              onChange={(e) => {
                setMonth(Number(e.target.value));
                setUnlockedDays({});
              }}
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
              onChange={(e) => {
                setYear(Number(e.target.value));
                setUnlockedDays({});
              }}
            />
          </div>
        </div>
      </section>

      {/* DTR Grid Table */}
      <div className="ts-container">
        <div className="ts-employee-card">
          <div className="ts-emp-header">
            {selectedEmployee ? (
              <>
                <span className="ts-emp-name">{empName}</span>
                <span className="ts-emp-badge">
                  {selectedEmployee.subGroup || "N/A"}
                </span>
              </>
            ) : (
              <span className="ts-emp-placeholder">
                Select a specific employee in the dropdown above to view or edit
                logs
              </span>
            )}
          </div>

          <table className="dtr-grid-table">
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: "160px" }}>
                  Day
                </th>
                <th colSpan={2}>A.M.</th>
                <th colSpan={2}>P.M.</th>
                <th colSpan={2}>Undertime</th>
              </tr>
              <tr>
                <th>Arrival</th>
                <th>Departure</th>
                <th>Arrival</th>
                <th>Departure</th>
                <th style={{ width: "70px" }}>Hours</th>
                <th style={{ width: "70px" }}>Minutes</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: daysInMonth }, (_, index) => {
                const dayNum = index + 1;
                const { dayName, isSaturday, isSunday, isWeekend, holiday } =
                  getDayInfo(dayNum);

                const isUnlocked = unlockedDays[dayNum];
                const isEditable =
                  selectedEmployee && (!isWeekend || isUnlocked);

                let amIn = "",
                  amOut = "",
                  pmIn = "",
                  pmOut = "",
                  undertimeHours = "",
                  undertimeMinutes = "";

                if (selectedEmployee && devPin) {
                  const baseDay = baseRows.find((r) => r.day === dayNum) || {};
                  const dayEdit = modifiedRows[dayNum] || {};

                  amIn =
                    dayEdit.amIn !== undefined
                      ? dayEdit.amIn
                      : baseDay.amArrival || "";
                  amOut =
                    dayEdit.amOut !== undefined
                      ? dayEdit.amOut
                      : baseDay.amDeparture || "";
                  pmIn =
                    dayEdit.pmIn !== undefined
                      ? dayEdit.pmIn
                      : baseDay.pmArrival || "";
                  pmOut =
                    dayEdit.pmOut !== undefined
                      ? dayEdit.pmOut
                      : baseDay.pmDeparture || "";
                  undertimeHours =
                    dayEdit.undertimeHours !== undefined
                      ? dayEdit.undertimeHours
                      : baseDay.undertimeHours || "";
                  undertimeMinutes =
                    dayEdit.undertimeMinutes !== undefined
                      ? dayEdit.undertimeMinutes
                      : baseDay.undertimeMinutes || "";
                }

                let rowClass = "";
                if (holiday) {
                  rowClass = "row-holiday";
                } else if (isSunday) {
                  rowClass = "row-sun";
                } else if (isSaturday) {
                  rowClass = "row-sat";
                }

                if (isWeekend) {
                  rowClass += " row-weekend-clickable";
                }
                if (isUnlocked) {
                  rowClass += " row-unlocked";
                }

                const getPlaceholder = () => {
                  return isWeekend && !isUnlocked ? "Click row to edit" : "";
                };

                return (
                  <tr
                    key={dayNum}
                    className={rowClass}
                    onClick={(e) => handleWeekendClick(e, dayNum, isWeekend)}
                    title={
                      isWeekend && !isUnlocked
                        ? "Click row to edit time logs for this weekend day"
                        : ""
                    }
                  >
                    <td style={{ backgroundColor: "inherit" }}>
                      <div className="day-cell">
                        <span>
                          {dayNum} ({dayName})
                        </span>
                        {holiday && (
                          <span className="badge-holiday" title={holiday.name}>
                            {holiday.name}
                          </span>
                        )}
                        {!holiday && isSaturday && (
                          <span
                            className={`badge-sat ${
                              isUnlocked ? "badge-unlocked" : ""
                            }`}
                          >
                            {isUnlocked ? (
                              <Unlock size={10} />
                            ) : (
                              <Lock size={10} />
                            )}
                            {isUnlocked ? "SAT (ACTIVE)" : "SAT"}
                          </span>
                        )}
                        {!holiday && isSunday && (
                          <span
                            className={`badge-sun ${
                              isUnlocked ? "badge-unlocked" : ""
                            }`}
                          >
                            {isUnlocked ? (
                              <Unlock size={10} />
                            ) : (
                              <Lock size={10} />
                            )}
                            {isUnlocked ? "SUN (ACTIVE)" : "SUN"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        className="dtr-grid-input"
                        type="text"
                        maxLength={8}
                        placeholder={getPlaceholder()}
                        disabled={!isEditable}
                        value={amIn}
                        onChange={(e) =>
                          handleCellChange(dayNum, "amIn", e.target.value)
                        }
                        onBlur={() => handleCellBlur(dayNum, "amIn")}
                      />
                    </td>
                    <td>
                      <input
                        className="dtr-grid-input"
                        type="text"
                        maxLength={8}
                        placeholder={getPlaceholder()}
                        disabled={!isEditable}
                        value={amOut}
                        onChange={(e) =>
                          handleCellChange(dayNum, "amOut", e.target.value)
                        }
                        onBlur={() => handleCellBlur(dayNum, "amOut")}
                      />
                    </td>
                    <td>
                      <input
                        className="dtr-grid-input"
                        type="text"
                        maxLength={8}
                        placeholder={getPlaceholder()}
                        disabled={!isEditable}
                        value={pmIn}
                        onChange={(e) =>
                          handleCellChange(dayNum, "pmIn", e.target.value)
                        }
                        onBlur={() => handleCellBlur(dayNum, "pmIn")}
                      />
                    </td>
                    <td>
                      <input
                        className="dtr-grid-input"
                        type="text"
                        maxLength={8}
                        placeholder={getPlaceholder()}
                        disabled={!isEditable}
                        value={pmOut}
                        onChange={(e) =>
                          handleCellChange(dayNum, "pmOut", e.target.value)
                        }
                        onBlur={() => handleCellBlur(dayNum, "pmOut")}
                      />
                    </td>
                    <td>
                      <input
                        className="dtr-grid-input"
                        type="text"
                        placeholder="0"
                        disabled={!isEditable}
                        value={undertimeHours}
                        onChange={(e) =>
                          handleCellChange(
                            dayNum,
                            "undertimeHours",
                            e.target.value,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="dtr-grid-input"
                        type="text"
                        placeholder="0"
                        disabled={!isEditable}
                        value={undertimeMinutes}
                        onChange={(e) =>
                          handleCellChange(
                            dayNum,
                            "undertimeMinutes",
                            e.target.value,
                          )
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
