const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  backupDatabase: () => ipcRenderer.invoke('backup-database'),
  restoreBackup: () => ipcRenderer.invoke('restore-backup'),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('set-setting', key, value),

  getKdsInfo: () => ipcRenderer.invoke('get-kds-info'),
  openKdsWindow: () => ipcRenderer.invoke('open-kds-window'),

  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  getPrinters: () => ipcRenderer.invoke('get-printers'),
  savePrinter: (printer: any) => ipcRenderer.invoke('save-printer', printer),

  getDailySummary: () => ipcRenderer.invoke('get-daily-summary'),

  getUsers: () => ipcRenderer.invoke('get-users'),
  createUser: (userData: any) => ipcRenderer.invoke('create-user', userData),
  updateUser: (id: number, userData: any) => ipcRenderer.invoke('update-user', id, userData),
  deleteUser: (id: number) => ipcRenderer.invoke('delete-user', id),

  onMenuAction: (callback: (channel: string) => void) => {
    const channels = [
      'new-order', 'quick-search', 'backup-database', 'restore-backup',
      'view-orders', 'report-daily', 'report-sales', 'report-x', 'report-z',
      'settings-business', 'settings-tax', 'settings-printer', 'settings-kitchen',
    ];
    channels.forEach((channel) => {
      ipcRenderer.on(channel, () => callback(channel));
    });
  },

  platform: process.platform,
});