const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFile } = require('child_process');
const { mapVineaDepartmentToSubgroup } = require('./vineaImport');

// A VDI BioOffice (Vinea) backup is a zip named after the backup date
// ("10 9 26.zip") holding the whole Access database under this name.
const VDI_DB_NAME = 'MSEEDBioOfficedb.mdb';
const VDI_INSTALLED_DB = path.join('C:\\MSEEDBioOffice', VDI_DB_NAME);
const VDI_TEMPLATE_PATH = path.join(__dirname, 'assets', 'vdi-template.zip');

const normalizeIdentifier = (value) => {
  const trimmed = String(value ?? '').trim();
  return trimmed.replace(/^0+/, '') || (trimmed ? '0' : '');
};
const sameText = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
const pad = (value) => String(value).padStart(2, '0');

function defaultBackupName(date = new Date()) {
  return `${date.getMonth() + 1} ${date.getDate()} ${String(date.getFullYear()).slice(-2)}.zip`;
}

// Access stores wall-clock values that mdb-reader exposes as UTC Dates.
function readBase(reader) {
  const tables = reader.getTableNames();
  for (const name of ['Employees', 'DTR']) {
    if (!tables.includes(name)) throw new Error(`No "${name}" table found - this is not a VDI BioOffice database.`);
  }
  const rows = (name) => (tables.includes(name) ? reader.getTable(name).getData() : []);
  return {
    employees: rows('Employees').map((row) => ({
      EmployeeID: String(row.EmployeeID ?? '').trim(),
      Lastname: row.Lastname ?? '',
      Firstname: row.Firstname ?? '',
      Middlename: row.Middlename ?? '',
      StaffNumber: String(row.StaffNumber ?? '').trim(),
      Department: row.Department ?? '',
      ScheduleCode: row.ScheduleCode ?? '',
    })).filter((row) => row.EmployeeID),
    dtr: rows('DTR')
      .filter((row) => [row.Date, row.Time].every((v) => v instanceof Date && Number.isFinite(v.getTime())))
      .map((row) => ({
        EmployeeID: String(row.EmployeeID ?? '').trim(),
        date: row.Date.toISOString().slice(0, 10),
        time: row.Time.toISOString().slice(11, 19),
        Status: row.Status ?? '',
        Dev: row.Dev ?? '',
      })),
    departments: rows('Department').map((row) => String(row.DepartmentName ?? '').trim()).filter(Boolean),
    schedules: [...new Set(rows('ScheduleSetup').map((row) => String(row.ScheduleCode ?? '').trim()).filter(Boolean))],
  };
}

// Same teaching groups as src/utils/employeeGroups.js.
const TEACHING_SUBGROUPS = ['kinder', 'grade 1', 'grade 2', 'grade 3', 'grade 4', 'grade 5', 'grade 6', 'sned', 'sped', 'departmental', 'subject teacher', 'alive', 'substitute teacher'];
const isTeachingSubgroup = (subGroup) => {
  const value = String(subGroup ?? '').trim().toLowerCase();
  return TEACHING_SUBGROUPS.includes(value) || value.startsWith('subject teacher') || value.startsWith('substitute teacher');
};

const mostCommon = (values) => {
  const counts = new Map();
  for (const value of values) if (value) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};

/**
 * Works out what the VDI database must contain so it mirrors this app:
 * employees are added/updated (never removed, VDI cascades a removal into the
 * attendance history), and every employee-month that has attendance here
 * replaces the same month in VDI. Months this app holds nothing for are kept.
 */
