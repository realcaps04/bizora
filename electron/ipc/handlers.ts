import { ipcMain, BrowserWindow } from 'electron'
import { IpcChannels } from './channels'
import { AppError, getSession, lockSession, unlockSession, shouldAutoLock } from '../security/session'
import * as auth from '../services/auth'
import * as catalog from '../services/catalog'
import * as starterCatalogs from '../services/starterCatalogs'
import * as invoices from '../services/invoices'
import * as operations from '../services/operations'
import * as reports from '../services/reports'
import * as backup from '../services/backup'
import * as googleDrive from '../services/googleDrive'
import { closeDatabase, persistNow } from '../database'
import * as appUpdate from '../services/appUpdate'

type Handler = (payload: unknown, win: BrowserWindow | null) => unknown | Promise<unknown>

function ok<T>(data: T) {
  return { ok: true as const, data }
}

function fail(error: unknown) {
  if (error instanceof AppError) {
    return { ok: false as const, error: { message: error.message, code: error.code } }
  }
  console.error('[Bizora IPC]', error)
  return {
    ok: false as const,
    error: {
      message: "Something went wrong. Please try again. If it keeps happening, check the application log.",
      code: 'INTERNAL',
      detail: error instanceof Error ? error.message : String(error),
    },
  }
}

function wrap(handler: Handler) {
  return async (event: Electron.IpcMainInvokeEvent, payload: unknown) => {
    try {
      if (shouldAutoLock()) {
        lockSession()
        event.sender.send('app:session-locked')
      }
      const win = BrowserWindow.fromWebContents(event.sender)
      const data = await handler(payload, win)
      return ok(data)
    } catch (error) {
      return fail(error)
    }
  }
}

