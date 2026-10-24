const assert = require('node:assert/strict');
const { test } = require('node:test');
const initSqlJs = require('sql.js');
const { importMissingDays } = require('../electron/attendanceImport');

test('USB import preserves employee dates, imports complete missing days, and is repeatable', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE punches (id INTEGER PRIMARY KEY, pin TEXT, staffNoOnDev TEXT, timestamp TEXT, rawTime TEXT)');
  db.run("INSERT INTO punches VALUES (1, '00146', '146', '2026-09-01 08:15:00', 'edited')");
  db.run("INSERT INTO punches VALUES (2, '999', '999', '2026-09-02 09:00:00', 'other employee')");
  db.run("INSERT INTO punches VALUES (3, '42', '42', '2026-08-31 08:00:00', 'prior month')");
  const original = db.exec('SELECT * FROM punches ORDER BY id')[0].values;
  const params = {
    pin: '00042', registryNumber: '146', staffNoOnDev: '42',
    newPunches: [
      '2026-09-01 07:30:00', '2026-09-01 17:00:00',
      '2026-09-02 08:00:00', '2026-09-02 12:00:00',
      '2026-09-02 13:00:00', '2026-09-02 17:00:00',
      '2026-09-02 17:00:00', '2026-08-31 17:00:00',
    ].map(timestamp => ({ timestamp })),
  };
  assert.deepEqual(importMissingDays(db, params), { success: true, inserted: 4, skipped: 4 });
  assert.deepEqual(db.exec('SELECT * FROM punches WHERE id <= 3 ORDER BY id')[0].values, original);
  assert.deepEqual(importMissingDays(db, params), { success: true, inserted: 0, skipped: 8 });
  assert.equal(db.exec('SELECT COUNT(*) FROM punches')[0].values[0][0], 7);
  db.close();
});

test('invalid incoming data rolls back the import without changing saved records', async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE punches (id INTEGER PRIMARY KEY, pin TEXT, staffNoOnDev TEXT, timestamp TEXT, rawTime TEXT)');
  const params = { pin: '1', newPunches: [{ timestamp: '2026-09-01 08:00:00' }, { timestamp: 'invalid' }] };
  assert.throws(() => importMissingDays(db, params), /Invalid attendance timestamp/);
  assert.equal(db.exec('SELECT COUNT(*) FROM punches')[0].values[0][0], 0);
  db.close();
});
