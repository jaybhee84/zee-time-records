# VDI export template

`vdi-template.zip` contains `MSEEDBioOfficedb.mdb`, derived from the supplied
VDI restore archive `10 9 26.zip`. It is bundled through `electron/**/*`.

Employee, biometric, attendance, timesheet, device and audit records were
removed, and the database was compacted with Jet to remove deleted data.
The VDI schema, schedules, holidays, departments and report configuration remain.
Company and connection text settings were cleared. The template user is named
`Administrator` with a blank password; the source user's credentials are removed.

Exports copy this template, insert the app's employees and attendance, and ZIP
the resulting Access database. No VDI installation or user-selected backup is
required. Generation has been tested with the Windows Jet engine and the result
read back with mdb-reader. Restoration in VDI itself still needs validation,
including how its login screen handles the template administrator.
