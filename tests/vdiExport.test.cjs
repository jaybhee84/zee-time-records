const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { exportVdiBackup } = require('../electron/vdiExport');
const { planVdiExport, createZip, readZipEntry, defaultBackupName } = require('../electron/vdiExport');

const baseRow = (id, date, time, Status, Dev = '001') => ({ EmployeeID: id, date, time, Status, Dev });
const makeBase = () => ({
  employees: [
    { EmployeeID: '146', Lastname: 'BAZAN', Firstname: 'ANA', Middlename: 'A.', StaffNumber: '146', Department: 'ADMIN', ScheduleCode: 'NON-TEACHING' },
    { EmployeeID: '7', Lastname: 'CRUZ', Firstname: 'BEN', Middlename: '', StaffNumber: '7', Department: 'GRADE 1 TCHR.', ScheduleCode: 'TEACHING' },
  ],
  departments: ['ADMIN', 'GRADE 1 TCHR.'],
  dtr: [
    baseRow('146', '2026-09-01', '08:03:00', 'I'), baseRow('146', '2026-09-01', '12:01:00', 'I'),
    baseRow('146', '2026-09-02', '08:00:00', 'I'), baseRow('146', '2026-09-02', '17:00:00', 'O'),
    baseRow('7', '2025-01-06', '07:00:00', 'I'),
  ],
});
const employee = (registryNumber, extra = {}) => ({ registryNumber, staffNoOnDev: registryNumber, familyName: 'X', firstName: 'Y', middleInitial: '', subGroup: 'Admin', ...extra });
const punch = (pin, timestamp) => ({ pin, staffNoOnDev: pin, timestamp });
const day = (plan, id, date) => plan.dtr.filter((r) => r.EmployeeID === id && r.date === date).map((r) => `${r.time} ${r.Status} ${r.Dev}`);

test('edited times overwrite VDI, untouched days keep VDI status, unseen months are kept', () => {
  const plan = planVdiExport({
    base: makeBase(),
    employees: [employee('146', { familyName: 'BAZAN', firstName: 'ANA', middleInitial: 'A.' })],
    punches: [
      punch('146', '2026-09-01 07:55:00'), punch('146', '2026-09-01 12:01:00'),
      punch('00146', '2026-09-02 08:00:00'), punch('146', '2026-09-02 17:00:00'), punch('146', '2026-09-02 17:00:00'),
      punch('999', '2026-09-02 08:00:00'), punch('146', 'not a date'),
    ],
  });
  assert.deepEqual(day(plan, '146', '2026-09-01'), ['07:55:00 I ', '12:01:00 O 001']);
  assert.deepEqual(day(plan, '146', '2026-09-02'), ['08:00:00 I 001', '17:00:00 O 001']);
  assert.deepEqual(day(plan, '7', '2025-01-06'), ['07:00:00 I 001']);
  assert.deepEqual(plan.updates, []);
  assert.equal(plan.stats.recordsAdded, 1);
  assert.equal(plan.stats.recordsRemoved, 1);
  assert.equal(plan.stats.recordsKeptFromVdi, 1);
  assert.equal(plan.stats.unmatchedPunches, 1);
  assert.equal(plan.stats.invalidPunches, 1);
});

test('a day cleared in the app is removed from VDI when the month still has records', () => {
  const plan = planVdiExport({ base: makeBase(), employees: [], punches: [punch('146', '2026-09-02 08:00:00'), punch('146', '2026-09-02 17:00:00')] });
  assert.deepEqual(day(plan, '146', '2026-09-01'), []);
  assert.equal(plan.stats.recordsRemoved, 2);
});

test('new and changed employees satisfy VDI department and schedule links', () => {
  const plan = planVdiExport({
    base: makeBase(),
    employees: [
      employee('146', { familyName: 'BAZAN-REYES', firstName: 'ANA', middleInitial: 'A.', subGroup: 'Grade 1' }),
      employee('9001', { staffNoOnDev: '55', subGroup: 'Grade 1' }),
      employee('9002', { subGroup: 'Library' }),
      employee('1234567890123456'),
    ],
    punches: [punch('55', '2026-10-05 07:01:00')],
  });
  assert.deepEqual(plan.updates, [{ EmployeeID: '146', Lastname: 'BAZAN-REYES', Firstname: 'ANA', Middlename: 'A.', StaffNumber: '146', Department: 'GRADE 1 TCHR.' }]);
  assert.deepEqual(plan.inserts.map((e) => [e.EmployeeID, e.StaffNumber, e.Department, e.ScheduleCode]), [
    ['9001', '55', 'GRADE 1 TCHR.', 'TEACHING'],
    ['9002', '9002', 'Library', 'NON-TEACHING'],
  ]);
  assert.deepEqual(plan.departments, ['Library']);
  assert.deepEqual(plan.stats.employeesSkipped, ['1234567890123456']);
  assert.deepEqual(day(plan, '9001', '2026-10-05'), ['07:01:00 I 001']);
});

