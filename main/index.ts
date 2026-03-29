import { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage } from 'electron';
import * as path from 'path';
import { initDatabase, closeDatabase } from './db';
import { startServer, stopServer } from './server';
import { initPrinter, printReceipt, printKOT } from './printers/thermal';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'FloPos',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3001');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const iconPath = isDev
    ? path.join(__dirname, '../../assets/icon.png')
    : path.join(process.resourcesPath, 'assets/icon.png');

  try {
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open FloPos', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'KDS Display', click: () => openKDS() },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
    ]);

    tray.setToolTip('FloPos');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow?.show());
  } catch (err) {
    console.log('Tray icon not found, skipping tray creation');
  }
}

function openKDS(): void {
  const kdsWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'FloPos - Kitchen Display',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    kdsWindow.loadURL('http://localhost:3001/kds');
  } else {
    kdsWindow.loadFile(path.join(__dirname, '../renderer/kds.html'));
  }
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'New Order', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('new-order') },
        { label: 'Quick Search', accelerator: 'CmdOrCtrl+K', click: () => mainWindow?.webContents.send('quick-search') },
        { type: 'separator' },
        { label: 'Backup Database', click: () => mainWindow?.webContents.send('backup-database') },
        { label: 'Restore Backup', click: () => mainWindow?.webContents.send('restore-backup') },
        { type: 'separator' },
        { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => { isQuitting = true; app.quit(); } },
      ],
    },
    {
      label: 'Orders',
      submenu: [
        { label: 'View All Orders', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('view-orders') },
        { label: 'Kitchen Display', accelerator: 'CmdOrCtrl+K', click: () => openKDS() },
      ],
    },
    {
      label: 'Reports',
      submenu: [
        { label: 'Daily Summary', click: () => mainWindow?.webContents.send('report-daily') },
        { label: 'Sales Report', click: () => mainWindow?.webContents.send('report-sales') },
        { label: 'X Report', click: () => mainWindow?.webContents.send('report-x') },
        { label: 'Z Report', click: () => mainWindow?.webContents.send('report-z') },
      ],
    },
    {
      label: 'Settings',
      submenu: [
        { label: 'Business Settings', click: () => mainWindow?.webContents.send('settings-business') },
        { label: 'Tax Settings', click: () => mainWindow?.webContents.send('settings-tax') },
        { label: 'Printer Setup', click: () => mainWindow?.webContents.send('settings-printer') },
        { label: 'Kitchen Stations', click: () => mainWindow?.webContents.send('settings-kitchen') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About FloPos', click: () => showAbout() },
      ],
    },
  ];

  if (isDev) {
    template.push({
      label: 'Developer',
      submenu: [
        { label: 'Toggle DevTools', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function showAbout(): void {
  dialog.showMessageBox({
    type: 'info',
    title: 'About FloPos',
    message: 'FloPos Desktop',
    detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}\n\nA self-hosted, offline-first Point of Sale system.\nYour data stays yours.`,
  });
}

async function initialize(): Promise<void> {
  try {
    console.log('[FloPos] Initializing...');

    console.log('[FloPos] Initializing database...');
    initDatabase();

    console.log('[FloPos] Starting local server...');
    await startServer();

    console.log('[FloPos] Initializing printer...');
    await initPrinter();

    console.log('[FloPos] Registering IPC handlers...');
    registerIpcHandlers();

    console.log('[FloPos] Creating window...');
    createWindow();
    createTray();
    createMenu();

    console.log('[FloPos] Ready!');
  } catch (error) {
    console.error('[FloPos] Initialization error:', error);
    dialog.showErrorBox('Initialization Error', `Failed to start FloPos: ${error}`);
    app.quit();
  }
}

app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('quit', () => {
  console.log('[FloPos] Shutting down...');
  stopServer();
  closeDatabase();
  console.log('[FloPos] Goodbye!');
});

process.on('uncaughtException', (error) => {
  console.error('[FloPos] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FloPos] Unhandled rejection:', reason);
});