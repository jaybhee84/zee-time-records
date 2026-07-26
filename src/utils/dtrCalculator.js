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
 * @returns {Array} one row per calendar day of the month:
 *   { day, amArrival, amDeparture, pmArrival, pmDeparture, punchCount }
 */
export function buildMonthlyDTR(punches, year, month, noonCutoffHour = 12) {
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

    rows.push({
      day,
      amArrival: amGroup[0] ? formatTime(amGroup[0].datetime) : '',
      amDeparture: amGroup.length > 1 ? formatTime(amGroup[amGroup.length - 1].datetime) : '',
      pmArrival: pmGroup[0] ? formatTime(pmGroup[0].datetime) : '',
      pmDeparture: pmGroup.length > 1 ? formatTime(pmGroup[pmGroup.length - 1].datetime) : '',
      punchCount: dayPunches.length,
    });
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