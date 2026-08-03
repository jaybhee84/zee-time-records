/**
 * Normalizes a PIN/Staff ID for comparison: coerces to string, trims
 * whitespace, and strips leading zeros (so "007" and "7" are treated as the
 * same device ID). This is the single source of truth for PIN comparison —
 * AttendancePage.jsx, TimesheetPage.jsx, and PrintDTRPage.jsx all import
 * this instead of each rolling their own, so a device PIN with (or without)
 * leading zeros matches consistently across every screen.
 */
export function normalizePin(pin) {
  if (!pin) return "";
  const cleaned = String(pin).trim().replace(/^0+/, "");
  return cleaned === "" ? "0" : cleaned;
}

/**
 * Returns a punch's Date, whether it came from parseAttlog() (which sets
 * `.datetime` directly) or from SQLite via the dtrApi (which only stores a
 * `.timestamp` string in "YYYY-MM-DD HH:MM:SS" format).
 */
function getPunchDate(p) {
  if (p.datetime instanceof Date) return p.datetime;
  if (typeof p.timestamp === 'string') {
    return new Date(p.timestamp.replace(' ', 'T'));
  }
  return new Date(NaN);
}

/**
 * Collapses punches within `windowSeconds` of each other into one (the last).
 * Handles ZKTeco double-tap noise (e.g. 17:30:02 and 17:30:10 → one punch).
 */
function deduplicatePunches(sorted, windowSeconds = 60) {
  if (sorted.length === 0) return [];
  const result = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const gap = (sorted[i].datetime - prev.datetime) / 1000;
    if (gap <= windowSeconds) {
      result[result.length - 1] = sorted[i]; // keep last in cluster
    } else {
      result.push(sorted[i]);
    }
  }
  return result;
}

// ── Time-zone helpers ─────────────────────────────────────────────────────────
// All thresholds are in decimal hours (e.g. 11.5 = 11:30).
//
//   MORNING_END  = 11:30 — before this is firmly "morning"
//   NOON_END     = 13:00 — noon window is 11:30–12:59, PM starts at 13:00
//   PM_OUT_MIN   = 16:00 — a punch at or after 4 PM is always a time-OUT
//                           (off-duty already; cannot be a time-in)

const MORNING_END = 11.5;   // 11:30
const NOON_END    = 13.0;   // 13:00
const PM_OUT_MIN  = 16.0;   // 16:00

function decHour(dt) {
  return dt.getHours() + dt.getMinutes() / 60;
}

const isMorning    = (dt) => decHour(dt) < MORNING_END;                          // < 11:30
const inNoonWindow = (dt) => decHour(dt) >= MORNING_END && decHour(dt) < NOON_END; // 11:30–12:59
const isAfternoon  = (dt) => decHour(dt) >= NOON_END;                            // >= 13:00
const isLateDay    = (dt) => decHour(dt) >= PM_OUT_MIN;                          // >= 16:00

/**
 * Assigns deduplicated taps for one day into the four DTR slots.
 *
 * Core rules (from CONDITIONS.xlsx):
 *
 * ── 4+ punches ───────────────────────────────────────────────────────────────
 *   Always positional regardless of time:
 *   tap1 → AM Arrival, tap2 → AM Departure, tap3 → PM Arrival, tap4 → PM Departure.
 *   (Any beyond tap4 are noise after deduplication.)
 *
 * ── 3 punches ────────────────────────────────────────────────────────────────
 *   tap1 morning, tap2 noon window, tap3 >= 16:00
 *     → AM in=tap1, AM out=tap2, PM in=blank, PM out=tap3
 *       (employee tapped noon-out, then came back and only tapped once at
 *        end of day — 4 PM or later is definitively "off duty / time-out")
 *
 *   tap1 morning, tap2 noon window, tap3 afternoon (13:00–15:59)
 *     → AM in=tap1, AM out=tap2, PM in=tap3, PM out=blank
 *       (normal day but forgot end-of-day tap)
 *
 *   tap1 morning, tap2 afternoon (>= 13:00), tap3 afternoon
 *     → AM in=tap1, AM out=blank, PM in=tap2, PM out=tap3
 *       (skipped noon taps entirely)
 *
 *   tap1 noon/afternoon (no morning punch at all), tap2 ?, tap3 ?
 *     → AM blank, PM in=tap1, PM out=tap3
 *       (arrived after 11:30, no morning record)
 *
 * ── 2 punches ────────────────────────────────────────────────────────────────
 *   tap1 morning, tap2 >= 16:00
 *     → AM in=tap1, PM out=tap2   (straight through all day)
 *
 *   tap1 morning, tap2 afternoon (13:00–15:59)
 *     → AM in=tap1, PM in=tap2    (straight through, forgot PM out)
 *
 *   tap1 morning, tap2 noon window
 *     → AM in=tap1, AM out=tap2   (left at noon, never returned / no more taps)
 *
 *   tap1 noon/afternoon, tap2 afternoon
 *     → PM in=tap1, PM out=tap2   (no morning punch at all)
 *
 * ── 1 punch ──────────────────────────────────────────────────────────────────
 *   morning         → AM Arrival only
 *   >= 16:00        → PM Departure only  (arrived off-screen, tapped out late)
 *   noon/afternoon  → PM Arrival only
 *
 * @param {Array} taps - deduplicated punches sorted ascending, each has .datetime (Date)
 * @returns {{ amArrival, amDeparture, pmArrival, pmDeparture }} — each a Date or null
 */
