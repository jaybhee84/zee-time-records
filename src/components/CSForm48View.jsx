import React from "react";
import "./csForm48.css";

// Converts a logged time value like "07:59 AM" to "07:59 am" — plain lowercase am/pm
function formatTimeCell(value) {
  if (!value) return "";
  return String(value).replace(/\b(AM|PM)\b/i, (m) => m.toLowerCase());
}

// Inline width override for the Day/Date column
const DAY_COLUMN_WIDTH = "16%";

// Single CS Form 48 Card Layout
export function CSForm48Card({
  employeeName,
  year,
  month,
  monthName,
  rows = [],
  copyType = "OFFICE'S COPY",
  officialHoursArrival = "0.00",
  regularDays,
  saturdays = "4.00",
}) {
  // Dynamically calculate days in month (defaults to 31 for July)
  const daysInMonth = year && month ? new Date(year, month, 0).getDate() : 31;
  const formattedRegularDays = regularDays || `${daysInMonth}.00`;

  return (
    <div className="cs48-card">
      <div className="cs48-header-top">
        <span className="cs48-form-num">Civil Service Form No. 48</span>
        <span className="cs48-copy-tag">&gt;&gt;&gt;&gt;&gt;{copyType}</span>
      </div>

      <h2 className="cs48-title">DAILY TIME RECORD</h2>
      <div className="cs48-emp-name">
        {employeeName || "____________________"}
      </div>

      <div className="cs48-month-row">
        <span>For the month of</span>
        <span className="cs48-month-val">
          {monthName} {year}
        </span>
      </div>

      <div className="cs48-meta-table">
        <div className="cs48-meta-left">
          <div>Official hours for arrival</div>
          <div className="cs48-meta-arrival-row">
            <span>and departure</span>
            <span className="cs48-box" style={{ minWidth: "60px" }}>
              {officialHoursArrival}
            </span>
          </div>
        </div>
        <div className="cs48-meta-right">
          <div className="cs48-meta-line">
            <span>Regular days</span>
            <span className="cs48-box">{formattedRegularDays}</span>
          </div>
          <div className="cs48-meta-line">
            <span>Saturdays</span>
            <span className="cs48-box">{saturdays}</span>
          </div>
        </div>
      </div>

      <table className="cs48-table">
        <colgroup>
          <col className="col-day" style={{ width: DAY_COLUMN_WIDTH }} />
          <col className="col-am-arrival" />
          <col className="col-am-departure" />
          <col className="col-pm-arrival" />
          <col className="col-pm-departure" />
          <col className="col-hour" />
          <col className="col-minutes" />
        </colgroup>
        <thead>
          <tr>
            <th>Day</th>
            <th colSpan={2}>A M</th>
            <th colSpan={2}>P M</th>
            <th colSpan={2}>UNDERTIME</th>
          </tr>
          <tr>
            <th>Date</th>
            <th>Arrival</th>
            <th>Departure</th>
            <th>Arrival</th>
            <th>Departure</th>
            <th>Hour</th>
            <th>Minutes</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: daysInMonth }, (_, i) => {
            const dayNum = i + 1;
            const r = rows.find((item) => item.day === dayNum) || {};
            return (
              <tr key={dayNum}>
                <td className="center">{dayNum}</td>
                <td className="center">{formatTimeCell(r.amArrival)}</td>
                <td className="center">{formatTimeCell(r.amDeparture)}</td>
                <td className="center">{formatTimeCell(r.pmArrival)}</td>
                <td className="center pm-departure">
                  {formatTimeCell(r.pmDeparture)}
                </td>
                <td className="center">{r.undertimeHours || ""}</td>
                <td className="center">{r.undertimeMinutes || ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="cs48-footer">
        <p className="cs48-cert-text">
          I Certify on my honor that the above is a true and correct report of
          the hours work performed, record of which was daily at the time of
          arrival and departure from office.
        </p>
        <div className="cs48-sig-line"></div>
        <div className="cs48-sig-label">Signature</div>

        {/* Double rule divider — two stacked lines */}
        <div className="cs48-equal-line">
          <span className="cs48-equal-line-top"></span>
          <span className="cs48-equal-line-bottom"></span>
        </div>

        <div className="cs48-verified-text">
          VERIFIED as to the prescribed office hours
        </div>

        <div className="cs48-sig-line"></div>
        <div className="cs48-sig-label">In Charge</div>
      </div>
    </div>
  );
}

// Render component supporting 1-view on screen and 2-view (side-by-side) on print
export default function CSForm48View({
  employeeName,
  year,
  month,
  rows,
  isPrintMode = false,
}) {
  const monthName = new Date(year || 2000, month - 1, 1).toLocaleString(
    "en-US",
    {
      month: "long",
    },
  );

  if (!isPrintMode) {
    return (
      <div className="cs48-screen-wrapper">
        <CSForm48Card
          employeeName={employeeName}
          year={year}
          month={month}
          monthName={monthName}
          rows={rows}
          copyType="OFFICE'S COPY"
        />
      </div>
    );
  }

  return (
    <div className="cs48-double-page">
      <CSForm48Card
        employeeName={employeeName}
        year={year}
        month={month}
        monthName={monthName}
        rows={rows}
        copyType="OFFICE'S COPY"
      />
      <CSForm48Card
        employeeName={employeeName}
        year={year}
        month={month}
        monthName={monthName}
        rows={rows}
        copyType="EMPLOYEE'S COPY"
      />
    </div>
  );
}
