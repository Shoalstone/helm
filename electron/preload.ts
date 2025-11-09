import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // File system operations
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
  joinPath: (...parts: string[]) => ipcRenderer.invoke('join-path', ...parts),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  readDir: (dirPath: string) => ipcRenderer.invoke('read-dir', dirPath),
  exists: (filePath: string) => ipcRenderer.invoke('exists', filePath),
  mkdir: (dirPath: string) => ipcRenderer.invoke('mkdir', dirPath),
  stat: (filePath: string) => ipcRenderer.invoke('stat', filePath),
  rmdir: (dirPath: string) => ipcRenderer.invoke('rmdir', dirPath),
  showSaveDialog: (options: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options: {
    filters?: { name: string; extensions: string[] }[];
    properties?: string[];
  }) => ipcRenderer.invoke('show-open-dialog', options),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  windowIsFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  onWindowMaximized: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on('window-maximized', (_, isMaximized) => callback(isMaximized));
  },
  onWindowFullscreen: (callback: (isFullscreen: boolean) => void) => {
    ipcRenderer.on('window-fullscreen', (_, isFullscreen) => callback(isFullscreen));
  },
});
