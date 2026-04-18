export {}

declare global {
  interface Window {
    api: {
      selectDirectory: () => Promise<string | null>
      selectFiles: (filters: Electron.FileFilter[]) => Promise<string[]>
      openPath: (path: string) => Promise<void>
    }
    startup: {
      onProgress: (cb: (data: { stage: string; message: string; percent: number; log?: string }) => void) => void
      onDone: (cb: () => void) => void
      onError: (cb: (data: { message: string }) => void) => void
      retry: () => Promise<void>
    }
    electron: {
      ipcRenderer: {
        send: (channel: string, ...args: unknown[]) => void
        on: (channel: string, listener: (...args: unknown[]) => void) => void
        removeAllListeners: (channel: string) => void
      }
    }
  }
}
