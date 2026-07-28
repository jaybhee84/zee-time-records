const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

// Maps Vinea's free-text `Department` values to the subGroup values this
// app actually filters/displays on (see TEACHING_SUBGROUPS /
// NON_TEACHING_SUBGROUPS in TimesheetPage.jsx). Keys are normalized
// (trimmed + uppercased) so casing/whitespace differences in the source
// data don't cause misses.
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
  // Not one of the app's standard subgroups — best-guess mapped to
  // "Subject Teacher" since Vinea marks these as TEACHING. Flagged back
  // to the renderer as "unmapped" so the user can confirm/adjust.
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

// Avoid GPU/compositor glitches on Windows
app.disableHardwareAcceleration();

const isDev = !app.isPackaged;
let mainWindow;
let db;
let dbPath;

// In-memory store for print job payloads (employee names + already-computed
// DTR rows + year/month), keyed by a fresh id per job. A hidden print
// window fetches its data from here via 'get-print-job-data' once it loads.
// Nothing here needs to survive an app restart, so plain in-memory is fine.
const pendingPrintJobs = new Map();

// Loads the app's normal URL/file into a given window, optionally appending
// a query string. Shared by createWindow() (the visible main window) and
// createPrintWindow() (the hidden print-only window), so both windows stay
// in sync with how the app is actually served in dev vs. packaged builds.
function loadAppInto(win, queryString = '') {
  if (isDev) {
    const url = queryString
      ? `http://localhost:5173/?${queryString}`
      : 'http://localhost:5173';
    win.loadURL(url);
  } else {
    const filePath = path.join(__dirname, '../dist/index.html');
    if (queryString) {
      win.loadFile(filePath, { search: queryString });
    } else {
      win.loadFile(filePath);
    }
  }
}

// Creates a hidden BrowserWindow whose only job is rendering CS Form 48
// print output — no sidebar, no login screen, no modals, because App.jsx
// detects the `print=1` query flag and renders ONLY <PrintRenderWindow>
// instead of the normal app shell. That's the whole point of this
// architecture: there's nothing else in this window to accidentally leak
// into a printed page, and nothing to hide via CSS classes/@media print.
function createPrintWindow(jobId) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const printWin = new BrowserWindow({
      show: true,
      width: 700,
      height: 500,
      icon: path.join(__dirname, 'assets', 'ZeeTimeRecords.ico'),
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });

    const readyChannel = `print-window-ready-${jobId}`;

    const cleanupListeners = () => {
      ipcMain.removeAllListeners(readyChannel);
    };

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanupListeners();
      printWin.destroy();
      reject(new Error('Print window timed out while rendering.'));
    }, 15000);

    ipcMain.once(readyChannel, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(printWin);
    });

    printWin.webContents.once('did-fail-load', (event, errorCode, errorDescription) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanupListeners();
      printWin.destroy();
      reject(new Error(`Print window failed to load: ${errorDescription}`));
    });

    loadAppInto(printWin, `print=1&jobId=${encodeURIComponent(jobId)}`);
  });
}

// Runs one print job end-to-end: stashes the payload where the hidden
// window can fetch it, waits for that window to signal it has finished
// rendering, hands its webContents to `captureFn` (printToPDF or print()),
// then always tears the window down and clears the stored payload —
// regardless of whether capture succeeded, so a failed job can't leak a
// hidden window or leftover data.
async function runPrintJob(printPayload, captureFn) {
  const jobId = crypto.randomUUID();
  pendingPrintJobs.set(jobId, printPayload);
  let printWin;
  try {
    printWin = await createPrintWindow(jobId);
    return await captureFn(printWin.webContents);
  } finally {
    pendingPrintJobs.delete(jobId);
    if (printWin && !printWin.isDestroyed()) printWin.destroy();
  }
}

// ---------- SQLite Database Setup (sql.js / WASM) ----------

function saveDbToDisk() {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('Failed to save SQLite database to disk:', err);
  }
}

function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function runQuery(sql, params = []) {
  db.run(sql, params);
  saveDbToDisk();
}

