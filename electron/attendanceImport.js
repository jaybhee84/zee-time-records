const normalizeIdentifier = (value) => String(value ?? '').trim().replace(/^0+(?=\d)/, '');

// Only dates that were empty before this import may receive attendance.
function importMissingDays(db, { pin, registryNumber, staffNoOnDev, newPunches = [] }) {
  const identifiers = new Set([pin, registryNumber, staffNoOnDev].map(normalizeIdentifier).filter(Boolean));
  let inserted = 0;
  let skipped = 0;
  db.run('BEGIN TRANSACTION');
  try {
    const existingDays = new Set();
    const existing = db.exec('SELECT pin, staffNoOnDev, timestamp FROM punches')[0]?.values || [];
    for (const [storedPin, storedStaff, timestamp] of existing) {
      if (identifiers.has(normalizeIdentifier(storedPin)) || identifiers.has(normalizeIdentifier(storedStaff))) {
        existingDays.add(String(timestamp).slice(0, 10));
      }
    }
    const seen = new Set();
    const stmt = db.prepare('INSERT INTO punches (pin, staffNoOnDev, timestamp, rawTime) VALUES (?, ?, ?, ?)');
    try {
      for (const punch of newPunches) {
        const timestamp = String(punch.timestamp || '').trim();
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
          throw new Error('Invalid attendance timestamp.');
        }
        if (existingDays.has(timestamp.slice(0, 10)) || seen.has(timestamp)) {
          skipped++;
          continue;
        }
        stmt.run([pin, staffNoOnDev || pin, timestamp, punch.rawTime || '']);
        seen.add(timestamp);
        inserted++;
      }
    } finally {
      stmt.free();
    }
    db.run('COMMIT');
    return { success: true, inserted, skipped };
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
}

module.exports = { importMissingDays };
