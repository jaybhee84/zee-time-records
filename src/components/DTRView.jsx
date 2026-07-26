import React from "react";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function DTRView({
  employeeName,
  year,
  month,
  rows,
  officeName,
}) {
  return (
    <div className="dtr-sheet" id="dtr-print-area">
      <div className="dtr-header">
        <p className="csc-form-no">Civil Service Form No. 48</p>
        <h2>DAILY TIME RECORD</h2>
        <p className="dtr-name">{employeeName || "________________________"}</p>
        <p className="dtr-name-sub">(Name)</p>
        <p>
          For the month of{" "}
          <strong>
            {MONTH_NAMES[month - 1]} {year}
          </strong>
        </p>
        {officeName && <p className="dtr-office">{officeName}</p>}
        <p className="dtr-hours-line">
          Official hours for arrival and departure
          <br />
          Regular days ___________ Saturdays ___________
        </p>
      </div>

      <table className="dtr-table">
        <thead>
          <tr>
            <th rowSpan={2}>Day</th>
            <th colSpan={2}>A.M.</th>
            <th colSpan={2}>P.M.</th>
            <th colSpan={2}>Undertime</th>
          </tr>
          <tr>
            <th>Arrival</th>
            <th>Departure</th>
            <th>Arrival</th>
            <th>Departure</th>
            <th>Hours</th>
            <th>Minutes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <td>{r.day}</td>
              <td>{r.amArrival}</td>
              <td>{r.amDeparture}</td>
              <td>{r.pmArrival}</td>
              <td>{r.pmDeparture}</td>
              <td></td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="dtr-certify">
        <p>
          I certify on my honor that the above is a true and correct report of
          the hours of work performed, record of which was made daily at the
          time of arrival and departure from office.
        </p>
        <div className="dtr-signature-line">
          <span>________________________________</span>
          <span className="sig-label">Employee Signature</span>
        </div>
        <p className="verified-line">
          VERIFIED as to the prescribed office hours:
        </p>
        <div className="dtr-signature-line">
          <span>________________________________</span>
          <span className="sig-label">In-Charge / Supervisor</span>
        </div>
      </div>
    </div>
  );
}
