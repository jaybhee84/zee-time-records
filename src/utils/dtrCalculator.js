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
 * Turns raw ZKTeco punches into a CSC Form 48 style DTR grid.
 *
 * ZKTeco's in/out status byte is unreliable across models (people also punch
 * inconsistently), so this uses the standard DTR convention instead:
 * punches before the noon cutoff are AM, punches after are PM. Within each
 * half, the earliest punch is "Arrival" and the latest is "Departure". If a
 * half only has one punch, it's treated as Arrival only (common when staff
 * skip the lunch-break punch).
 *
 * @param {Array} punches  - records from parseAttlog() or loaded from SQLite, for ONE employee
 * @param {number} year
 * @param {number} month   - 1-12
 * @param {number} noonCutoffHour - default 12 (24h clock)
 * @param {Object|null} schedule - optional Official Time schedule
 *   ({ amIn, amOut, pmIn, pmOut, graceMinutes } in 24-hour "HH:MM") used to
 *   auto-compute undertimeHours/undertimeMinutes per day. Omit (or pass
 *   null) to leave undertime blank, e.g. for callers like AttendancePage.jsx
 *   that don't need it.
 * @returns {Array} one row per calendar day of the month:
 *   { day, amArrival, amDeparture, pmArrival, pmDeparture, punchCount,
 *     undertimeHours, undertimeMinutes }
 */
