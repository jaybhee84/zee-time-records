const VINEA_DEPARTMENT_TO_SUBGROUP = {
  'GRADE 1 TCHR.': 'Grade 1',
  'GRADE 2 TCHR.': 'Grade 2',
  'GRADE 3 TCHR.': 'Grade 3',
  'GRADE 4 TCHR.': 'Grade 4',
  'GRADE 5 TCHR.': 'Grade 5',
  'GRADE 6 TCHR.': 'Grade 6',
  'KINDER TCHR.': 'Kinder',
  'DEPT. TEACHER': 'Departmental',
  'SNC SPED TEACHER': 'SNED',
  'SUBSTITUTE TEACHER': 'Substitute Teacher',
  'ALIVECONTRL.': 'Alive',
  'ADMIN': 'Admin',
  'JOB ORDER': 'Job Order',
  'NLC VOLUNTEERS': 'Subject Teacher',
};

function mapVineaDepartmentToSubgroup(rawDept) {
  const normalized = (rawDept || '').trim().toUpperCase();
  const mapped = VINEA_DEPARTMENT_TO_SUBGROUP[normalized];
  return {
    subGroup: mapped || (rawDept || '').trim(),
    wasMapped: Boolean(mapped),
  };
}

// Access stores wall-clock values. mdb-reader represents those fields as UTC
// Dates; local getters would incorrectly apply the computer's timezone.
function readPunch(row, legacy = false) {
  const pin = String(row.EmployeeID ?? '').trim();
  if (!pin || ![row.Date, row.Time].every(v => v instanceof Date && Number.isFinite(v.getTime()))) return null;
  const get = (value, part) => value[`get${legacy ? '' : 'UTC'}${part}`]();
  const pad = value => String(value).padStart(2, '0');
  const hour = get(row.Time, 'Hours');
  const minute = pad(get(row.Time, 'Minutes'));
  return {
    pin,
    timestamp: `${get(row.Date, 'FullYear')}-${pad(get(row.Date, 'Month') + 1)}-${pad(get(row.Date, 'Date'))} ${pad(hour)}:${minute}:${pad(get(row.Time, 'Seconds'))}`,
    rawTime: `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`,
  };
}

function importRows(db, rows, beforeRepair = () => {}) {
  const valid = rows.map(row => ({ correct: readPunch(row), legacy: readPunch(row, true) })).filter(row => row.correct);
  const keys = new Set(valid.map(({ correct: p }) => `${p.pin}|${p.timestamp}`));
  let punchesImported = 0, punchesSkipped = rows.length - valid.length, punchesRepaired = 0;
  db.run('BEGIN TRANSACTION');
  try {
    const columns = db.exec('PRAGMA table_info(punches)')[0].values;
    if (!columns.some(row => row[1] === 'source')) db.run('ALTER TABLE punches ADD COLUMN source TEXT');
    db.run('CREATE INDEX IF NOT EXISTS punches_pin_timestamp ON punches (pin, timestamp)');
    const find = db.prepare('SELECT id FROM punches WHERE pin = ? AND timestamp = ? AND staffNoOnDev = ? AND rawTime = ? AND source IS NULL');
    const repairIds = new Set();
    for (const { legacy: p } of valid) {
      // Never remove a timestamp that is also present in the original backup.
      if (keys.has(`${p.pin}|${p.timestamp}`)) continue;
      find.bind([p.pin, p.timestamp, p.pin, p.rawTime]);
      while (find.step()) repairIds.add(find.get()[0]);
      find.reset();
    }
    find.free();
    if (repairIds.size) beforeRepair();
    for (const id of repairIds) db.run('DELETE FROM punches WHERE id = ?', [id]);
    punchesRepaired = repairIds.size;
    const existing = new Set((db.exec('SELECT pin, timestamp FROM punches')[0]?.values || []).map(([pin, timestamp]) => `${pin}|${timestamp}`));
    for (const { correct: p } of valid) {
      const key = `${p.pin}|${p.timestamp}`;
      if (existing.has(key)) {
        db.run("UPDATE punches SET source = 'vinea' WHERE pin = ? AND timestamp = ?", [p.pin, p.timestamp]);
        punchesSkipped++;
      } else {
        db.run("INSERT INTO punches (pin, staffNoOnDev, timestamp, rawTime, source) VALUES (?, ?, ?, ?, 'vinea')", [p.pin, p.pin, p.timestamp, p.rawTime]);
        existing.add(key);
        punchesImported++;
      }
    }
    db.run('COMMIT');
    return { punchesImported, punchesSkipped, punchesRepaired, punchesTableFound: true };
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

module.exports = { readPunch, importRows, mapVineaDepartmentToSubgroup };
