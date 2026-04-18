import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:selectDirectory'),
  selectFiles: (filters: Electron.FileFilter[]): Promise<string[]> =>
    ipcRenderer.invoke('dialog:selectFiles', filters),
  openPath: (path: string): Promise<void> =>
    ipcRenderer.invoke('shell:openPath', path),
}

const startup = {
  onProgress: (cb: (data: { stage: string; message: string; percent: number; log?: string }) => void) => {
    ipcRenderer.on('startup:progress', (_, data) => cb(data))
  },
  onDone: (cb: () => void) => {
    ipcRenderer.once('startup:done', cb)
  },
  onError: (cb: (data: { message: string }) => void) => {
    ipcRenderer.once('startup:error', (_, data) => cb(data))
  },
  retry: (): Promise<void> => ipcRenderer.invoke('startup:retry'),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('startup', startup)
  } catch (e) {
    console.error(e)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
  // @ts-ignore
  window.startup = startup
}