function assignSlots(taps) {
  let amArrival = null, amDeparture = null, pmArrival = null, pmDeparture = null;

  if (taps.length === 0) {
    // all blank

  } else if (taps.length === 1) {
    const dt = taps[0].datetime;
    if (isMorning(dt)) {
      amArrival = dt;
    } else if (isLateDay(dt)) {
      pmDeparture = dt;
    } else {
      // noon window or early afternoon
      pmArrival = dt;
    }

  } else if (taps.length === 2) {
    const t1 = taps[0].datetime;
    const t2 = taps[1].datetime;

    if (isMorning(t1)) {
      // Has a morning punch
      if (isLateDay(t2)) {
        // Straight-through all day — AM in + PM out
        amArrival   = t1;
        pmDeparture = t2;
      } else if (isAfternoon(t2)) {
        // AM in + PM in (13:00–15:59), forgot PM out
        amArrival = t1;
        pmArrival = t2;
      } else {
        // tap2 is in noon window — left at noon, no return tap
        amArrival   = t1;
        amDeparture = t2;
      }
    } else {
      // tap1 is noon/afternoon — no morning punch at all
      pmArrival   = t1;
      pmDeparture = t2;
    }

  } else if (taps.length === 3) {
    const t1 = taps[0].datetime;
    const t2 = taps[1].datetime;
    const t3 = taps[2].datetime;

    if (isMorning(t1)) {
      // Has a morning punch
      if (inNoonWindow(t2)) {
        // tap2 is noon-out; tap3 determines if PM in or PM out
        if (isLateDay(t3)) {
          // e.g. 7:30, 12:50, 4:00 → AM in, AM out, blank PM in, PM out
          // (4 PM or later = off duty / time-out, not a time-in)
          amArrival   = t1;
          amDeparture = t2;
          pmArrival   = null;
          pmDeparture = t3;
        } else {
          // e.g. 7:30, 12:30, 1:00 → AM in, AM out, PM in, blank PM out
          amArrival   = t1;
          amDeparture = t2;
          pmArrival   = t3;
          pmDeparture = null;
        }
      } else {
        // tap2 is afternoon (>= 13:00) — skipped noon taps
        // e.g. 7:30, 1:00, 5:00 → AM in, blank AM out, PM in, PM out
        amArrival   = t1;
        amDeparture = null;
        pmArrival   = t2;
        pmDeparture = t3;
      }
    } else {
      // tap1 is noon/afternoon — no morning punch at all
      // Use first as PM in, last as PM out
      pmArrival   = t1;
      pmDeparture = t3;
    }

  } else {
    // 4+ punches — always positional, no time checking
    amArrival   = taps[0].datetime;
    amDeparture = taps[1].datetime;
    pmArrival   = taps[2].datetime;
    pmDeparture = taps[3].datetime;
  }

  return { amArrival, amDeparture, pmArrival, pmDeparture };
}

/**
 * Turns raw ZKTeco punches into a CSC Form 48 style DTR grid.
 *
 * @param {Array} punches        - records from parseAttlog() or loaded from SQLite, for ONE employee
 * @param {number} year
 * @param {number} month         - 1-12
 * @param {number} noonStartHour - kept for API compatibility, not used in slot logic
 * @param {Object|null} schedule - optional Official Time schedule
 *   ({ amIn, amOut, pmIn, pmOut, graceMinutes } in 24-hour "HH:MM")
 * @returns {Array} one row per calendar day of the month
 */
export function buildMonthlyDTR(punches, year, month, noonStartHour = 12, schedule = null) {
  const daysInMonth = new Date(year, month, 0).getDate();

  const byDay = {};
  for (const p of punches) {
    const dt = getPunchDate(p);
    if (isNaN(dt.getTime())) continue;
    if (dt.getFullYear() !== year || dt.getMonth() + 1 !== month) continue;
    const day = dt.getDate();
    (byDay[day] ??= []).push({ ...p, datetime: dt });
  }

  const rows = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const sorted = (byDay[day] || []).sort((a, b) => a.datetime - b.datetime);
    const taps   = deduplicatePunches(sorted, 60);

    const { amArrival, amDeparture, pmArrival, pmDeparture } = assignSlots(taps);

    const row = {
      day,
      amArrival:   amArrival   ? formatTime(amArrival)   : '',
      amDeparture: amDeparture ? formatTime(amDeparture) : '',
      pmArrival:   pmArrival   ? formatTime(pmArrival)   : '',
      pmDeparture: pmDeparture ? formatTime(pmDeparture) : '',
      punchCount: taps.length,
      undertimeHours: '',
      undertimeMinutes: '',
    };

    if (schedule) {
      const totalMinutes = computeUndertimeMinutes(row, schedule);
      if (totalMinutes > 0) {
        row.undertimeHours = String(Math.floor(totalMinutes / 60));
        row.undertimeMinutes = String(totalMinutes % 60);
      }
    }

    rows.push(row);
  }

  return rows;
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Parses either a 24-hour "HH:MM" string or a 12-hour display string like
 * "7:15 AM" / "12 PM" into minutes since midnight. Returns null if empty
 * or unparseable.
 */