function planVdiExport({ employees = [], punches = [], base }) {
  const baseById = new Map(base.employees.map((emp) => [normalizeIdentifier(emp.EmployeeID), emp]));
  const departments = [...base.departments];
  const newDepartments = [];
  // VDI requires a schedule group on every employee. Prefer what colleagues in
  // the same department use, then VDI's TEACHING / NON-TEACHING schedules.
  const schedules = base.schedules || [];
  const fallbackSchedule = mostCommon(base.employees.map((emp) => emp.ScheduleCode)) || schedules[0] || '';
  const scheduleFor = (department, subGroup) => {
    const peers = mostCommon(base.employees.filter((other) => sameText(other.Department, department)).map((other) => other.ScheduleCode));
    if (peers) return peers;
    const wanted = isTeachingSubgroup(subGroup) ? 'TEACHING' : 'NON-TEACHING';
    return schedules.find((code) => sameText(code, wanted)) || fallbackSchedule;
  };

  const resolveDepartment = (emp) => {
    const subGroup = String(emp.subGroup ?? '').trim();
    const matches = (dept) => !subGroup || sameText(mapVineaDepartmentToSubgroup(dept).subGroup, subGroup);
    const source = departments.find((dept) => sameText(dept, emp.sourceGroup));
    if (source && matches(source)) return source;
    if (!subGroup) return '';
    const mapped = departments.find((dept) => sameText(mapVineaDepartmentToSubgroup(dept).subGroup, subGroup));
    if (mapped) return mapped;
    const created = subGroup.slice(0, 50);
    departments.push(created);
    newDepartments.push(created);
    return created;
  };

  const aliases = new Map();
  const claim = (value, id) => {
    const alias = normalizeIdentifier(value);
    if (alias && !aliases.has(alias)) aliases.set(alias, id);
  };
  const inserts = [];
  const updates = [];
  const skippedEmployees = [];
  const linked = [];

  for (const emp of employees) {
    const registryNumber = String(emp.registryNumber ?? '').trim();
    if (!registryNumber) continue;
    const existing = baseById.get(normalizeIdentifier(registryNumber));
    if (!existing && registryNumber.length > 15) {
      skippedEmployees.push(registryNumber);
      continue;
    }
    const id = existing ? existing.EmployeeID : registryNumber;
    const row = {
      EmployeeID: id,
      Lastname: String(emp.familyName ?? '').trim().slice(0, 50),
      Firstname: String(emp.firstName ?? '').trim().slice(0, 50),
      Middlename: String(emp.middleInitial ?? '').trim().slice(0, 50),
      StaffNumber: (String(emp.staffNoOnDev ?? '').trim() || id).slice(0, 50),
    };
    if (existing) {
      const keepDepartment = sameText(mapVineaDepartmentToSubgroup(existing.Department).subGroup, emp.subGroup);
      row.Department = keepDepartment ? existing.Department : resolveDepartment(emp) || existing.Department;
      if (Object.keys(row).some((key) => String(row[key] ?? '') !== String(existing[key] ?? '').trim())) updates.push(row);
    } else {
      row.Department = resolveDepartment(emp);
      row.ScheduleCode = scheduleFor(row.Department, emp.subGroup);
      inserts.push(row);
      baseById.set(normalizeIdentifier(id), row);
    }
    claim(registryNumber, id);
    linked.push([emp.staffNoOnDev, id]);
  }
  // Registry numbers win over device staff numbers, then VDI's own records.
  for (const [staffNo, id] of linked) claim(staffNo, id);
  for (const emp of base.employees) claim(emp.EmployeeID, emp.EmployeeID);
  for (const emp of base.employees) claim(emp.StaffNumber, emp.EmployeeID);

  const baseDays = new Map();
  const baseMonths = new Map();
  for (const row of base.dtr) {
    const dayKey = `${row.EmployeeID}|${row.date}`;
    if (!baseDays.has(dayKey)) baseDays.set(dayKey, []);
    baseDays.get(dayKey).push(row);
    const monthKey = `${row.EmployeeID}|${row.date.slice(0, 7)}`;
    if (!baseMonths.has(monthKey)) baseMonths.set(monthKey, []);
    baseMonths.get(monthKey).push(row);
  }
  const defaultDev = mostCommon(base.dtr.map((row) => row.Dev));

  const appDays = new Map();
  const appMonths = new Set();
  const unmatchedPins = new Set();
  let unmatchedPunches = 0;
  let invalidPunches = 0;
  for (const punch of punches) {
    const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(String(punch.timestamp ?? '').trim());
    if (!match) {
      invalidPunches++;
      continue;
    }
    const id = aliases.get(normalizeIdentifier(punch.pin)) ?? aliases.get(normalizeIdentifier(punch.staffNoOnDev));
    if (!id) {
      unmatchedPunches++;
      unmatchedPins.add(String(punch.pin ?? '').trim());
      continue;
    }
    const dayKey = `${id}|${match[1]}`;
    if (!appDays.has(dayKey)) appDays.set(dayKey, new Set());
    appDays.get(dayKey).add(match[2]);
    appMonths.add(`${id}|${match[1].slice(0, 7)}`);
  }

  const dtr = [];
  let changedDays = 0;
  for (const [dayKey, timeSet] of appDays) {
    const [EmployeeID, date] = dayKey.split('|');
    const times = [...timeSet].sort();
    const existing = (baseDays.get(dayKey) || []).slice().sort((a, b) => a.time.localeCompare(b.time));
    if (existing.length === times.length && existing.every((row, index) => row.time === times[index])) {
      dtr.push(...existing);
      continue;
    }
    // A new or edited day: VDI pairs scans as alternating In/Out.
    changedDays++;
    const devByTime = new Map(existing.map((row) => [row.time, row.Dev]));
    times.forEach((time, index) => dtr.push({
      EmployeeID,
      date,
      time,
      Status: index % 2 === 0 ? 'I' : 'O',
      Dev: devByTime.has(time) ? devByTime.get(time) : existing.length ? '' : defaultDev,
    }));
  }
  let keptRows = 0;
  for (const [monthKey, rows] of baseMonths) {
    if (appMonths.has(monthKey)) continue;
    dtr.push(...rows);
    keptRows += rows.length;
  }
  dtr.sort((a, b) =>
    a.EmployeeID.localeCompare(b.EmployeeID, undefined, { numeric: true }) ||
    a.date.localeCompare(b.date) ||
    a.time.localeCompare(b.time));

  const baseKeys = new Set(base.dtr.map((row) => `${row.EmployeeID}|${row.date}|${row.time}`));
  const finalKeys = new Set(dtr.map((row) => `${row.EmployeeID}|${row.date}|${row.time}`));
  let added = 0;
  for (const key of finalKeys) if (!baseKeys.has(key)) added++;
  let removed = 0;
  for (const key of baseKeys) if (!finalKeys.has(key)) removed++;

  return {
    departments: newDepartments,
    inserts,
    updates,
    dtr,
    stats: {
      records: dtr.length,
      recordsAdded: added,
      recordsRemoved: removed,
      recordsKeptFromVdi: keptRows,
      daysChanged: changedDays,
      employeesAdded: inserts.length,
      employeesUpdated: updates.length,
      employeesSkipped: skippedEmployees,
      unmatchedPunches,
      unmatchedPins: [...unmatchedPins].slice(0, 20),
      invalidPunches,
    },
  };
}