async function initDatabase() {
  const SQL = await initSqlJs({
    locateFile: (file) =>
      app.isPackaged
        ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file)
        : path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
  });
  const userDataPath = app.getPath('userData');

  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }

  dbPath = path.join(userDataPath, 'timesheet.db');

  // Load existing DB file from disk if present, else create new
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Initialize schema
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registryNumber TEXT UNIQUE NOT NULL,
      staffNoOnDev TEXT,
      familyName TEXT NOT NULL,
      firstName TEXT NOT NULL,
      middleInitial TEXT,
      subGroup TEXT
    );

    CREATE TABLE IF NOT EXISTS punches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pin TEXT NOT NULL,
      staffNoOnDev TEXT,
      timestamp TEXT NOT NULL,
      rawTime TEXT
    );

    CREATE TABLE IF NOT EXISTS local_holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      location TEXT DEFAULT 'Isabela City'
    );

    CREATE TABLE IF NOT EXISTS custom_subgroups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      groupName TEXT NOT NULL,
      subGroupName TEXT NOT NULL,
      UNIQUE(groupName, subGroupName)
    );

    CREATE INDEX IF NOT EXISTS idx_punches_pin_time ON punches (pin, timestamp);
    CREATE INDEX IF NOT EXISTS idx_punches_timestamp ON punches (timestamp);
  `);

  saveDbToDisk();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'assets', 'ZeeTimeRecords.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true,
    },
  });

  loadAppInto(mainWindow);
}

app.whenReady().then(async () => {
  await initDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- Application Meta IPCs ----------

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// ---------- USB Dump Import IPCs ----------

ipcMain.handle('pick-attlog-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select attlog.dat from the ZKTeco USB export',
    filters: [
      { name: 'ZKTeco Attendance Log', extensions: ['dat', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { filePath, content };
});

ipcMain.handle('pick-userdat-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select user.dat / userinfo.dat (optional — for employee names)',
    filters: [
      { name: 'ZKTeco User Info', extensions: ['dat', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { filePath, content };
});

ipcMain.handle('get-usb-drives', async () => {
  if (process.platform !== 'win32') return [];

  try {
    const { execFile } = require('child_process');
    const stdout = await new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=2" | ' +
            'Select-Object DeviceID,VolumeName | ConvertTo-Json -Compress',
        ],
        { windowsHide: true, timeout: 5000 },
        (err, out) => (err ? reject(err) : resolve(out)),
      );
    });

    if (!stdout || !stdout.trim()) return [];

    let parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed)) parsed = [parsed];

    return parsed
      .filter((d) => d.DeviceID)
      .map((d) => ({
        label: `${d.VolumeName || 'USB Drive'} (${d.DeviceID})`,
        path: `${d.DeviceID}\\`,
      }));
  } catch (err) {
    console.error('Failed to enumerate removable drives:', err);
    return [];
  }
});

ipcMain.handle('read-usb-file', async (event, { drivePath, fileName } = {}) => {
  try {
    let filePath;

    if (!drivePath || drivePath === 'file_picker') {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: `Select ${fileName}`,
        filters: [
          { name: 'ZKTeco Export', extensions: ['dat', 'txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      filePath = result.filePaths[0];
    } else {
      const exactPath = path.join(drivePath, fileName);
      if (fs.existsSync(exactPath)) {
        filePath = exactPath;
      } else {
        const entries = fs.readdirSync(drivePath);
        const target = fileName.toLowerCase();
        const matches = entries.filter((entry) =>
          entry.toLowerCase().endsWith(target),
        );
        if (matches.length === 0) return null;
        if (matches.length > 1) {
          console.warn(
            `Multiple files match "${fileName}" on ${drivePath}: ${matches.join(', ')}. Using "${matches[0]}".`,
          );
        }
        filePath = path.join(drivePath, matches[0]);
      }
    }

    const buffer = fs.readFileSync(filePath);
    return { filePath, base64: buffer.toString('base64') };
  } catch (err) {
    console.error(`Failed to read ${fileName} from USB:`, err);
    return null;
  }
});

ipcMain.handle('get-print-job-data', async (event, jobId) => {
  return pendingPrintJobs.get(jobId) || null;
});

// ---------- Local Authentication IPCs ----------

function hashPassword(password) {
  return crypto.createHash('sha256').update(password || '').digest('hex');
}

ipcMain.handle('auth-user-count', async () => {
  const row = getOne('SELECT COUNT(*) AS count FROM users');
  return row ? row.count : 0;
});

ipcMain.handle('auth-login', async (event, { username, password } = {}) => {
  const countRow = getOne('SELECT COUNT(*) AS count FROM users');
  const userCount = countRow ? countRow.count : 0;

  if (userCount === 0) {
    if (username && password) {
      runQuery('INSERT INTO users (username, passwordHash) VALUES (?, ?)', [
        username.trim(),
        hashPassword(password),
      ]);
      return { success: true, firstRun: true, username: username.trim() };
    }
    return { success: true, firstRun: true, username: 'Admin' };
  }

  const user = getOne('SELECT * FROM users WHERE username = ?', [(username || '').trim()]);
  if (!user || user.passwordHash !== hashPassword(password)) {
    return { success: false, error: 'Invalid username or password.' };
  }

  return { success: true, username: user.username };
});

ipcMain.handle('auth-create-user', async (event, { username, password } = {}) => {
  if (!username?.trim() || !password) {
    return { success: false, error: 'Username and password are required.' };
  }

  const existing = getOne('SELECT * FROM users WHERE username = ?', [username.trim()]);
  if (existing) {
    return { success: false, error: 'That username already exists.' };
  }

  runQuery('INSERT INTO users (username, passwordHash) VALUES (?, ?)', [
    username.trim(),
    hashPassword(password),
  ]);
  return { success: true };
});

ipcMain.handle('auth-list-users', async () => {
  return getAll('SELECT id, username FROM users ORDER BY username COLLATE NOCASE');
});

ipcMain.handle('auth-update-user', async (event, { id, username, password } = {}) => {
  if (id === undefined || id === null) {
    return { success: false, error: 'Missing user id.' };
  }
  if (!username?.trim()) {
    return { success: false, error: 'Username cannot be empty.' };
  }

  const existing = getOne('SELECT * FROM users WHERE username = ? AND id != ?', [
    username.trim(),
    id,
  ]);
  if (existing) {
    return { success: false, error: 'That username already exists.' };
  }

  if (password) {
    runQuery('UPDATE users SET username = ?, passwordHash = ? WHERE id = ?', [
      username.trim(),
      hashPassword(password),
      id,
    ]);
  } else {
    runQuery('UPDATE users SET username = ? WHERE id = ?', [username.trim(), id]);
  }

  return { success: true };
});

ipcMain.handle('auth-delete-user', async (event, target) => {
  const id =
    target && typeof target === 'object' ? target.id : target;

  if (id === undefined || id === null) {
    return { success: false, error: 'Missing user id.' };
  }

  const existing = getOne('SELECT * FROM users WHERE id = ?', [id]);
  if (!existing) {
    return { success: false, error: 'That account no longer exists.' };
  }

  runQuery('DELETE FROM users WHERE id = ?', [id]);
  return { success: true };
});

// ---------- Vinea (.mdb) Employee Import ----------

function importVineaPunches(reader) {
  const tableNames = reader.getTableNames();
  if (!tableNames.includes('DTR')) {
    return { punchesImported: 0, punchesSkipped: 0, punchesTableFound: false };
  }

  const dtrRows = reader.getTable('DTR').getData();

  const existing = new Set();
  getAll('SELECT pin, timestamp FROM punches').forEach((r) => {
    existing.add(`${r.pin}|${r.timestamp}`);
  });

  const insertStmt = db.prepare(
    'INSERT INTO punches (pin, staffNoOnDev, timestamp, rawTime) VALUES (?, ?, ?, ?)',
  );

  let punchesImported = 0;
  let punchesSkipped = 0;

  for (const row of dtrRows) {
    const pin = String(row.EmployeeID || '').trim();
    const dateVal = row.Date;
    const timeVal = row.Time;

    if (!pin || !(dateVal instanceof Date) || !(timeVal instanceof Date)) {
      punchesSkipped++;
      continue;
    }

    const yyyy = dateVal.getFullYear();
    const mm = String(dateVal.getMonth() + 1).padStart(2, '0');
    const dd = String(dateVal.getDate()).padStart(2, '0');

    const hh24 = timeVal.getHours();
    const min = String(timeVal.getMinutes()).padStart(2, '0');
    const sec = String(timeVal.getSeconds()).padStart(2, '0');

    const timestamp = `${yyyy}-${mm}-${dd} ${String(hh24).padStart(2, '0')}:${min}:${sec}`;
    const key = `${pin}|${timestamp}`;
    if (existing.has(key)) {
      punchesSkipped++;
      continue;
    }
    existing.add(key);

    let hh12 = hh24 % 12;
    if (hh12 === 0) hh12 = 12;
    const meridiem = hh24 >= 12 ? 'PM' : 'AM';
    const rawTime = `${hh12}:${min} ${meridiem}`;

    insertStmt.run([pin, pin, timestamp, rawTime]);
    punchesImported++;
  }

  insertStmt.free();
  saveDbToDisk();

  return { punchesImported, punchesSkipped, punchesTableFound: true };
}

ipcMain.handle('import-vinea-employees', async () => {
  const openResult = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Vinea Backup (.mdb)',
    filters: [{ name: 'Access Database', extensions: ['mdb', 'accdb'] }],
    properties: ['openFile'],
  });

  if (openResult.canceled || openResult.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const filePath = openResult.filePaths[0];

  try {
    const { default: MDBReader } = await import('mdb-reader');

    const buffer = fs.readFileSync(filePath);
    const reader = new MDBReader(buffer);

    if (!reader.getTableNames().includes('Employees')) {
      return {
        success: false,
        error: 'No "Employees" table found in this file — is this a Vinea backup?',
      };
    }

    const rows = reader.getTable('Employees').getData();

    const employees = [];
    const unmappedDepartments = new Set();
    let skippedCount = 0;

    for (const row of rows) {
      const registryNumber = String(row.EmployeeID || '').trim();
      if (!registryNumber) {
        skippedCount++;
        continue;
      }

      const rawDept = String(row.Department || '').trim();
      const { subGroup, wasMapped } = mapVineaDepartmentToSubgroup(rawDept);
      if (rawDept && !wasMapped) {
        unmappedDepartments.add(rawDept);
      }

      employees.push({
        registryNumber,
        staffNoOnDev: String(row.StaffNumber || '').trim() || registryNumber,
        familyName: String(row.Lastname || '').trim(),
        firstName: String(row.Firstname || '').trim(),
        middleInitial: String(row.Middlename || '').trim(),
        subGroup,
      });
    }

    return {
      success: true,
      employees,
      skippedCount,
      unmappedDepartments: Array.from(unmappedDepartments),
      sourceFile: path.basename(filePath),
      ...importVineaPunches(reader),
    };
  } catch (err) {
    console.error('Failed to import Vinea employees:', err);
    return { success: false, error: err.message };
  }
});

// ---------- Custom Sub-Groups ----------

ipcMain.handle('load-custom-subgroups', async () => {
  try {
    return getAll('SELECT * FROM custom_subgroups ORDER BY subGroupName ASC');
  } catch (err) {
    console.error('Failed to load custom subgroups:', err);
    return [];
  }
});

ipcMain.handle('add-custom-subgroup', async (event, { groupName, subGroupName } = {}) => {
  try {
    const trimmedGroup = String(groupName || '').trim();
    const trimmedSubGroup = String(subGroupName || '').trim();

    if (!trimmedGroup || !trimmedSubGroup) {
      return { success: false, error: 'Group and sub-group name are required.' };
    }

    db.run(
      'INSERT OR IGNORE INTO custom_subgroups (groupName, subGroupName) VALUES (?, ?)',
      [trimmedGroup, trimmedSubGroup],
    );
    saveDbToDisk();

    return {
      success: true,
      subgroups: getAll('SELECT * FROM custom_subgroups ORDER BY subGroupName ASC'),
    };
  } catch (err) {
    console.error('Failed to add custom subgroup:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-custom-subgroup', async (event, id) => {
  try {
    db.run('DELETE FROM custom_subgroups WHERE id = ?', [id]);
    saveDbToDisk();
    return {
      success: true,
      subgroups: getAll('SELECT * FROM custom_subgroups ORDER BY subGroupName ASC'),
    };
  } catch (err) {
    console.error('Failed to delete custom subgroup:', err);
    return { success: false, error: err.message };
  }
});

// ---------- Employee Roster IPCs ----------

ipcMain.handle('load-employees', async () => {
  try {
    return getAll('SELECT * FROM employees ORDER BY familyName ASC, firstName ASC');
  } catch (err) {
    console.error('Failed to load employees from SQLite:', err);
    return [];
  }
});

ipcMain.handle('save-employees', async (event, employees) => {
  try {
    const incomingRegistryNumbers = employees.map((e) => e.registryNumber);
    if (incomingRegistryNumbers.length > 0) {
      const placeholders = incomingRegistryNumbers.map(() => '?').join(', ');
      db.run(
        `DELETE FROM employees WHERE registryNumber NOT IN (${placeholders})`,
        incomingRegistryNumbers,
      );
    } else {
      db.run('DELETE FROM employees');
    }

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO employees 
      (registryNumber, staffNoOnDev, familyName, firstName, middleInitial, subGroup)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const emp of employees) {
      stmt.run([
        emp.registryNumber,
        emp.staffNoOnDev || emp.registryNumber,
        emp.familyName || '',
        emp.firstName || '',
        emp.middleInitial || '',
        emp.subGroup || '',
      ]);
    }
    stmt.free();
    saveDbToDisk();
    return true;
  } catch (err) {
    console.error('Failed to save employees to SQLite:', err);
    return false;
  }
});

// ---------- Attendance Punch IPCs ----------

ipcMain.handle('get-punches', async (event, { year, month } = {}) => {
  try {
    if (!year || !month) {
      return getAll('SELECT * FROM punches');
    }
    const monthFormatted = String(month).padStart(2, '0');
    const pattern = `${year}-${monthFormatted}-%`;
    return getAll('SELECT * FROM punches WHERE timestamp LIKE ?', [pattern]);
  } catch (err) {
    console.error('Failed to get punches:', err);
    return [];
  }
});

ipcMain.handle('save-punches', async (event, { pin, year, month, newPunches = [] } = {}) => {
  try {
    const monthFormatted = String(month).padStart(2, '0');
    const pattern = `${year}-${monthFormatted}-%`;

    // Clear existing month punches for employee
    db.run('DELETE FROM punches WHERE (pin = ? OR staffNoOnDev = ?) AND timestamp LIKE ?', [
      pin,
      pin,
      pattern,
    ]);

    // Insert new punches
    const insertStmt = db.prepare(
      'INSERT INTO punches (pin, staffNoOnDev, timestamp, rawTime) VALUES (?, ?, ?, ?)'
    );

    for (const p of newPunches) {
      insertStmt.run([p.pin, p.staffNoOnDev || p.pin, p.timestamp, p.rawTime]);
    }
    insertStmt.free();

    saveDbToDisk();
    return { success: true };
  } catch (err) {
    console.error('Failed to save punches:', err);
    return { success: false, error: err.message };
  }
});

// ---------- DTR PDF Export ----------

const DTR_PDF_OPTIONS = {
  printBackground: true,
  pageSize: 'A4',
  landscape: false,
  margins: { top: 0.3, bottom: 0.3, left: 0.3, right: 0.3 },
};

ipcMain.handle('export-dtr-pdf', async (event, payload = {}) => {
  const { employees, year, month, suggestedName } = payload;

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Save DTR as PDF',
    defaultPath: suggestedName || 'DTR.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (saveResult.canceled) return null;

  const pdfBuffer = await runPrintJob({ employees, year, month }, (wc) =>
    wc.printToPDF(DTR_PDF_OPTIONS),
  );
  fs.writeFileSync(saveResult.filePath, pdfBuffer);
  return saveResult.filePath;
});

ipcMain.handle('generate-dtr-pdf-preview', async (event, payload = {}) => {
  const { employees, year, month } = payload;
  try {
    const pdfBuffer = await runPrintJob({ employees, year, month }, (wc) =>
      wc.printToPDF(DTR_PDF_OPTIONS),
    );
    return { success: true, data: pdfBuffer.toString('base64') };
  } catch (err) {
    console.error('Failed to generate DTR PDF preview:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-dtr-pdf-external', async (event, payload = {}) => {
  const { employees, year, month, suggestedName } = payload;
  try {
    const pdfBuffer = await runPrintJob({ employees, year, month }, (wc) =>
      wc.printToPDF(DTR_PDF_OPTIONS),
    );
    const safeName = (suggestedName || 'DTR.pdf').replace(/[/\\?%*:|"<>]/g, '-');
    const tmpPath = path.join(os.tmpdir(), `${Date.now()}-${safeName}`);
    fs.writeFileSync(tmpPath, pdfBuffer);
    const openError = await shell.openPath(tmpPath);
    if (openError) {
      return { success: false, error: openError };
    }
    return { success: true, filePath: tmpPath };
  } catch (err) {
    console.error('Failed to open DTR PDF externally:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-printers', async () => {
  try {
    return await mainWindow.webContents.getPrintersAsync();
  } catch (err) {
    console.error('Failed to get printer list:', err);
    return [];
  }
});

ipcMain.handle('print-dtr', async (event, payload = {}) => {
  const { employees, year, month, deviceName } = payload;
  try {
    await runPrintJob(
      { employees, year, month },
      (wc) =>
        new Promise((resolve, reject) => {
          wc.print(
            {
              silent: true,
              printBackground: DTR_PDF_OPTIONS.printBackground,
              deviceName: deviceName || undefined,
              landscape: DTR_PDF_OPTIONS.landscape,
              pageSize: DTR_PDF_OPTIONS.pageSize,
            },
            (success, errorType) => {
              if (!success) reject(new Error(errorType || 'Print failed.'));
              else resolve();
            },
          );
        }),
    );
    return { success: true };
  } catch (err) {
    console.error('Print failed:', err);
    return { success: false, error: err.message };
  }
});

// ---------- Database Backup & Restore IPCs ----------

ipcMain.handle('export-backup', async () => {
  const today = new Date().toISOString().split('T')[0];
  const defaultFilename = `DepEd_DTR_Backup_${today}.db`;

  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Full Database Backup',
    defaultPath: defaultFilename,
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }],
  });

  if (saveResult.canceled || !saveResult.filePath) return { success: false };

  try {
    saveDbToDisk();
    const dbBuffer = fs.readFileSync(dbPath);
    fs.writeFileSync(saveResult.filePath, dbBuffer);
    return { success: true, filePath: saveResult.filePath };
  } catch (err) {
    console.error('Failed to export backup:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('import-backup', async () => {
  const openResult = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup Database File to Restore',
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }],
    properties: ['openFile'],
  });

  if (openResult.canceled || openResult.filePaths.length === 0) {
    return { success: false };
  }

  try {
    const backupFilePath = openResult.filePaths[0];
    const fileBuffer = fs.readFileSync(backupFilePath);

    const SQL = await initSqlJs();
    db = new SQL.Database(fileBuffer);

    saveDbToDisk();
    return { success: true };
  } catch (err) {
    console.error('Failed to import backup:', err);
    return { success: false, error: err.message };
  }
});