export function buildMonthlyDTR(punches, year, month, noonCutoffHour = 12, schedule = null) {
  const daysInMonth = new Date(year, month, 0).getDate();

  // group punches by day-of-month
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
    const dayPunches = (byDay[day] || []).sort((a, b) => a.datetime - b.datetime);

    const amGroup = dayPunches.filter((p) => p.datetime.getHours() < noonCutoffHour);
    const pmGroup = dayPunches.filter((p) => p.datetime.getHours() >= noonCutoffHour);

    const row = {
      day,
      amArrival: amGroup[0] ? formatTime(amGroup[0].datetime) : '',
      amDeparture: amGroup.length > 1 ? formatTime(amGroup[amGroup.length - 1].datetime) : '',
      pmArrival: pmGroup[0] ? formatTime(pmGroup[0].datetime) : '',
      pmDeparture: pmGroup.length > 1 ? formatTime(pmGroup[pmGroup.length - 1].datetime) : '',
      punchCount: dayPunches.length,
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
 * Parses either a 24-hour "HH:MM" string (how Official Time settings are
 * stored/saved) or a 12-hour display string like "7:15 AM" / "12 PM" (how
 * buildMonthlyDTR's own amArrival/amDeparture/pmArrival/pmDeparture fields,
 * and TimesheetPage's manually-typed values, are formatted) into minutes
 * since midnight. Returns null if the value is empty or unparseable, so
 * callers can treat "no punch" / "no schedule set" as "skip this check"
 * rather than accidentally treating it as midnight.
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
 * Formats an Official Time schedule ({ amIn, amOut, pmIn, pmOut } in 24-hour
 * "HH:MM") into the compact display line used on the CS Form 48 header, e.g.
 * "7:00 AM - 12:00 NN / 1:00 - 4:30 PM".
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

  const amIn = timeStrToMinutes(schedule.amIn);
  const amOut = timeStrToMinutes(schedule.amOut);
  const pmIn = timeStrToMinutes(schedule.pmIn);
  const pmOut = timeStrToMinutes(schedule.pmOut);

  const amPart =
    amIn != null && amOut != null
      ? `${fmt(amIn)} - ${fmt(amOut, true)}`
      : '';
  const pmPart =
    pmIn != null && pmOut != null
      ? `${fmt(pmIn, true)} - ${fmt(pmOut)}`
      : '';

  return [amPart, pmPart].filter(Boolean).join(' / ');
}

/**
 * Computes total undertime (in minutes) for one DTR day row against an
 * Official Time schedule: { amIn, amOut, pmIn, pmOut, graceMinutes } in
 * 24-hour "HH:MM".
 *
 * This is a WHOLE-DAY NET model, not four independent boundary checks:
 * total minutes actually rendered for the day is compared against total
 * minutes required, and only the shortfall counts as undertime. This
 * means a late AM arrival is fully forgiven if the employee compensates
 * by staying later in the afternoon — e.g. official time is 7:00-4:00,
 * employee arrives 7:10, employee leaves 4:10 → 0 undertime, because the
 * total span worked still equals the required total, even though they
 * were "late" that morning.
 *
 * `graceMinutes` is NOT used in this calculation at all. It only decides
 * whether a punch would be labeled "late" for display/reporting purposes
 * elsewhere — it does not excuse anyone from making up lost time. A 10
 * minute late arrival with a 15-minute grace period still creates a
 * 10-minute shortfall that must be worked off later the same day, or it
 * shows as undertime; grace just means that arrival itself isn't flagged
 * as tardy.
 *
 * Missing punches are handled two ways:
 *  - If BOTH punches for a half are missing (no lunch-out/lunch-in at
 *    all — i.e. the employee just punches once in the morning and once
 *    in the afternoon with no registered lunch break), the day is
 *    treated as one continuous span from amArrival to pmArrival (see
 *    buildMonthlyDTR's doc comment — a lone PM punch is stored as
 *    `pmArrival`, not `pmDeparture`), minus the scheduled lunch gap.
 *    This avoids incorrectly flagging straight-through workers as
 *    absent all afternoon just because they never tapped for lunch.
 *  - Any other incomplete/unresolvable half (e.g. an employee who
 *    simply never punched again after their AM arrival) contributes 0
 *    rendered minutes for that half, same as before — a genuine missing
 *    half is real, unexplained lost time and should surface as
 *    undertime rather than being silently excused.
 */
export function computeUndertimeMinutes(row, schedule) {
  if (!schedule) return 0;

  const boundAmIn = timeStrToMinutes(schedule.amIn);
  const boundAmOut = timeStrToMinutes(schedule.amOut);
  const boundPmIn = timeStrToMinutes(schedule.pmIn);
  const boundPmOut = timeStrToMinutes(schedule.pmOut);

  const amArrival = timeStrToMinutes(row.amArrival);
  const amDeparture = timeStrToMinutes(row.amDeparture);
  const pmArrival = timeStrToMinutes(row.pmArrival);
  const pmDeparture = timeStrToMinutes(row.pmDeparture);

  const haveAmBound = boundAmIn != null && boundAmOut != null;
  const havePmBound = boundPmIn != null && boundPmOut != null;
  if (!haveAmBound && !havePmBound) return 0;

  const requiredMinutes =
    (haveAmBound ? boundAmOut - boundAmIn : 0) +
    (havePmBound ? boundPmOut - boundPmIn : 0);

  let renderedMinutes;

  if (
    amArrival != null &&
    amDeparture == null &&
    pmArrival != null &&
    pmDeparture == null
  ) {
    // Straight-through day: one AM punch, one PM punch, nothing in
    // between. Treat pmArrival as the day's actual departure (see
    // comment above) and exclude the scheduled lunch gap so an
    // unregistered lunch break doesn't read as unworked time.
    const lunchGapMinutes =
      haveAmBound && havePmBound ? Math.max(0, boundPmIn - boundAmOut) : 0;
    renderedMinutes = Math.max(0, pmArrival - amArrival - lunchGapMinutes);
  } else {
    const amRendered =
      amArrival != null && amDeparture != null
        ? Math.max(0, amDeparture - amArrival)
        : 0;
    const pmRendered =
      pmArrival != null && pmDeparture != null
        ? Math.max(0, pmDeparture - pmArrival)
        : 0;
    renderedMinutes = amRendered + pmRendered;
  }

  const shortfall = requiredMinutes - renderedMinutes;
  if (shortfall <= 0) return 0;

  return Math.round(shortfall);
}

/**
 * Groups all parsed punches by employee PIN, using the same normalization
 * as the rest of the app (see normalizePin above) so a lookup like
 * `byPin[normalizePin(emp.staffNoOnDev)]` reliably finds punches even if
 * the stored PIN and the employee's device ID differ by leading zeros or
 * whitespace.
 */
export function groupByPin(punches) {
  const map = {};
  for (const p of punches) {
    const key = normalizePin(p.pin);
    (map[key] ??= []).push(p);
  }
  return map;
}