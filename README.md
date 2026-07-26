# DepEd DTR Generator (ZKTeco USB import)

Imports a ZKTeco USB flash-disk attendance dump (`attlog.dat`) and generates
CSC Form 48 style Daily Time Records, exportable to PDF.

## How the USB export works

On your ZKTeco device: **Menu → USB → Download → USB Disk Download**, then
plug the flash drive into the device (some models have it reversed —
download *to* the drive). This writes `attlog.dat` to the root of the drive
(or sometimes inside a folder named after the device serial number).
Some models also export `user.dat` / `userinfo.dat` with employee names.

Plug that same drive into your PC and point the app at the file.

## Setup

```bash
npm install
npm run electron:dev
```

This starts Vite (renderer) and Electron together. `concurrently` and
`wait-on` handle the startup ordering.

To build an installer:

```bash
npm run electron:build
```

## Login

A login screen now gates the app (`src/components/Login.jsx`). Accounts are
stored locally in `authUsers.json` under Electron's `userData` folder,
SHA-256 hashed (same approach as `deped-bmi-app`).

- **First run** (no accounts saved yet): the username/password fields are
  optional. Clicking through with them blank logs you straight in. If you
  *do* type a username/password on that first login, it's saved as the
  first account — future launches will require it.
- **After that**: normal login is enforced against the saved account(s).

This only gates the app UI itself — it isn't tied to Supabase auth or your
BMI app's session system, since this is a separate local tool. Let me know
if you'd rather it share login with the BMI app's Supabase `profiles` table
instead of its own local store.

## Layout

The app now has a sidebar with two sections:

- **Employees** (`src/components/EmployeesPage.jsx`) — search by family or
  first name, add/edit/remove employees via a modal
  (`EmployeeFormModal.jsx`). Each employee has:
  - **Registry Number** — a custom ID you assign per employee. This is the
    field that links them to the biometric device: it must match their
    enrolled ID (PIN) on the ZKTeco unit 1-to-1. It's locked after creation
    since changing it would silently break that link — remove and re-add
    if it needs to change.
  - Family Name, First Name, Middle Initial (optional)
  - Group: Teaching / Nonteaching
  - Sub-Group: Kinder to Grade 6, SPED, Departmental, Subject Teachers, Admin

- **Attendance / DTR** (`src/components/AttendancePage.jsx`) — same import
  and DTR generation flow as before, now matching punches to employees via
  Registry Number instead of a raw PIN.

Employee data is stored the same way as before (`employees.json` under
Electron's `userData` folder) — just with a richer shape now.

## App flow

1. **Import attlog.dat** — file picker, parses every punch into
   `{ pin, datetime, status, verify }`.
2. **Import user.dat (optional)** — auto-fills employee names if your model
   exports them. Otherwise, add names manually in the Employee Roster panel
   (PIN comes from the log; you type the name once and it's saved for future
   imports, stored via `electron`'s `userData` path so it survives restarts).
3. **Select employee + month/year** — the app pairs punches into AM/PM
   arrival/departure using a noon cutoff (see `src/utils/dtrCalculator.js`
   for the reasoning — this is the standard, most robust way to build a DTR
   from raw punches since ZKTeco's in/out status flag isn't reliable across
   models).
4. **Export PDF** — uses Electron's `printToPDF` on the rendered DTR sheet.

## Known variables to double check on your actual hardware

- **Field order/delimiter in `attlog.dat`**: the parser assumes tab-delimited
  `PIN, datetime, status, verify, ...` (the common format), with a
  whitespace-based fallback. If your model exports differently, drop a
  sample line here and I'll adjust the regex.
- **Undertime columns**: currently blank placeholders in the DTR table —
  wire in your DepEd office hours (e.g. 8:00–12:00, 1:00–5:00) once you
  confirm the official cutoffs, and I can add automatic undertime
  calculation.
- **Multiple devices/schools**: if Basilan SDO schools all have separate
  ZKTeco units, the roster and DTR logic here works per-import; let me know
  if you want a device/school selector like your BMI app's school binding.