test('backup zip round-trips and is named like a VDI backup', () => {
  const data = Buffer.from('Standard Jet DB'.repeat(5000));
  const zip = createZip('MSEEDBioOfficedb.mdb', data);
  assert.ok(zip.length < data.length);
  assert.deepEqual(readZipEntry(zip, (name) => name === 'MSEEDBioOfficedb.mdb'), data);
  assert.equal(readZipEntry(zip, (name) => name === 'other.mdb'), null);
  assert.equal(defaultBackupName(new Date(2026, 9, 9)), '10 9 26.zip');
});

test('export preserves blank middle names for VDI report concatenation, including updates', { skip: process.platform !== 'win32' }, async () => {
  const MDBReader = (await import('mdb-reader')).default;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zee-vdi-name-test-'));
  try {
    const firstPath = path.join(work, 'first.zip');
    const outPath = path.join(work, 'updated.zip');
    const employees = [
      employee('101', { familyName: 'AFUNDAR', firstName: 'EVELYN' }),
      employee('102', { familyName: 'CRUZ', firstName: 'ANA', middleInitial: 'M.' }),
    ];
    const punches = employees.map(e => punch(e.registryNumber, '2026-09-03 07:00:00'));
    await exportVdiBackup({ outPath: firstPath, employees, punches, MDBReader });
    employees[1].middleInitial = '';
    await exportVdiBackup({ basePath: firstPath, outPath, employees, punches, MDBReader });
    const reader = new MDBReader(readZipEntry(fs.readFileSync(outPath), name => /\.mdb$/i.test(name)));
    const rows = reader.getTable('Employees').getData();
    assert.equal(rows.length, 2);
    for (const emp of employees) {
      const row = rows.find(r => r.EmployeeID === emp.registryNumber);
      assert.equal(row.Lastname, emp.familyName);
      assert.equal(row.Firstname, emp.firstName);
      assert.equal(row.Middlename, '');
    }
    assert.equal(reader.getTable('DTR').getData().length, 2);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('export overwrites an existing backup, including a read-only one', { skip: process.platform !== 'win32' }, async () => {
  const MDBReader = (await import('mdb-reader')).default;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zee-vdi-overwrite-test-'));
  try {
    const outPath = path.join(work, '10 24 26.zip');
    fs.writeFileSync(outPath, 'old backup');
    fs.chmodSync(outPath, 0o444);
    const employees = [employee('101', { familyName: 'CRUZ', firstName: 'ANA' })];
    const stats = await exportVdiBackup({ outPath, employees, punches: [punch('101', '2026-09-03 07:00:00')], MDBReader });
    assert.equal(stats.replaced, true);
    const reader = new MDBReader(readZipEntry(fs.readFileSync(outPath), name => name === 'MSEEDBioOfficedb.mdb'));
    assert.equal(reader.getTable('DTR').getData().length, 1);
    assert.deepEqual(fs.readdirSync(work), ['10 24 26.zip']);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('employees exported into the empty template get a VDI schedule group', () => {
  const plan = planVdiExport({
    base: { employees: [], departments: ['ADMIN', 'GRADE 1 TCHR.'], schedules: ['NON-TEACHING', 'TEACHING'], dtr: [] },
    employees: [employee('101', { subGroup: 'Grade 1' }), employee('102', { subGroup: 'Admin' }), employee('103', { subGroup: 'Job Order' })],
    punches: [],
  });
  assert.deepEqual(plan.inserts.map((e) => [e.EmployeeID, e.ScheduleCode]), [['101', 'TEACHING'], ['102', 'NON-TEACHING'], ['103', 'NON-TEACHING']]);
});