// ---- zip (single-entry archives are all a VDI backup needs) ---------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entryName, data, date = new Date()) {
  const name = Buffer.from(entryName, 'utf8');
  const compressed = zlib.deflateRawSync(data, { level: 6 });
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  local.copy(central, 8, 6, 30);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + compressed.length, 16);

  return Buffer.concat([local, name, compressed, central, name, end]);
}

function readZipEntry(zip, matches) {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('This file is not a valid zip archive.');
  let offset = zip.readUInt32LE(end + 16);
  for (let i = zip.readUInt16LE(end + 10); i > 0; i--) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) break;
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (matches(name)) {
      const local = zip.readUInt32LE(offset + 42);
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const body = zip.subarray(start, start + compressedSize);
      if (method === 0) return Buffer.from(body);
      if (method === 8) return zlib.inflateRawSync(body);
      throw new Error(`Unsupported zip compression method (${method}).`);
    }
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
  }
  return null;
}

// Accepts a VDI backup (.zip) or the database itself (.mdb).
function readBaseFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50) {
    const mdb = readZipEntry(buffer, (name) => /\.mdb$/i.test(name));
    if (!mdb) throw new Error('No .mdb database was found inside this zip file.');
    return mdb;
  }
  return buffer;
}

// ---- writing the Access database -----------------------------------------

