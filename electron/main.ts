import { app, BrowserWindow, Menu, nativeImage, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { initDatabase, closeDatabase, persistNow } from './database'
import { registerIpcHandlers } from './ipc/handlers'
import { shouldAutoLock, lockSession, restoreSession } from './security/session'
import {
  applyWindowsIdentity,
  enforceSingleInstance,
  hardenWindowNavigation,
} from './windows/compliance'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST

// Windows identity before ready — taskbar grouping, jump lists, notifications
applyWindowsIdentity()

let mainWindow: BrowserWindow | null = null

const isPrimaryInstance = enforceSingleInstance(() => mainWindow)
if (!isPrimaryInstance) {
  app.quit()
} else {
  boot()
}

function resolveAppIcon(): Electron.NativeImage | undefined {
  const candidates = [
    path.join(process.env.VITE_PUBLIC || '', 'Bizora_applogo.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../public/Bizora_applogo.png'),
    path.join(__dirname, '../dist/Bizora_applogo.png'),
  ]
  for (const file of candidates) {
    if (file && existsSync(file)) {
      const img = nativeImage.createFromPath(file)
      if (!img.isEmpty()) return img
    }
  }
  return undefined
}

function createWindow(): void {
  const icon = resolveAppIcon()
  mainWindow = new BrowserWindow({
    title: 'Bizora',
    width: 1366,
    height: 768,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    backgroundColor: '#F5F9FF',
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
    },
  })

  hardenWindowNavigation(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  setInterval(() => {
    if (shouldAutoLock()) {
      lockSession()
      mainWindow?.webContents.send('app:session-locked')
    }
  }, 15_000)
}

function boot(): void {
  Menu.setApplicationMenu(null)

  app.whenReady().then(async () => {
    try {
      await initDatabase()
      restoreSession()
      registerIpcHandlers()
      createWindow()
    } catch (error) {
      console.error('[Bizora] Failed to start:', error)
      dialog.showErrorBox(
        'Bizora could not start',
        'We could not open your local business database. If this keeps happening, restore from a backup or reinstall the application. Your data in AppData is not deleted by reinstalling.',
      )
      app.quit()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    persistNow()
    closeDatabase()
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    persistNow()
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault()
    })
  })
}
