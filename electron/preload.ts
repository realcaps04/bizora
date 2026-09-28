import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from './ipc/channels'

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string; code: string; detail?: string } }

function invoke<T>(channel: string, payload?: unknown): Promise<ApiResult<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<ApiResult<T>>
}

const api = {
  getState: () => invoke(IpcChannels.APP_GET_STATE),
  checkForUpdate: () => invoke<{ current: string; latest: string } | null>(IpcChannels.APP_CHECK_UPDATE),
  installUpdate: () => invoke<{ version: string }>(IpcChannels.APP_INSTALL_UPDATE),
  onUpdateProgress: (cb: (percent: number) => void) => {
    const listener = (_event: unknown, percent: number) => cb(percent)
    ipcRenderer.on('app:update-progress', listener)
    return () => ipcRenderer.removeListener('app:update-progress', listener)
  },
  lock: () => invoke(IpcChannels.APP_LOCK),
  unlock: (pin: string) => invoke(IpcChannels.APP_UNLOCK, { pin }),
  logout: () => invoke(IpcChannels.APP_LOGOUT),
  hasCompany: () => invoke<boolean>(IpcChannels.AUTH_HAS_COMPANY),
  login: (email: string, password: string) => invoke(IpcChannels.AUTH_LOGIN, { email, password }),
  register: (data: Record<string, unknown>) => invoke(IpcChannels.AUTH_REGISTER, data),
  setupPin: (pin: string) => invoke(IpcChannels.AUTH_SETUP_PIN, { pin }),
  quickUnlock: (pin: string) => invoke(IpcChannels.AUTH_QUICK_UNLOCK, { pin }),
  changePassword: (currentPassword: string, newPassword: string) =>
    invoke(IpcChannels.AUTH_CHANGE_PASSWORD, { currentPassword, newPassword }),
  requestPasswordReset: (email: string) => invoke(IpcChannels.AUTH_REQUEST_RESET, { email }),
  completePasswordReset: (email: string, code: string, newPassword: string) =>
    invoke(IpcChannels.AUTH_COMPLETE_RESET, { email, code, newPassword }),
  getCompany: () => invoke(IpcChannels.COMPANY_GET),
  updateCompany: (data: Record<string, unknown>) => invoke(IpcChannels.COMPANY_UPDATE, data),
  dashboardStats: () => invoke(IpcChannels.DASHBOARD_STATS),
  listCustomers: (opts?: Record<string, unknown>) => invoke(IpcChannels.CUSTOMERS_LIST, opts),
  getCustomer: (id: string) => invoke(IpcChannels.CUSTOMERS_GET, { id }),
  createCustomer: (data: Record<string, unknown>) => invoke(IpcChannels.CUSTOMERS_CREATE, data),
  updateCustomer: (data: Record<string, unknown>) => invoke(IpcChannels.CUSTOMERS_UPDATE, data),
  deleteCustomer: (id: string) => invoke(IpcChannels.CUSTOMERS_DELETE, { id }),
  listProducts: (opts?: Record<string, unknown>) => invoke(IpcChannels.PRODUCTS_LIST, opts),
  getProduct: (id: string) => invoke(IpcChannels.PRODUCTS_GET, { id }),
  createProduct: (data: Record<string, unknown>) => invoke(IpcChannels.PRODUCTS_CREATE, data),
  createProducts: (items: Record<string, unknown>[]) => invoke(IpcChannels.PRODUCTS_BULK_CREATE, { items }),
  listProductCatalog: () => invoke(IpcChannels.PRODUCTS_CATALOG),
  importProductCatalog: (companyCategory: string) => invoke(IpcChannels.PRODUCTS_IMPORT_CATALOG, { companyCategory }),
  listStarterCatalogs: () => invoke(IpcChannels.PRODUCTS_STARTER_CATALOGS),
  previewStarterCatalog: (catalogId: string, opts?: { search?: string; cursor?: string; pageSize?: number }) =>
    invoke(IpcChannels.PRODUCTS_PREVIEW_STARTER, { catalogId, ...opts }),
  importStarterCatalog: (catalogId: string) => invoke(IpcChannels.PRODUCTS_IMPORT_STARTER, { catalogId }),
  importProductsCsv: (companyCategory: string, csvText: string) =>
    invoke(IpcChannels.PRODUCTS_IMPORT_CSV, { companyCategory, csvText }),
  updateProduct: (data: Record<string, unknown>) => invoke(IpcChannels.PRODUCTS_UPDATE, data),
  deleteProduct: (id: string) => invoke(IpcChannels.PRODUCTS_DELETE, { id }),
  deleteProducts: (ids: string[]) => invoke(IpcChannels.PRODUCTS_DELETE, { ids }),
  adjustStock: (id: string, qty: number, notes?: string) =>
    invoke(IpcChannels.PRODUCTS_ADJUST_STOCK, { id, qty, notes }),
  searchProducts: (q: string) => invoke(IpcChannels.PRODUCTS_SEARCH, { q }),
  listInvoices: (opts?: Record<string, unknown>) => invoke(IpcChannels.INVOICES_LIST, opts),
  getInvoice: (id: string) => invoke(IpcChannels.INVOICES_GET, { id }),
  createInvoice: (data: Record<string, unknown>) => invoke(IpcChannels.INVOICES_CREATE, data),
  cancelInvoice: (id: string) => invoke(IpcChannels.INVOICES_CANCEL, { id }),
  nextInvoiceNumber: () => invoke<string>(IpcChannels.INVOICES_NEXT_NUMBER),
  listQuotations: (opts?: Record<string, unknown>) => invoke(IpcChannels.QUOTATIONS_LIST, opts),
  getQuotation: (id: string) => invoke(IpcChannels.QUOTATIONS_GET, { id }),
  createQuotation: (data: Record<string, unknown>) => invoke(IpcChannels.QUOTATIONS_CREATE, data),
  updateQuotation: (data: Record<string, unknown>) => invoke(IpcChannels.QUOTATIONS_UPDATE, data),
  convertQuotation: (id: string) => invoke(IpcChannels.QUOTATIONS_CONVERT, { id }),
  deleteQuotation: (id: string) => invoke(IpcChannels.QUOTATIONS_DELETE, { id }),
  nextQuotationNumber: () => invoke(IpcChannels.QUOTATIONS_NEXT_NUMBER),
  listPurchases: (opts?: Record<string, unknown>) => invoke(IpcChannels.PURCHASES_LIST, opts),
  createPurchase: (data: Record<string, unknown>) => invoke(IpcChannels.PURCHASES_CREATE, data),
  nextPurchaseNumber: () => invoke(IpcChannels.PURCHASES_NEXT_NUMBER),
  listExpenses: (opts?: Record<string, unknown>) => invoke(IpcChannels.EXPENSES_LIST, opts),
  createExpense: (data: Record<string, unknown>) => invoke(IpcChannels.EXPENSES_CREATE, data),
  deleteExpense: (id: string) => invoke(IpcChannels.EXPENSES_DELETE, { id }),
  listPayments: (opts?: Record<string, unknown>) => invoke(IpcChannels.PAYMENTS_LIST, opts),
  createPayment: (data: Record<string, unknown>) => invoke(IpcChannels.PAYMENTS_CREATE, data),
  listStaff: () => invoke(IpcChannels.STAFF_LIST),
  createStaff: (data: Record<string, unknown>) => invoke(IpcChannels.STAFF_CREATE, data),
  updateStaff: (data: Record<string, unknown>) => invoke(IpcChannels.STAFF_UPDATE, data),
  reportSales: (opts?: Record<string, unknown>) => invoke(IpcChannels.REPORTS_SALES, opts),
  reportFinancial: (opts?: Record<string, unknown>) => invoke(IpcChannels.REPORTS_FINANCIAL, opts),
  reportInventory: () => invoke(IpcChannels.REPORTS_INVENTORY),
  reportTax: (opts?: Record<string, unknown>) => invoke(IpcChannels.REPORTS_TAX, opts),
  backupStatus: () => invoke(IpcChannels.BACKUP_STATUS),
  createBackup: () =>
    invoke<{ name: string; path: string; drive: 'uploaded' | 'skipped' | 'off' | 'failed'; driveError: string }>(
      IpcChannels.BACKUP_CREATE,
    ),
  openBackupFolder: () => invoke<string>(IpcChannels.BACKUP_OPEN_FOLDER),
  restoreBackup: (password?: string, filePath?: string) =>
    invoke(IpcChannels.BACKUP_RESTORE, { password, filePath }),
  chooseBackupLocation: () => invoke(IpcChannels.BACKUP_CHOOSE_LOCATION),
  googleDriveStatus: () =>
    invoke<{
      configured: boolean
      connected: boolean
      email: string | null
      backups: { id: string; name: string; createdAt: string; size: number }[]
    }>(IpcChannels.DRIVE_STATUS),
  connectGoogleDrive: () => invoke<{ email: string }>(IpcChannels.DRIVE_CONNECT),
  disconnectGoogleDrive: () => invoke(IpcChannels.DRIVE_DISCONNECT),
  backupToGoogleDrive: () => invoke<{ name: string }>(IpcChannels.DRIVE_BACKUP),
  uploadLatestToGoogleDrive: () =>
    invoke<{ name: string; result: 'uploaded' | 'skipped' | 'off' }>(IpcChannels.DRIVE_UPLOAD_LATEST),
  restoreFromGoogleDrive: (fileId: string) => invoke(IpcChannels.DRIVE_RESTORE, { fileId }),
  exportData: (category: string, format?: 'csv' | 'json') =>
    invoke(IpcChannels.EXPORT_DATA, { category, format }),
  getSettings: () => invoke(IpcChannels.SETTINGS_GET),
  updateSettings: (data: Record<string, string>) => invoke(IpcChannels.SETTINGS_UPDATE, data),
  listAudit: (opts?: Record<string, unknown>) => invoke(IpcChannels.AUDIT_LIST, opts),
  printInvoice: (id: string) => invoke(IpcChannels.PRINT_INVOICE, { id }),
  windowMinimize: () => invoke(IpcChannels.WINDOW_MINIMIZE),
  windowMaximize: () => invoke(IpcChannels.WINDOW_MAXIMIZE),
  windowClose: () => invoke(IpcChannels.WINDOW_CLOSE),
  windowIsMaximized: () => invoke<boolean>(IpcChannels.WINDOW_IS_MAXIMIZED),
  onSessionLocked: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('app:session-locked', listener)
    return () => ipcRenderer.removeListener('app:session-locked', listener)
  },
}

contextBridge.exposeInMainWorld('bizora', api)

export type BizoraApi = typeof api
