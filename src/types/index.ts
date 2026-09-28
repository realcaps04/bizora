export type Role = 'owner' | 'manager' | 'cashier' | 'staff'

export interface SessionUser {
  id: string
  companyId: string
  email: string
  name: string
  role: Role
  permissions: string[]
}

export interface ApiError {
  message: string
  code: string
  detail?: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

export interface Customer {
  id: string
  company_id: string
  name: string
  phone?: string
  email?: string
  gstin?: string
  address?: string
  status: string
  total_purchases?: number
  outstanding?: number
}

export interface Product {
  id: string
  company_id: string
  name: string
  sku?: string
  barcode?: string
  hsn?: string
  category?: string
  purchase_rate: number
  selling_rate: number
  tax_rate: number
  opening_stock: number
  current_stock: number
  min_stock: number
  status: string
  unit?: string
}

export interface Invoice {
  id: string
  invoice_number: string
  customer_id?: string
  customer_name?: string
  invoice_date: string
  status: string
  payment_status: string
  payment_method?: string
  subtotal: number
  discount_amount: number
  taxable_amount: number
  cgst: number
  sgst: number
  igst: number
  round_off: number
  grand_total: number
  paid_amount: number
  notes?: string
  created_by_name?: string
  item_count?: number
}

export interface BizoraApi {
  getState: () => Promise<ApiResult<unknown>>
  checkForUpdate: () => Promise<
    ApiResult<{ current: string; latest: string; available: boolean; reachable: boolean }>
  >
  installUpdate: () => Promise<ApiResult<{ version: string }>>
  onUpdateProgress?: (cb: (percent: number) => void) => () => void
  lock: () => Promise<ApiResult<unknown>>
  unlock: (pin: string) => Promise<ApiResult<unknown>>
  logout: () => Promise<ApiResult<unknown>>
  hasCompany: () => Promise<ApiResult<boolean>>
  login: (email: string, password: string) => Promise<ApiResult<unknown>>
  register: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  setupPin: (pin: string) => Promise<ApiResult<unknown>>
  quickUnlock: (pin: string) => Promise<ApiResult<unknown>>
  changePassword: (currentPassword: string, newPassword: string) => Promise<ApiResult<unknown>>
  requestPasswordReset: (email: string) => Promise<ApiResult<unknown>>
  completePasswordReset: (email: string, code: string, newPassword: string) => Promise<ApiResult<unknown>>
  getCompany: () => Promise<ApiResult<unknown>>
  updateCompany: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  dashboardStats: () => Promise<ApiResult<unknown>>
  listCustomers: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  getCustomer: (id: string) => Promise<ApiResult<unknown>>
  createCustomer: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  updateCustomer: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  deleteCustomer: (id: string) => Promise<ApiResult<unknown>>
  listProducts: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  getProduct: (id: string) => Promise<ApiResult<unknown>>
  createProduct: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  createProducts: (items: Record<string, unknown>[]) => Promise<ApiResult<unknown>>
  listProductCatalog: () => Promise<ApiResult<unknown>>
  importProductCatalog: (companyCategory: string) => Promise<ApiResult<unknown>>
  listStarterCatalogs: () => Promise<ApiResult<unknown>>
  previewStarterCatalog: (catalogId: string, opts?: { search?: string; cursor?: string; pageSize?: number }) => Promise<ApiResult<unknown>>
  importStarterCatalog: (catalogId: string) => Promise<ApiResult<unknown>>
  importProductsCsv: (companyCategory: string, csvText: string) => Promise<ApiResult<unknown>>
  updateProduct: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  deleteProduct: (id: string) => Promise<ApiResult<unknown>>
  deleteProducts: (ids: string[]) => Promise<ApiResult<unknown>>
  adjustStock: (id: string, qty: number, notes?: string) => Promise<ApiResult<unknown>>
  searchProducts: (q: string) => Promise<ApiResult<unknown>>
  listInvoices: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  getInvoice: (id: string) => Promise<ApiResult<unknown>>
  createInvoice: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  cancelInvoice: (id: string) => Promise<ApiResult<unknown>>
  nextInvoiceNumber: () => Promise<ApiResult<string>>
  listQuotations: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  getQuotation: (id: string) => Promise<ApiResult<unknown>>
  createQuotation: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  updateQuotation: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  convertQuotation: (id: string) => Promise<ApiResult<unknown>>
  deleteQuotation: (id: string) => Promise<ApiResult<unknown>>
  nextQuotationNumber: () => Promise<ApiResult<unknown>>
  listPurchases: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  createPurchase: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  nextPurchaseNumber: () => Promise<ApiResult<unknown>>
  listExpenses: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  createExpense: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  deleteExpense: (id: string) => Promise<ApiResult<unknown>>
  listPayments: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  createPayment: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  listStaff: () => Promise<ApiResult<unknown>>
  createStaff: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  updateStaff: (data: Record<string, unknown>) => Promise<ApiResult<unknown>>
  reportSales: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  reportFinancial: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  reportInventory: () => Promise<ApiResult<unknown>>
  reportTax: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  backupStatus: () => Promise<ApiResult<unknown>>
  createBackup: () => Promise<
    ApiResult<{ name: string; path: string; drive: 'uploaded' | 'skipped' | 'off' | 'failed'; driveError: string }>
  >
  openBackupFolder: () => Promise<ApiResult<string>>
  restoreBackup: (password?: string, filePath?: string) => Promise<ApiResult<unknown>>
  chooseBackupLocation: () => Promise<ApiResult<unknown>>
  googleDriveStatus: () => Promise<
    ApiResult<{
      configured: boolean
      connected: boolean
      email: string | null
      backups: { id: string; name: string; createdAt: string; size: number }[]
    }>
  >
  connectGoogleDrive: () => Promise<ApiResult<{ email: string }>>
  disconnectGoogleDrive: () => Promise<ApiResult<unknown>>
  backupToGoogleDrive: () => Promise<ApiResult<{ name: string }>>
  uploadLatestToGoogleDrive: () => Promise<ApiResult<{ name: string; result: 'uploaded' | 'skipped' | 'off' }>>
  restoreFromGoogleDrive: (fileId: string) => Promise<ApiResult<unknown>>
  exportData: (category: string, format?: 'csv' | 'json') => Promise<ApiResult<unknown>>
  getSettings: () => Promise<ApiResult<unknown>>
  updateSettings: (data: Record<string, string>) => Promise<ApiResult<unknown>>
  listAudit: (opts?: Record<string, unknown>) => Promise<ApiResult<unknown>>
  printInvoice: (id: string) => Promise<ApiResult<unknown>>
  windowMinimize: () => Promise<ApiResult<unknown>>
  windowMaximize: () => Promise<ApiResult<unknown>>
  windowClose: () => Promise<ApiResult<unknown>>
  windowIsMaximized: () => Promise<ApiResult<boolean>>
  onSessionLocked?: (cb: () => void) => () => void
}

declare global {
  interface Window {
    bizora: BizoraApi
  }
}

export {}