// Windows ships the Jet 4.0 engine for 32-bit processes only, so the rows are
// written by 32-bit PowerShell. Attendance is bulk-loaded from a CSV.
const JET_SCRIPT = String.raw`param([string]$Mdb, [string]$Work, [string]$Out)
$ErrorActionPreference = 'Stop'
try {
  $plan = Get-Content -LiteralPath (Join-Path $Work 'plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $cn = $null
  foreach ($provider in 'Microsoft.Jet.OLEDB.4.0', 'Microsoft.ACE.OLEDB.12.0', 'Microsoft.ACE.OLEDB.16.0') {
    try {
      $cn = New-Object System.Data.OleDb.OleDbConnection("Provider=$provider;Data Source=$Mdb;Mode=Share Exclusive")
      $cn.Open()
      break
    } catch { $cn = $null; $openError = $_.Exception.Message }
  }
  if (-not $cn) { throw "Could not open the database with the Windows Access engine: $openError" }

  function Invoke-Sql([string]$Sql, [object[]]$Values = @(), [int[]]$BlankTextIndexes = @()) {
    $cmd = $cn.CreateCommand()
    $cmd.CommandText = $Sql
    $cmd.CommandTimeout = 0
    for ($i = 0; $i -lt $Values.Count; $i++) {
      $value = $Values[$i]
      $p = $cmd.Parameters.Add('p', [System.Data.OleDb.OleDbType]::VarWChar)
      # VDI concatenates name fields in reports. A NULL middle name makes
      # the entire name NULL, so preserve blank text as a zero-length string.
      if ($BlankTextIndexes -contains $i) { $p.Value = [string]$value }
      elseif ($null -eq $value -or "$value" -eq '') { $p.Value = [DBNull]::Value }
      else { $p.Value = "$value" }
    }
    $count = $cmd.ExecuteNonQuery()
    $cmd.Dispose()
    return $count
  }

  foreach ($d in @($plan.departments)) {
    [void](Invoke-Sql 'INSERT INTO [Department] ([DepartmentName]) VALUES (?)' @($d))
  }
  foreach ($e in @($plan.inserts)) {
    [void](Invoke-Sql ('INSERT INTO [Employees] ([EmployeeID],[Lastname],[Firstname],[Middlename],[Department],[StaffNumber],[ScheduleCode],' +
      '[CurrentAddress],[ProvincialAddress],[Position],[PicturePath],[DeviceName],[IsActive],[MultiStaffID],[IsAssigned],[StartDate]) ' +
      "VALUES (?,?,?,?,?,?,?,'','','','','',True,False,True,Date())") @($e.EmployeeID, $e.Lastname, $e.Firstname, $e.Middlename, $e.Department, $e.StaffNumber, $e.ScheduleCode) @(1, 2, 3))
  }
  foreach ($e in @($plan.updates)) {
    [void](Invoke-Sql 'UPDATE [Employees] SET [Lastname]=?,[Firstname]=?,[Middlename]=?,[Department]=?,[StaffNumber]=? WHERE [EmployeeID]=?' @($e.Lastname, $e.Firstname, $e.Middlename, $e.Department, $e.StaffNumber, $e.EmployeeID) @(0, 1, 2))
  }

  [void](Invoke-Sql 'DELETE FROM [DTR]')
  $written = Invoke-Sql ('INSERT INTO [DTR] ([EmployeeID],[Date],[Time],[Status],[Dev],[DateField],[TimeField],[StatusField]) ' +
    'SELECT [EmployeeID], DateSerial([Y],[M],[D]), TimeSerial([H],[N],[S]), [Status], [Dev], False, False, False ' +
    "FROM [Text;HDR=YES;FMT=Delimited;DATABASE=$Work].[dtr#csv]")
  $cn.Close()
  [System.Data.OleDb.OleDbConnection]::ReleaseObjectPool()

  # Deleting and reloading the attendance table leaves the file bloated.
  try {
    $engine = New-Object -ComObject JRO.JetEngine
    $engine.CompactDatabase("Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$Mdb", "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=$Out;Jet OLEDB:Engine Type=5")
  } catch {
    Copy-Item -LiteralPath $Mdb -Destination $Out -Force
  }
  Write-Output "WRITTEN=$written"
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`;

const csvText = (value) => (value === '' || value == null ? '' : `"${String(value).replace(/"/g, '""')}"`);

function writeWorkFiles(workDir, plan) {
  fs.writeFileSync(path.join(workDir, 'plan.json'), JSON.stringify({
    departments: plan.departments,
    inserts: plan.inserts,
    updates: plan.updates,
  }), 'utf8');
  fs.writeFileSync(path.join(workDir, 'schema.ini'), [
    '[dtr.csv]', 'Format=CSVDelimited', 'ColNameHeader=True', 'CharacterSet=65001', 'MaxScanRows=0',
    'Col1=EmployeeID Text Width 15', 'Col2=Y Long', 'Col3=M Long', 'Col4=D Long', 'Col5=H Long', 'Col6=N Long', 'Col7=S Long',
    'Col8=Status Text Width 50', 'Col9=Dev Text Width 50', '',
  ].join('\r\n'), 'latin1');
  const lines = ['EmployeeID,Y,M,D,H,N,S,Status,Dev'];
  for (const row of plan.dtr) {
    const [y, m, d] = row.date.split('-').map(Number);
    const [h, n, s] = row.time.split(':').map(Number);
    lines.push(`${csvText(row.EmployeeID)},${y},${m},${d},${h},${n},${s},${csvText(row.Status)},${csvText(row.Dev)}`);
  }
  fs.writeFileSync(path.join(workDir, 'dtr.csv'), lines.join('\r\n') + '\r\n', 'utf8');
  fs.writeFileSync(path.join(workDir, 'write.ps1'), JET_SCRIPT, 'utf8');
}