export function registerIpcHandlers(): void {
  const map: Record<string, Handler> = {
    [IpcChannels.APP_GET_STATE]: () => {
      const session = getSession()
      return {
        hasCompany: auth.hasAnyCompany(),
        session: {
          authenticated: Boolean(session.user),
          locked: session.locked,
          hasPin: session.hasPin,
          user: session.user,
          autoLockMinutes: session.autoLockMinutes,
        },
        localMode: true,
      }
    },
    [IpcChannels.APP_LOCK]: () => {
      lockSession()
      return getSession()
    },
    [IpcChannels.APP_UNLOCK]: async (payload) => {
      const { pin } = payload as { pin: string }
      return auth.quickUnlock(pin)
    },
    [IpcChannels.APP_LOGOUT]: () => {
      auth.logout()
      return true
    },
    [IpcChannels.APP_CHECK_UPDATE]: () => appUpdate.checkForAppUpdate(),
    [IpcChannels.APP_INSTALL_UPDATE]: (_payload, win) =>
      appUpdate.installAppUpdate((percent) => win?.webContents.send('app:update-progress', percent)),
    [IpcChannels.AUTH_HAS_COMPANY]: () => auth.hasAnyCompany(),
    [IpcChannels.AUTH_LOGIN]: async (payload) => {
      const { email, password } = payload as { email: string; password: string }
      return auth.login(email, password)
    },
    [IpcChannels.AUTH_REGISTER]: async (payload) => auth.registerCompany(payload as Parameters<typeof auth.registerCompany>[0]),
    [IpcChannels.AUTH_SETUP_PIN]: async (payload) => {
      await auth.setupPin((payload as { pin: string }).pin)
      return true
    },
    [IpcChannels.AUTH_QUICK_UNLOCK]: async (payload) => auth.quickUnlock((payload as { pin: string }).pin),
    [IpcChannels.AUTH_CHANGE_PASSWORD]: async (payload) => {
      const p = payload as { currentPassword: string; newPassword: string }
      await auth.changePassword(p.currentPassword, p.newPassword)
      return true
    },
    [IpcChannels.AUTH_REQUEST_RESET]: async (payload) => {
      await auth.requestPasswordReset((payload as { email: string }).email)
      return true
    },
    [IpcChannels.AUTH_COMPLETE_RESET]: async (payload) => {
      const p = payload as { email: string; code: string; newPassword: string }
      await auth.completePasswordReset(p.email, p.code, p.newPassword)
      return true
    },
    [IpcChannels.COMPANY_GET]: () => catalog.getCompany(),
    [IpcChannels.COMPANY_UPDATE]: (payload) => {
      catalog.updateCompany(payload as Record<string, unknown>)
      return catalog.getCompany()
    },
    [IpcChannels.DASHBOARD_STATS]: () => reports.getDashboardStats(),
    [IpcChannels.CUSTOMERS_LIST]: (payload) => catalog.listCustomers((payload as object) || {}),
    [IpcChannels.CUSTOMERS_GET]: (payload) => catalog.getCustomer((payload as { id: string }).id),
    [IpcChannels.CUSTOMERS_CREATE]: (payload) => catalog.createCustomer(payload as Parameters<typeof catalog.createCustomer>[0]),
    [IpcChannels.CUSTOMERS_UPDATE]: (payload) => {
      const p = payload as { id: string } & Record<string, unknown>
      return catalog.updateCustomer(p.id, p)
    },
    [IpcChannels.CUSTOMERS_DELETE]: (payload) => {
      catalog.deleteCustomer((payload as { id: string }).id)
      return true
    },
    [IpcChannels.PRODUCTS_LIST]: (payload) => catalog.listProducts((payload as object) || {}),
    [IpcChannels.PRODUCTS_GET]: (payload) => catalog.getProduct((payload as { id: string }).id),
    [IpcChannels.PRODUCTS_CREATE]: (payload) => catalog.createProduct(payload as Parameters<typeof catalog.createProduct>[0]),
    [IpcChannels.PRODUCTS_BULK_CREATE]: (payload) =>
      catalog.createProducts((payload as { items: Parameters<typeof catalog.createProduct>[0][] }).items || []),
    [IpcChannels.PRODUCTS_CATALOG]: () => catalog.listProductCatalog(),
    [IpcChannels.PRODUCTS_IMPORT_CATALOG]: (payload) =>
      catalog.importProductCatalog((payload as { companyCategory: string }).companyCategory),
    [IpcChannels.PRODUCTS_STARTER_CATALOGS]: () => starterCatalogs.listStarterCatalogs(),
    [IpcChannels.PRODUCTS_PREVIEW_STARTER]: (payload) =>
      starterCatalogs.previewStarterCatalog((payload as { catalogId: string; search?: string; cursor?: string; pageSize?: number }) || { catalogId: '' }),
    [IpcChannels.PRODUCTS_IMPORT_STARTER]: (payload) =>
      starterCatalogs.importStarterCatalog((payload as { catalogId: string }).catalogId),
    [IpcChannels.PRODUCTS_IMPORT_CSV]: (payload) => {
      const body = payload as { companyCategory: string; csvText: string }
      return starterCatalogs.importProductsCsv(body.companyCategory, body.csvText)
    },
    [IpcChannels.PRODUCTS_UPDATE]: (payload) => {
      const p = payload as { id: string } & Record<string, unknown>
      return catalog.updateProduct(p.id, p)
    },
    [IpcChannels.PRODUCTS_DELETE]: (payload) => {
      const body = payload as { id?: string; ids?: string[] }
      if (body.ids?.length) return catalog.deleteProducts(body.ids)
      catalog.deleteProduct(body.id || '')
      return true
    },
    [IpcChannels.PRODUCTS_ADJUST_STOCK]: (payload) => {
      const p = payload as { id: string; qty: number; notes?: string }
      return catalog.adjustStock(p.id, p.qty, p.notes)
    },
    [IpcChannels.PRODUCTS_SEARCH]: (payload) => catalog.searchProducts((payload as { q: string }).q),
    [IpcChannels.INVOICES_LIST]: (payload) => invoices.listInvoices((payload as object) || {}),
    [IpcChannels.INVOICES_GET]: (payload) => invoices.getInvoice((payload as { id: string }).id),
    [IpcChannels.INVOICES_CREATE]: (payload) => invoices.createInvoice(payload as Parameters<typeof invoices.createInvoice>[0]),
    [IpcChannels.INVOICES_UPDATE]: (payload) => {
      const p = payload as { id: string } & Parameters<typeof invoices.updateInvoice>[1]
      return invoices.updateInvoice(p.id, p)
    },
    [IpcChannels.INVOICES_CANCEL]: (payload) => invoices.cancelInvoice((payload as { id: string }).id),
    [IpcChannels.INVOICES_NEXT_NUMBER]: () => invoices.nextInvoiceNumber(),
    [IpcChannels.QUOTATIONS_LIST]: (payload) => operations.listQuotations((payload as object) || {}),
    [IpcChannels.QUOTATIONS_GET]: (payload) => operations.getQuotation((payload as { id: string }).id),
    [IpcChannels.QUOTATIONS_CREATE]: (payload) =>
      operations.createQuotation(payload as Parameters<typeof operations.createQuotation>[0]),
    [IpcChannels.QUOTATIONS_UPDATE]: (payload) => {
      const p = payload as { id: string } & Parameters<typeof operations.updateQuotation>[1]
      return operations.updateQuotation(p.id, p)
    },
    [IpcChannels.QUOTATIONS_CONVERT]: (payload) => operations.convertQuotation((payload as { id: string }).id),
    [IpcChannels.QUOTATIONS_DELETE]: (payload) => {
      operations.deleteQuotation((payload as { id: string }).id)
      return true
    },
    [IpcChannels.QUOTATIONS_NEXT_NUMBER]: () => operations.nextQuotationNumber(),
    [IpcChannels.PURCHASES_LIST]: (payload) => operations.listPurchases((payload as object) || {}),
    [IpcChannels.PURCHASES_CREATE]: (payload) =>
      operations.createPurchase(payload as Parameters<typeof operations.createPurchase>[0]),
    [IpcChannels.PURCHASES_NEXT_NUMBER]: () => operations.nextPurchaseNumber(),
    [IpcChannels.EXPENSES_LIST]: (payload) => operations.listExpenses((payload as object) || {}),
    [IpcChannels.EXPENSES_CREATE]: (payload) =>
      operations.createExpense(payload as Parameters<typeof operations.createExpense>[0]),
    [IpcChannels.EXPENSES_DELETE]: (payload) => {
      operations.deleteExpense((payload as { id: string }).id)
      return true
    },
    [IpcChannels.PAYMENTS_LIST]: (payload) => invoices.listPayments((payload as object) || {}),
    [IpcChannels.PAYMENTS_CREATE]: (payload) => invoices.createPayment(payload as Parameters<typeof invoices.createPayment>[0]),
    [IpcChannels.STAFF_LIST]: () => auth.listStaff(),
    [IpcChannels.STAFF_CREATE]: async (payload) => auth.createStaff(payload as Parameters<typeof auth.createStaff>[0]),
    [IpcChannels.STAFF_UPDATE]: (payload) => {
      const p = payload as { id: string } & Parameters<typeof auth.updateStaff>[1]
      auth.updateStaff(p.id, p)
      return true
    },
    [IpcChannels.REPORTS_SALES]: (payload) => reports.reportSales((payload as object) || {}),
    [IpcChannels.REPORTS_FINANCIAL]: (payload) => reports.reportFinancial((payload as object) || {}),
    [IpcChannels.REPORTS_INVENTORY]: () => reports.reportInventory(),
    [IpcChannels.REPORTS_TAX]: (payload) => reports.reportTax((payload as object) || {}),
    [IpcChannels.BACKUP_STATUS]: () => backup.getBackupStatus(),
    [IpcChannels.BACKUP_CREATE]: async (payload) => {
      const created = await backup.createBackup()
      let drive: 'uploaded' | 'skipped' | 'off' | 'failed' = 'off'
      let driveError = ''
      try {
        drive = await googleDrive.uploadLocalBackup(created.path, created.name)
      } catch (error) {
        drive = 'failed'
        driveError = error instanceof AppError ? error.message : 'Google Drive upload failed.'
      }
      return { ...created, drive, driveError }
    },
    [IpcChannels.BACKUP_RESTORE]: async (payload, win) => {
      const p = payload as { password: string; filePath?: string }
      let filePath = p.filePath
      if (!filePath) {
        filePath = (await backup.chooseBackupFile(win)) ?? undefined
      }
      if (!filePath) return null
      const meta = await backup.inspectBackup(filePath, p.password)
      return { filePath, meta, restore: await backup.restoreBackup(filePath, p.password) }
    },
    [IpcChannels.BACKUP_CHOOSE_LOCATION]: async (_payload, win) => backup.chooseBackupLocation(win),
    [IpcChannels.BACKUP_OPEN_FOLDER]: () => backup.openBackupFolder(),
    [IpcChannels.DRIVE_STATUS]: () => googleDrive.getDriveStatus(),
    [IpcChannels.DRIVE_CONNECT]: () => googleDrive.connectDrive(),
    [IpcChannels.DRIVE_DISCONNECT]: () => googleDrive.disconnectDrive(),
    [IpcChannels.DRIVE_BACKUP]: () => googleDrive.backupToDrive(),
    [IpcChannels.DRIVE_UPLOAD_LATEST]: () => googleDrive.uploadLatestLocalBackup(),
    [IpcChannels.DRIVE_RESTORE]: (payload) => googleDrive.restoreFromDrive((payload as { fileId: string }).fileId),
    [IpcChannels.EXPORT_DATA]: (payload) => {
      const p = payload as { category: string; format?: 'csv' | 'json' }
      return backup.exportData(p.category, p.format)
    },
    [IpcChannels.SETTINGS_GET]: () => catalog.getSettings(),
    [IpcChannels.SETTINGS_UPDATE]: (payload) => {
      catalog.updateSettings(payload as Record<string, string>)
      return catalog.getSettings()
    },
    [IpcChannels.AUDIT_LIST]: (payload) => reports.listAuditLogs((payload as object) || {}),
    [IpcChannels.PRINT_INVOICE]: async (payload, win) => {
      const { id } = payload as { id: string }
      const data = invoices.getInvoice(id)
      if (!win) return data
      return data
    },
    [IpcChannels.WINDOW_MINIMIZE]: (_payload, win) => {
      win?.minimize()
      return true
    },
    [IpcChannels.WINDOW_MAXIMIZE]: (_payload, win) => {
      if (!win) return false
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
      return win.isMaximized()
    },
    [IpcChannels.WINDOW_CLOSE]: (_payload, win) => {
      win?.close()
      return true
    },
    [IpcChannels.WINDOW_IS_MAXIMIZED]: (_payload, win) => win?.isMaximized() ?? false,
  }

  for (const [channel, handler] of Object.entries(map)) {
    ipcMain.handle(channel, wrap(handler))
  }

  appOnQuit()
}

function appOnQuit() {
  // Persist on process signals from main
  process.on('exit', () => {
    try {
      persistNow()
      closeDatabase()
    } catch {
      /* ignore */
    }
  })
}
