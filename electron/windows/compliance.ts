/**
 * Windows desktop compliance helpers for Bizora.
 * Aligns runtime behavior with Microsoft desktop app expectations.
 */
import { app, shell, BrowserWindow } from 'electron'

/** Stable Application User Model ID — must match electron-builder appId */
export const WINDOWS_AUMID = 'com.bizora.app'

export function applyWindowsIdentity(): void {
  if (process.platform !== 'win32') return
  // Must be set early for taskbar grouping, jump lists, and notifications
  app.setAppUserModelId(WINDOWS_AUMID)
}

/**
 * Enforce single-instance behavior (Windows desktop UX expectation).
 * Returns false when this process should exit.
 */
export function enforceSingleInstance(getMainWindow: () => BrowserWindow | null): boolean {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) return false

  app.on('second-instance', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  return true
}

/** Only allow safe external protocols (Microsoft / Chromium guidance) */
export function openExternalSafely(url: string): void {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return
    void shell.openExternal(parsed.toString())
  } catch {
    /* ignore invalid URLs */
  }
}

/**
 * Harden BrowserWindow navigation — block unexpected in-app navigations
 * and open external links in the system browser.
 */
export function hardenWindowNavigation(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const devServer = process.env.VITE_DEV_SERVER_URL
    const allowed =
      url.startsWith('file:') ||
      (devServer != null && url.startsWith(devServer)) ||
      url.startsWith('http://localhost:') ||
      url.startsWith('https://localhost:')

    if (!allowed) {
      event.preventDefault()
      openExternalSafely(url)
    }
  })
}
