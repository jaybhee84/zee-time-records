const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dtrApi', {
  // Authentication
  authUserCount: () => ipcRenderer.invoke('auth-user-count'),
  authLogin: (creds) => ipcRenderer.invoke('auth-login', creds),
  authCreateUser: (creds) => ipcRenderer.invoke('auth-create-user', creds),

  // File import & PDF Export
  pickAttlogFile: () => ipcRenderer.invoke('pick-attlog-file'),
  pickUserDatFile: () => ipcRenderer.invoke('pick-userdat-file'),
  exportDtrPdf: (payload) => ipcRenderer.invoke('export-dtr-pdf', payload),
  generateDtrPdfPreview: (payload) =>
    ipcRenderer.invoke('generate-dtr-pdf-preview', payload),
  openDtrPdfExternal: (payload) =>
    ipcRenderer.invoke('open-dtr-pdf-external', payload),

  // USB Drive Detection & Raw File Reads (used for attlog.dat / user.dat / department.dat)
  getUsbDrives: () => ipcRenderer.invoke('get-usb-drives'),
  readUsbFile: (params) => ipcRenderer.invoke('read-usb-file', params),

  // Direct printing (in-app printer selection)
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printDtr: (deviceName, payload) =>
    ipcRenderer.invoke('print-dtr', { ...payload, deviceName }),

  // Hidden Print Window support — used only by PrintRenderWindow.jsx, the
  // dedicated print-only route that App.jsx renders when it detects the
  // `print=1` query flag (see main.js's createPrintWindow()).
  getPrintJobData: (jobId) => ipcRenderer.invoke('get-print-job-data', jobId),
  notifyPrintReady: (jobId) => ipcRenderer.send(`print-window-ready-${jobId}`),

  // Employee Roster
  loadEmployees: () => ipcRenderer.invoke('load-employees'),
  saveEmployees: (employees) => ipcRenderer.invoke('save-employees', employees),

  // Attendance Punches
  getPunches: (params) => ipcRenderer.invoke('get-punches', params),
  savePunches: (params) => ipcRenderer.invoke('save-punches', params),

  // Database Backup & Restore
  exportBackup: () => ipcRenderer.invoke('export-backup'),
  importBackup: () => ipcRenderer.invoke('import-backup'),
});