function runJet(workDir, mdbPath, outPath) {
  const root = process.env.SystemRoot || 'C:\\Windows';
  const wow64 = path.join(root, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const powershell = fs.existsSync(wow64) ? wow64 : path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    execFile(
      powershell,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(workDir, 'write.ps1'),
        '-Mdb', mdbPath, '-Work', workDir, '-Out', outPath],
      { windowsHide: true, maxBuffer: 1024 * 1024, timeout: 15 * 60 * 1000 },
      (err, stdout, stderr) => {
        const written = /WRITTEN=(\d+)/.exec(stdout || '');
        if (err || !written) return reject(new Error((stderr || '').trim() || err?.message || 'The Access engine did not report a result.'));
        resolve(Number(written[1]));
      },
    );
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Replaces outPath with data. The zip is written beside the target first and
// then renamed over it, so an existing backup is overwritten in one step and
// is never left half-written. A read-only flag on the old file is cleared,
// and short-lived locks (OneDrive, antivirus scanners) are retried.
async function writeFileReplacing(outPath, data) {
  const dir = path.dirname(outPath);
  fs.mkdirSync(dir, { recursive: true });
  const existing = fs.statSync(outPath, { throwIfNoEntry: false });
  if (existing?.isDirectory()) throw new Error(`"${outPath}" is a folder. Choose a file name for the backup.`);

  const tempPath = path.join(dir, `.${path.basename(outPath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tempPath, data);
  } catch (err) {
    throw new Error(`Could not write to "${dir}" (${err.code || err.message}). Choose a folder you can save to, such as Desktop or Documents.`);
  }
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        if (existing) {
          try { fs.chmodSync(outPath, 0o666); } catch (err) { if (err.code !== 'ENOENT') throw err; }
        }
        fs.renameSync(tempPath, outPath);
        return Boolean(existing);
      } catch (err) {
        if (!['EBUSY', 'EPERM', 'EACCES'].includes(err.code) || attempt >= 5) {
          // A program holding the old zip open (a viewer, Explorer preview)
          // blocks the rename but may still allow writing over its contents.
          if (existing && err.code !== 'ENOENT') {
            try {
              fs.copyFileSync(tempPath, outPath);
              return true;
            } catch { /* report the original lock below */ }
          }
          throw new Error(err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES'
            ? `"${path.basename(outPath)}" could not be replaced because it is open or locked by another program. Close it (or VDI) and export again.`
            : err.message);
        }
        await delay(300 * (attempt + 1));
      }
    }
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

/**
 * Builds a VDI BioOffice backup from the bundled template (or an explicit
 * basePath, never modified) with this app's employees and attendance.
 * An existing file at outPath is overwritten.
 */
async function exportVdiBackup({ basePath = VDI_TEMPLATE_PATH, outPath, employees, punches, MDBReader }) {
  if (process.platform !== 'win32') throw new Error('Exporting a VDI backup is only available on Windows.');
  if (!/\.zip$/i.test(outPath)) throw new Error('VDI backups must be exported as a .zip file.');
  const baseBuffer = readBaseFile(basePath);
  const plan = planVdiExport({ employees, punches, base: readBase(new MDBReader(baseBuffer)) });

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zee-vdi-'));
  try {
    const mdbPath = path.join(workDir, 'base.mdb');
    const compactedPath = path.join(workDir, VDI_DB_NAME);
    fs.writeFileSync(mdbPath, baseBuffer);
    writeWorkFiles(workDir, plan);
    const written = await runJet(workDir, mdbPath, compactedPath);
    if (written !== plan.dtr.length) {
      throw new Error(`Only ${written} of ${plan.dtr.length} attendance records were written. Nothing was exported.`);
    }
    const mdb = fs.readFileSync(compactedPath);
    // Check the finished database before it replaces anything on disk.
    const saved = new MDBReader(mdb);
    const savedRows = saved.getTableNames().includes('DTR') ? saved.getTable('DTR').getData({ columns: ['EmployeeID'] }).length : -1;
    if (savedRows !== plan.dtr.length) {
      throw new Error(`The generated database holds ${Math.max(savedRows, 0)} of ${plan.dtr.length} attendance records. Nothing was exported.`);
    }
    const zip = createZip(VDI_DB_NAME, mdb);
    if (!readZipEntry(zip, (name) => name === VDI_DB_NAME)?.equals(mdb)) {
      throw new Error('The backup zip could not be verified. Nothing was exported.');
    }
    const replaced = await writeFileReplacing(outPath, zip);
    return { ...plan.stats, replaced };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

module.exports = {
  VDI_DB_NAME,
  VDI_INSTALLED_DB,
  VDI_TEMPLATE_PATH,
  defaultBackupName,
  readBase,
  planVdiExport,
  createZip,
  readZipEntry,
  exportVdiBackup,
};
