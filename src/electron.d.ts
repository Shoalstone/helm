export interface ElectronAPI {
  getUserDataPath: () => Promise<string>;
  joinPath: (...parts: string[]) => Promise<string>;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  readDir: (dirPath: string) => Promise<string[]>;
  exists: (filePath: string) => Promise<boolean>;
  mkdir: (dirPath: string) => Promise<boolean>;
  stat: (filePath: string) => Promise<{
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    mtime: Date;
  }>;
  rmdir: (dirPath: string) => Promise<boolean>;
  showSaveDialog: (options: {
    defaultPath?: string;
    filters?: { name: string; extensions: string[] }[];
  }) => Promise<string | undefined>;
  showOpenDialog: (options: {
    filters?: { name: string; extensions: string[] }[];
    properties?: string[];
  }) => Promise<string | undefined>;

  // Window controls
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  windowIsFullscreen: () => Promise<boolean>;
  getPlatform: () => Promise<string>;
  onWindowMaximized: (callback: (isMaximized: boolean) => void) => void;
  onWindowFullscreen: (callback: (isFullscreen: boolean) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
