import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { runStartup, backendProcess, startupDone, startupError, startupState } from './startup'

app.setName('Clip Studio')
process.title = 'Clip Studio'

function createWindow(): BrowserWindow {
  const appIconPath = is.dev
    ? join(__dirname, '../../assets/clip-studio-logo.png')
    : join(process.resourcesPath, 'assets', 'clip-studio-logo.png')
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    title: 'Clip Studio',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0f14',
    icon: appIconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
    win.maximize()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.clipstudio.app')
  const appIconPath = is.dev
    ? join(__dirname, '../../assets/clip-studio-logo.png')
    : join(process.resourcesPath, 'assets', 'clip-studio-logo.png')
  if (process.platform === 'darwin') {
    app.dock.setIcon(nativeImage.createFromPath(appIconPath))
  }
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const win = createWindow()

  const backendDir = is.dev
    ? join(__dirname, '../../backend')
    : join(process.resourcesPath, 'backend')

  let startupPromise: Promise<void> | null = null
  const ensureStartup = async () => {
    if (!startupPromise) {
      startupPromise = runStartup(backendDir, win).finally(() => {
        startupPromise = null
      })
    }
    return startupPromise
  }

  win.webContents.on('did-finish-load', async () => {
    if (!win.isDestroyed()) {
      win.webContents.send('startup:progress', startupState)
      if (startupDone) {
        win.webContents.send('startup:done')
        return
      }
      if (startupError) {
        win.webContents.send('startup:error', { message: startupError })
      }
    }

    try {
      await ensureStartup()
      if (!win.isDestroyed()) {
        win.webContents.send('startup:done')
      }
    } catch (err: any) {
      console.error('[startup] Error:', err)
      if (!win.isDestroyed()) {
        win.webContents.send('startup:error', { message: String(err.message || err) })
      }
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  backendProcess?.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  backendProcess?.kill()
})

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('dialog:selectFiles', async (_, filters: Electron.FileFilter[]) => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('shell:openPath', async (_, path: string) => {
  shell.openPath(path)
})

ipcMain.handle('startup:retry', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  const backendDir = is.dev
    ? join(__dirname, '../../backend')
    : join(process.resourcesPath, 'backend')
  try {
    await runStartup(backendDir, win)
    win.webContents.send('startup:done')
  } catch (err: any) {
    win.webContents.send('startup:error', { message: String(err.message || err) })
  }
})

ipcMain.handle('startup:getState', async () => ({
  progress: startupState,
  done: startupDone,
  error: startupError,
}))
