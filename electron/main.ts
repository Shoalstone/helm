import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

// IPC handlers for file system operations
ipcMain.handle('get-user-data-path', async () => {
  return app.getPath('userData');
});

ipcMain.handle('join-path', async (_, ...parts: string[]) => {
  return path.join(...parts);
});

ipcMain.handle('read-file', async (_, filePath: string) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error: any) {
    throw new Error(error.message);
  }
});

ipcMain.handle('write-file', async (_, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error: any) {
    throw new Error(error.message);
  }
});

ipcMain.handle('read-dir', async (_, dirPath: string) => {
  try {
    return fs.readdirSync(dirPath);
  } catch (error: any) {
    throw new Error(error.message);
  }
});

ipcMain.handle('exists', async (_, filePath: string) => {
  return fs.existsSync(filePath);
});

ipcMain.handle('mkdir', async (_, dirPath: string) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  } catch (error: any) {
    throw new Error(error.message);
  }
});

ipcMain.handle('stat', async (_, filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtime: stats.mtime,
    };
  } catch (error: any) {
    throw new Error(error.message);
  }
});

ipcMain.handle('rmdir', async (_, dirPath: string) => {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  } catch (error: any) {
    throw new Error(error.message);
  }
});

ipcMain.handle('show-save-dialog', async (_, options: {
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}) => {
  if (!mainWindow) {
    throw new Error('No window available');
  }

  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Branch',
    defaultPath: options.defaultPath,
    filters: options.filters || [{ name: 'Text Files', extensions: ['txt'] }],
  });

  return result.filePath; // Returns undefined if cancelled
});

ipcMain.handle('show-open-dialog', async (_, options: {
  filters?: { name: string; extensions: string[] }[];
  properties?: string[];
}) => {
  if (!mainWindow) {
    throw new Error('No window available');
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open File',
    filters: options.filters || [{ name: 'JSON Files', extensions: ['json'] }],
    properties: (options.properties || ['openFile']) as any,
  });

  return result.filePaths[0]; // Returns undefined if cancelled
});

// Window control IPC handlers
ipcMain.handle('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('window-is-fullscreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

// Create a minimal menu that doesn't conflict with our custom shortcuts
function createMenu() {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [];

  // macOS-specific app menu
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  // File menu
  template.push({
    label: 'File',
    submenu: [
      isMac
        ? { label: 'Close Window', accelerator: 'CmdOrCtrl+W', role: 'close' }
        : { label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
    ]
  });

  // Edit menu (macOS needs this for copy/paste to work properly in some contexts)
  if (isMac) {
    template.push({
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    });
  }

  // View menu
  template.push({
    label: 'View',
    submenu: [
      { label: 'Toggle Fullscreen', accelerator: 'F11', role: 'togglefullscreen' },
      { type: 'separator' },
      { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', role: 'toggleDevTools' }
    ]
  });

  // Window menu (macOS)
  if (isMac) {
    template.push({
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  // Set up minimal menu that doesn't conflict with our shortcuts
  createMenu();

  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 10, y: 6 } : undefined,
    icon: path.join(__dirname, '../build/icons/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableBlinkFeatures: 'LocalFonts',
    },
  });

  // Maximize window to full screen size
  mainWindow.maximize();

  // Hide menu bar completely on Windows/Linux (macOS keeps the menu bar in the system)
  if (process.platform !== 'darwin') {
    mainWindow.setMenuBarVisibility(false);
  }

  // Listen for maximize/unmaximize events to notify the renderer
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximized', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximized', false);
  });

  // Listen for fullscreen events to notify the renderer
  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window-fullscreen', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window-fullscreen', false);
  });

  if (isDev) {
    // Vite's dev server injects this env var when available
    const devServerUrl = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