export function timeStrToMinutes(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (!s) return null;

  const h24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) {
    return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);
  }

  const h12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (h12) {
    let h = parseInt(h12[1], 10);
    const m = h12[2] ? parseInt(h12[2], 10) : 0;
    const meridiem = h12[3].toUpperCase();
    if (meridiem === 'AM') {
      if (h === 12) h = 0;
    } else if (h !== 12) {
      h += 12;
    }
    return h * 60 + m;
  }

  return null;
}

/**
 * Formats an Official Time schedule into the CS Form 48 header display line,
 * e.g. "7:00 AM - 12:00 NN / 1:00 - 4:30 PM".
 */
export function formatOfficialHours(schedule) {
  if (!schedule) return '';
  const fmt = (mins, isNoonBoundary) => {
    if (mins == null) return '';
    let h = Math.floor(mins / 60);
    const m = mins % 60;
    const meridiem = h >= 12 ? 'PM' : 'AM';
    const isNoon = h === 12 && m === 0;
    h = h % 12;
    if (h === 0) h = 12;
    const mStr = String(m).padStart(2, '0');
    if (isNoonBoundary && isNoon) return `${h}:${mStr} NN`;
    return `${h}:${mStr} ${meridiem}`;
  };

  const amIn  = timeStrToMinutes(schedule.amIn);
  const amOut = timeStrToMinutes(schedule.amOut);
  const pmIn  = timeStrToMinutes(schedule.pmIn);
  const pmOut = timeStrToMinutes(schedule.pmOut);

  const amPart = amIn != null && amOut != null ? `${fmt(amIn)} - ${fmt(amOut, true)}` : '';
  const pmPart = pmIn != null && pmOut != null ? `${fmt(pmIn, true)} - ${fmt(pmOut)}` : '';

  return [amPart, pmPart].filter(Boolean).join(' / ');
}

/**
 * Computes total undertime (in minutes) for one DTR day row against an
 * Official Time schedule: { amIn, amOut, pmIn, pmOut, graceMinutes }.
 *
 * WHOLE-DAY NET model: total rendered minutes vs total required.
 */
export function computeUndertimeMinutes(row, schedule) {
  if (!schedule) return 0;

  const boundAmIn  = timeStrToMinutes(schedule.amIn);
  const boundAmOut = timeStrToMinutes(schedule.amOut);
  const boundPmIn  = timeStrToMinutes(schedule.pmIn);
  const boundPmOut = timeStrToMinutes(schedule.pmOut);

  const amArrival   = timeStrToMinutes(row.amArrival);
  const amDeparture = timeStrToMinutes(row.amDeparture);
  const pmArrival   = timeStrToMinutes(row.pmArrival);
  const pmDeparture = timeStrToMinutes(row.pmDeparture);

  const haveAmBound = boundAmIn != null && boundAmOut != null;
  const havePmBound = boundPmIn != null && boundPmOut != null;
  if (!haveAmBound && !havePmBound) return 0;

  const requiredMinutes =
    (haveAmBound ? boundAmOut - boundAmIn : 0) +
    (havePmBound ? boundPmOut - boundPmIn : 0);

  let renderedMinutes;

  if (amArrival != null && amDeparture == null && pmArrival == null && pmDeparture != null) {
    // Straight-through: AM in + PM out only (no lunch taps)
    const lunchGap = haveAmBound && havePmBound ? Math.max(0, boundPmIn - boundAmOut) : 0;
    renderedMinutes = Math.max(0, pmDeparture - amArrival - lunchGap);

  } else if (amArrival != null && amDeparture == null && pmArrival != null && pmDeparture == null) {
    // Straight-through variant: AM in + PM arrival used as departure proxy
    const lunchGap = haveAmBound && havePmBound ? Math.max(0, boundPmIn - boundAmOut) : 0;
    renderedMinutes = Math.max(0, pmArrival - amArrival - lunchGap);

  } else {
    const amRendered =
      amArrival != null && amDeparture != null ? Math.max(0, amDeparture - amArrival) : 0;
    const pmRendered =
      pmArrival != null && pmDeparture != null ? Math.max(0, pmDeparture - pmArrival) : 0;
    renderedMinutes = amRendered + pmRendered;
  }

  const shortfall = requiredMinutes - renderedMinutes;
  return shortfall <= 0 ? 0 : Math.round(shortfall);
}

/**
 * Groups all parsed punches by employee PIN.
 */
export function groupByPin(punches) {
  const map = {};
  for (const p of punches) {
    const key = normalizePin(p.pin);
    (map[key] ??= []).push(p);
  }
  return map;
}