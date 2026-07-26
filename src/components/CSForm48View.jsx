import React from "react";
import "./csForm48.css";

// Single CS Form 48 Card Layout
export function CSForm48Card({
  employeeName,
  year,
  monthName,
  rows = [],
  copyType = "OFFICE'S COPY",
  officialHoursArrival = "0.00",
  regularDays = "30.00",
  saturdays = "4.00",
}) {
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
          Official hours for arrival
          <br />
          and departure
        </div>
        <div className="cs48-meta-right">
          <div className="cs48-meta-line">
            <span>Regular days</span>
            <span className="cs48-box">{regularDays}</span>
          </div>
          <div className="cs48-meta-line">
            <span>Saturdays</span>
            <span className="cs48-box">{saturdays}</span>
          </div>
        </div>
      </div>

      <table className="cs48-table">
        <thead>
          <tr>
            <th rowSpan={2} style={{ width: "28px" }}>
              Day
            </th>
            <th colSpan={2}>A M</th>
            <th colSpan={2}>P M</th>
            <th colSpan={2}>UNDERTIME</th>
          </tr>
          <tr>
            <th>Arrival</th>
            <th>Departure</th>
            <th>Arrival</th>
            <th>Departure</th>
            <th style={{ width: "32px" }}>Hours</th>
            <th style={{ width: "38px" }}>Minutes</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 31 }, (_, i) => {
            const dayNum = i + 1;
            const r = rows.find((item) => item.day === dayNum) || {};
            return (
              <tr key={dayNum}>
                <td className="center">{dayNum}</td>
                <td className="center">{r.amArrival || ""}</td>
                <td className="center">{r.amDeparture || ""}</td>
                <td className="center">{r.pmArrival || ""}</td>
                <td className="center">{r.pmDeparture || ""}</td>
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

        <div className="cs48-divider">
          ==========================================
          <br />
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
  const monthName = new Date(2000, month - 1, 1).toLocaleString("en-US", {
    month: "long",
  });

  // On screen: Single View
  if (!isPrintMode) {
    return (
      <div className="cs48-screen-wrapper">
        <CSForm48Card
          employeeName={employeeName}
          year={year}
          monthName={monthName}
          rows={rows}
          copyType="OFFICE'S COPY"
        />
      </div>
    );
  }

  // On Print: 2 Copies Side-by-Side
  return (
    <div className="cs48-double-page">
      <CSForm48Card
        employeeName={employeeName}
        year={year}
        monthName={monthName}
        rows={rows}
        copyType="OFFICE'S COPY"
      />
      <CSForm48Card
        employeeName={employeeName}
        year={year}
        monthName={monthName}
        rows={rows}
        copyType="EMPLOYEE'S COPY"
      />
    </div>
  );
}
