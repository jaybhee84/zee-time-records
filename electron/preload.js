const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dtrApi', {
  // App Version
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Authentication
  authUserCount: () => ipcRenderer.invoke('auth-user-count'),
  authLogin: (creds) => ipcRenderer.invoke('auth-login', creds),
  authCreateUser: (creds) => ipcRenderer.invoke('auth-create-user', creds),
  authListUsers: () => ipcRenderer.invoke('auth-list-users'),
  authUpdateUser: (payload) => ipcRenderer.invoke('auth-update-user', payload),
  authDeleteUser: (target) => ipcRenderer.invoke('auth-delete-user', target),

  // File import & PDF Export
  pickAttlogFile: () => ipcRenderer.invoke('pick-attlog-file'),
  pickUserDatFile: () => ipcRenderer.invoke('pick-userdat-file'),
  exportDtrPdf: (payload) => ipcRenderer.invoke('export-dtr-pdf', payload),
  generateDtrPdfPreview: (payload) =>
    ipcRenderer.invoke('generate-dtr-pdf-preview', payload),
  openDtrPdfExternal: (payload) =>
    ipcRenderer.invoke('open-dtr-pdf-external', payload),

  // USB Drive Detection & Raw File Reads
  getUsbDrives: () => ipcRenderer.invoke('get-usb-drives'),
  readUsbFile: (params) => ipcRenderer.invoke('read-usb-file', params),

  // Direct printing
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printDtr: (deviceName, payload) =>
    ipcRenderer.invoke('print-dtr', { ...payload, deviceName }),

  // Hidden Print Window support
  getPrintJobData: (jobId) => ipcRenderer.invoke('get-print-job-data', jobId),
  notifyPrintReady: (jobId) => ipcRenderer.send(`print-window-ready-${jobId}`),

  // Employee Roster
  loadEmployees: () => ipcRenderer.invoke('load-employees'),
  saveEmployees: (employees) => ipcRenderer.invoke('save-employees', employees),

  // Custom Sub-Groups
  loadCustomSubgroups: () => ipcRenderer.invoke('load-custom-subgroups'),
  addCustomSubgroup: (payload) => ipcRenderer.invoke('add-custom-subgroup', payload),
  deleteCustomSubgroup: (id) => ipcRenderer.invoke('delete-custom-subgroup', id),

  // Attendance Punches
  getPunches: (params) => ipcRenderer.invoke('get-punches', params),
  savePunches: (params) => ipcRenderer.invoke('save-punches', params),

  // Database Backup & Restore
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),

  // Vinea (.mdb) Employee Import
  importVineaEmployees: () => ipcRenderer.invoke('import-vinea-employees'),

  // Official Time Settings
  getOfficialTime: () => ipcRenderer.invoke('get-official-time'),
  saveOfficialTime: (payload) => ipcRenderer.invoke('save-official-time', payload),

  // Attendance Log Export
  exportAttlog: (params) => ipcRenderer.invoke('export-attlog', params),

  // Local Holidays
  getHolidays: () => ipcRenderer.invoke('get-holidays'),
  saveHoliday: (payload) => ipcRenderer.invoke('save-holiday', payload),
  deleteHoliday: (id) => ipcRenderer.invoke('delete-holiday', id),
});