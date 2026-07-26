import React, { useState } from 'react';

export default function EmployeeManager({ employees, setEmployees, pinsSeenInLog }) {
  const [newPin, setNewPin] = useState('');
  const [newName, setNewName] = useState('');

  const addOrUpdate = () => {
    if (!newPin.trim()) return;
    setEmployees((prev) => {
      const existing = prev.find((e) => e.pin === newPin.trim());
      if (existing) {
        return prev.map((e) =>
          e.pin === newPin.trim() ? { ...e, name: newName.trim() } : e
        );
      }
      return [...prev, { pin: newPin.trim(), name: newName.trim() }];
    });
    setNewPin('');
    setNewName('');
  };

  const remove = (pin) => setEmployees((prev) => prev.filter((e) => e.pin !== pin));

  return (
    <div className="panel">
      <h3>Employee Roster (PIN → Name)</h3>
      {pinsSeenInLog?.length > 0 && (
        <p className="hint">
          PINs found in the last imported log: {pinsSeenInLog.join(', ')}
        </p>
      )}
      <div className="roster-add-row">
        <input
          placeholder="PIN (from device)"
          value={newPin}
          onChange={(e) => setNewPin(e.target.value)}
        />
        <input
          placeholder="Employee Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button onClick={addOrUpdate}>Save</button>
      </div>
      <table className="roster-table">
        <thead>
          <tr>
            <th>PIN</th>
            <th>Name</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.pin}>
              <td>{e.pin}</td>
              <td>{e.name || <em>(unnamed)</em>}</td>
              <td>
                <button className="link-btn" onClick={() => remove(e.pin)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
