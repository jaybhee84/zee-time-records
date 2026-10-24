const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const initSqlJs = require('sql.js');
const { readPunch, importRows } = require('../electron/vineaImport');
const row = (time, day = '01') => ({ EmployeeID: '146', Date: new Date(`2026-09-${day}T00:00:00Z`), Time: new Date(`1899-12-30T${time}Z`) });
const makeDb = async () => { const SQL = await initSqlJs(); const db = new SQL.Database(); db.run('CREATE TABLE punches (id INTEGER PRIMARY KEY, pin TEXT, staffNoOnDev TEXT, timestamp TEXT, rawTime TEXT)'); return db; };
test('Access wall-clock fields stay unchanged across timezones', () => {
  for (const tz of ['Asia/Manila', 'UTC', 'America/Los_Angeles']) {
    process.env.TZ = tz;
    assert.equal(readPunch(row('17:25:00')).timestamp, '2026-09-01 17:25:00');
  }
  assert.equal(readPunch({ EmployeeID: '146', Date: new Date(NaN), Time: new Date() }), null);
});
test('repair removes old shifted imports, preserves other records, and is repeatable', async () => {
  process.env.TZ = 'Asia/Manila';
  const db = await makeDb();
  const rows = ['08:03:00', '12:01:00', '12:54:00', '17:25:00'].map(t => row(t));
  for (const r of rows) { const p = readPunch(r, true); db.run('INSERT INTO punches (pin, staffNoOnDev, timestamp, rawTime) VALUES (?, ?, ?, ?)', [p.pin,p.pin,p.timestamp,p.rawTime]); }
  db.run("INSERT INTO punches (pin, timestamp) VALUES ('999', '2026-09-01 08:00:00')");
  let backup = false;
  assert.equal(importRows(db, rows, () => { backup = true; }).punchesRepaired, 4);
  assert.equal(backup, true);
  assert.equal(importRows(db, rows).punchesImported, 0);
  assert.equal(db.exec('SELECT COUNT(*) FROM punches')[0].values[0][0], 5);
  db.close();
});
test('failed repair rolls back', async () => {
  process.env.TZ = 'Asia/Manila';
  const db = await makeDb(); const r = row('08:03:00'); const p = readPunch(r, true);
  db.run('INSERT INTO punches (pin,staffNoOnDev,timestamp,rawTime) VALUES (?,?,?,?)', [p.pin,p.pin,p.timestamp,p.rawTime]);
  assert.throws(() => importRows(db,[r],() => { throw Error('backup failed'); }));
  assert.equal(db.exec('SELECT timestamp FROM punches')[0].values[0][0], p.timestamp);
  db.close();
});
test('print shift-left option fills incomplete device days without changing undertime or input', async () => {
  process.env.TZ = 'Asia/Manila';
  const code = fs.readFileSync(require.resolve('../src/utils/dtrCalculator.js'), 'utf8');
  const { buildMonthlyDTR } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const punches = ['17:21:31', '13:00:00'].map(time => ({ timestamp: `2026-09-24 ${time}`, source: null }));
  const original = JSON.stringify(punches);
  const schedule = { amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '17:00', graceMinutes: 0 };
  const normal = buildMonthlyDTR(punches, 2026, 9, 12, schedule)[23];
  const shifted = buildMonthlyDTR(punches, 2026, 9, 12, schedule, true)[23];
  const columns = row => ['amArrival', 'amDeparture', 'pmArrival', 'pmDeparture'].map(key => row[key]);
  assert.deepEqual(columns(shifted), ['01:00 PM', '05:21 PM', '', '']);
  assert.equal(shifted.undertimeHours, normal.undertimeHours);
  assert.equal(shifted.undertimeMinutes, normal.undertimeMinutes);
  assert.deepEqual(columns(buildMonthlyDTR([punches[0]], 2026, 9, 12, null, true)[23]), ['05:21 PM', '', '', '']);
  assert.deepEqual(columns(buildMonthlyDTR([], 2026, 9, 12, null, true)[23]), ['', '', '', '']);
  assert.equal(JSON.stringify(punches), original);
  // Days with no punches (weekends, holidays, absences) carry no undertime.
  const blank = buildMonthlyDTR(punches, 2026, 9, 12, schedule)[22];
  assert.equal(blank.undertimeHours, '');
  assert.equal(blank.undertimeMinutes, '');
});

test('Vinea imports use slot rules by default; chronological columns only with the shift-left toggle', async () => {
  process.env.TZ = 'Asia/Manila';
  const code = fs.readFileSync(require.resolve('../src/utils/dtrCalculator.js'), 'utf8');
  const { buildMonthlyDTR } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const punch = { timestamp: '2026-09-24 17:21:31', source: 'vinea' };
  assert.equal(buildMonthlyDTR([punch],2026,9)[23].pmDeparture, '05:21 PM');
  assert.equal(buildMonthlyDTR([punch],2026,9)[23].amArrival, '');
  assert.equal(buildMonthlyDTR([punch],2026,9,12,null,true)[23].amArrival, '05:21 PM');
  assert.equal(buildMonthlyDTR([{...punch,source:null}],2026,9)[23].pmDeparture, '05:21 PM');
  if (process.env.VINEA_TEST_BACKUP) {
    const { default: MDBReader } = await import('mdb-reader');
    const reader = new MDBReader(fs.readFileSync(process.env.VINEA_TEST_BACKUP));
    const rows = reader.getTable('DTR').getData();
    const db = await makeDb(); importRows(db, rows);
    const result = db.exec("SELECT * FROM punches WHERE pin = '146'")[0];
    const punches = result.values.map(values => Object.fromEntries(result.columns.map((c,i)=>[c,values[i]])));
    const dtr = buildMonthlyDTR(punches,2026,9,12,null,true); // VDI layout = shift-left toggle on
    for (const [day, times] of [[1,['08:03 AM','12:01 PM','12:54 PM','05:25 PM']], [4,['07:38 AM','12:02 PM','12:59 PM','05:02 PM']], [7,['08:11 AM','12:00 PM','01:03 PM','05:35 PM']], [8,['08:10 AM','12:00 PM','12:55 PM','05:35 PM']], [24,['05:21 PM','','','']], [29,['08:10 AM','12:03 PM','12:58 PM','05:04 PM']], [30,['08:15 AM','12:44 PM','','']]]) {
      assert.deepEqual(['amArrival','amDeparture','pmArrival','pmDeparture'].map(k=>dtr[day-1][k]),times,`day ${day}`);
    }
    assert.equal(importRows(db,rows).punchesImported,0);
    db.close();
  }
});
