import { app, dialog, BrowserWindow, safeStorage, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Database } from 'sql.js'

type SqlStatement = ReturnType<Database['prepare']>
import { exportRawDatabase, getDb, persistNow, queryOne, queryAll, withImportedDatabase, withTransaction } from '../database'
import { deriveBackupKey, decryptBuffer, generateId } from '../security/crypto'
import { AppError, requirePermission } from '../security/session'
import { writeAudit } from './auth'
import { getSettings } from './catalog'

const MAGIC = Buffer.from('BIZORA1')
const MAGIC_OPEN = Buffer.from('BIZORA2')

function defaultBackupDir(): string {
  const dir = path.join(app.getPath('documents'), 'Bizora', 'Backups')
  mkdirSync(dir, { recursive: true })
  return dir
}

function resolveBackupDir(): string {
  try {
    const settings = getSettings()
    if (settings.backup_location && existsSync(settings.backup_location)) {
      return settings.backup_location
    }
  } catch {
    /* not authenticated or settings unavailable */
  }
  return defaultBackupDir()
}

function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}

export function getBackupStatus() {
  const dir = resolveBackupDir()
  mkdirSync(dir, { recursive: true })
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('BusinessBackup_') && f.endsWith('.bizora'))
    .map((f) => {
      const full = path.join(dir, f)
      const st = statSync(full)
      return { name: f, path: full, size: st.size, mtime: st.mtime.toISOString() }
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime))

  return {
    location: dir,
    lastBackup: files[0] ?? null,
    backups: files.slice(0, 20),
  }
}

export async function createBackup(): Promise<{ path: string; name: string }> {
  const user = requirePermission('backup.manage')
  persistNow()
  const raw = exportRawDatabase()
  const company = queryOne<{ name: string }>('SELECT name FROM companies WHERE id = ?', [user.companyId])
  const meta = Buffer.from(
    JSON.stringify({
      app: 'Bizora',
      version: 2,
      companyId: user.companyId,
      companyName: company?.name ?? 'Business',
      createdAt: new Date().toISOString(),
      createdBy: user.name,
    }),
    'utf8',
  )
  const metaLen = Buffer.alloc(4)
  metaLen.writeUInt32BE(meta.length, 0)
  const payload = Buffer.concat([MAGIC_OPEN, metaLen, meta, raw])

  const dir = resolveBackupDir()
  mkdirSync(dir, { recursive: true })
  const name = `BusinessBackup_${stamp()}.bizora`
  const filePath = path.join(dir, name)
  writeFileSync(filePath, payload)

  writeAudit(user.companyId, user, 'backup.created', 'backup', null, `Backup created: ${name}`)
  return { path: filePath, name }
}

function backupPasswordPath(): string {
  return path.join(app.getPath('userData'), 'security', 'backup-password.bin')
}

export function rememberBackupPassword(password: string): void {
  if (!password || !safeStorage.isEncryptionAvailable()) return
  mkdirSync(path.dirname(backupPasswordPath()), { recursive: true })
  writeFileSync(backupPasswordPath(), safeStorage.encryptString(password))
}

export function readBackupPassword(): string | null {
  const file = backupPasswordPath()
  if (!existsSync(file) || !safeStorage.isEncryptionAvailable()) return null
  try {
    const password = safeStorage.decryptString(readFileSync(file))
    return password.length >= 6 ? password : null
  } catch {
    return null
  }
}

export async function openBackupFolder(): Promise<string> {
  requirePermission('backup.manage')
  const dir = resolveBackupDir()
  mkdirSync(dir, { recursive: true })
  await shell.openPath(dir)
  return dir
}

function readBackupFile(payload: Buffer, password?: string): { meta: { companyName?: string; createdAt?: string }; raw: Buffer } {
  const magic = payload.subarray(0, 7).toString()
  if (magic === 'BIZORA2') {
    const metaLen = payload.readUInt32BE(7)
    const metaStart = 11
    const meta = JSON.parse(payload.subarray(metaStart, metaStart + metaLen).toString('utf8')) as {
      companyName?: string
      createdAt?: string
    }
    return { meta, raw: payload.subarray(metaStart + metaLen) }
  }
  if (magic !== 'BIZORA1') throw new AppError('This file is not a valid Bizora backup.', 'INVALID_BACKUP')
  if (!password) throw new AppError('This older backup was saved with a password.', 'INVALID_PASSWORD')
  const saltLen = payload[7]
  const salt = payload.subarray(8, 8 + saltLen)
  const metaLen = payload.readUInt32BE(8 + saltLen)
  const metaStart = 8 + saltLen + 4
  const meta = JSON.parse(payload.subarray(metaStart, metaStart + metaLen).toString('utf8')) as {
    companyName?: string
    createdAt?: string
  }
  const key = deriveBackupKey(password, salt)
  try {
    return { meta, raw: decryptBuffer(payload.subarray(metaStart + metaLen), key) }
  } catch {
    throw new AppError('Incorrect backup password.', 'INVALID_PASSWORD')
  }
}

export async function inspectBackup(filePath: string, password?: string) {
  if (!existsSync(filePath)) throw new AppError('Backup file not found.', 'NOT_FOUND')
  return readBackupFile(readFileSync(filePath), password).meta
}

type BackupRow = Record<string, unknown>

function text(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function norm(...parts: unknown[]): string {
  return parts.map((part) => text(part).toLowerCase()).join('|')
}

function num(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function sourceRows(source: Database, sql: string): BackupRow[] {
  let stmt: SqlStatement | null = null
  try {
    stmt = source.prepare(sql)
    const rows: BackupRow[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as BackupRow)
    return rows
  } catch {
    return []
  } finally {
    stmt?.free()
  }
}

function freshId(table: string, preferred: string): string {
  const taken = preferred
    ? queryOne<{ id: string }>(`SELECT id FROM ${table} WHERE id = ?`, [preferred])
    : { id: '' }
  return taken ? generateId() : preferred
}

function bumpNextNumber(companyId: string, column: 'invoice_next' | 'quotation_next', numbers: string[]) {
  let max = 0
  for (const number of numbers) {
    const match = number.match(/(\d+)\s*$/)
    if (match) max = Math.max(max, Number(match[1]))
  }
  if (max <= 0) return
  const row = queryOne<{ n: number }>(`SELECT ${column} as n FROM companies WHERE id = ?`, [companyId])
  if (!row || Number(row.n) > max) return
  getDb().run(`UPDATE companies SET ${column} = ? WHERE id = ?`, [max + 1, companyId])
}

export async function restoreBackup(filePath: string, password?: string) {
  const user = requirePermission('backup.manage')
  const { meta, raw } = readBackupFile(readFileSync(filePath), password)
  const companyId = user.companyId
  const counts = withImportedDatabase(raw, (source) => mergeBackup(source, companyId, user.id))
  writeAudit(
    companyId,
    user,
    'backup.imported',
    'backup',
    null,
    `Imported backup from ${meta.createdAt || 'file'}. Added ${counts.added}, skipped ${counts.skipped} duplicates.`,
  )
  return { ...meta, added: counts.added, skipped: counts.skipped }
}

function mergeBackup(source: Database, companyId: string, currentUserId: string): { added: number; skipped: number } {
  let added = 0
  let skipped = 0
  const userMap = new Map<string, string>()
  const customerMap = new Map<string, string>()
  const productMap = new Map<string, string>()
  const productInserted = new Set<string>()
  const invoiceInserted = new Set<string>()
  const invoiceMap = new Map<string, string>()
  const quotationInserted = new Set<string>()
  const quotationMap = new Map<string, string>()
  const purchaseInserted = new Set<string>()
  const purchaseMap = new Map<string, string>()

  const db = getDb()
  const statements: SqlStatement[] = []
  const prepare = (sql: string) => {
    const stmt = db.prepare(sql)
    statements.push(stmt)
    return stmt
  }

  try {
    withTransaction(() => {
      const existingUsers = queryAll<{ id: string; email: string }>(
        'SELECT id, email FROM users WHERE company_id = ?',
        [companyId],
      )
      const userByEmail = new Map(existingUsers.map((row) => [text(row.email).toLowerCase(), row.id]))
      const insertUser = prepare(
        `INSERT INTO users (
          id, company_id, name, email, password_hash, role, permissions, mobile, pin_hash, pin_salt,
          is_active, last_login_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of sourceRows(source, 'SELECT * FROM users')) {
        const oldId = text(row.id)
        const email = text(row.email).toLowerCase()
        const existingId = userByEmail.get(email)
        if (!oldId || !email || !text(row.password_hash) || existingId || oldId === currentUserId) {
          if (oldId) userMap.set(oldId, existingId || currentUserId)
          skipped += 1
          continue
        }
        const role = ['owner', 'manager', 'cashier', 'staff'].includes(text(row.role)) ? text(row.role) : 'staff'
        const id = freshId('users', oldId)
        insertUser.run([
          id,
          companyId,
          text(row.name) || email,
          email,
          text(row.password_hash),
          role,
          row.permissions == null ? null : String(row.permissions),
          text(row.mobile) || null,
          row.pin_hash == null ? null : String(row.pin_hash),
          row.pin_salt == null ? null : String(row.pin_salt),
          Number(row.is_active) === 0 ? 0 : 1,
          text(row.last_login_at) || null,
          text(row.created_at) || new Date().toISOString(),
          text(row.updated_at) || new Date().toISOString(),
        ])
        userByEmail.set(email, id)
        userMap.set(oldId, id)
        added += 1
      }

      const existingCustomers = queryAll<{ id: string; name: string; phone: string | null }>(
        'SELECT id, name, phone FROM customers WHERE company_id = ?',
        [companyId],
      )
      const customerByKey = new Map(existingCustomers.map((row) => [norm(row.name, row.phone), row.id]))
      const insertCustomer = prepare(
        `INSERT INTO customers (id, company_id, name, phone, email, gstin, address, status, created_at, updated_at, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of sourceRows(source, 'SELECT * FROM customers')) {
        const oldId = text(row.id)
        const name = text(row.name)
        if (!oldId || !name) {
          skipped += 1
          continue
        }
        const existingId = customerByKey.get(norm(name, row.phone))
        if (existingId) {
          customerMap.set(oldId, existingId)
          skipped += 1
          continue
        }
        const id = freshId('customers', oldId)
        insertCustomer.run([
          id,
          companyId,
          name,
          text(row.phone) || null,
          text(row.email) || null,
          text(row.gstin) || null,
          text(row.address) || null,
          text(row.status) || 'active',
          text(row.created_at) || new Date().toISOString(),
          text(row.updated_at) || new Date().toISOString(),
          text(row.details) || null,
        ])
        customerByKey.set(norm(name, row.phone), id)
        customerMap.set(oldId, id)
        added += 1
      }

      const existingProducts = queryAll<{ id: string; name: string; sku: string | null; barcode: string | null }>(
        `SELECT id, name, sku, barcode FROM products WHERE company_id = ? AND status != 'deleted'`,
        [companyId],
      )
      const productByKey = new Map(existingProducts.map((row) => [norm(row.name, row.sku), row.id]))
      const productByBarcode = new Map<string, string>()
      for (const row of existingProducts) {
        const code = text(row.barcode).toLowerCase()
        if (code) productByBarcode.set(code, row.id)
      }
      const insertProduct = prepare(
        `INSERT INTO products (
          id, company_id, name, sku, barcode, hsn, category, company_category,
          purchase_rate, selling_rate, tax_rate, opening_stock, current_stock, min_stock,
          brand, mrp, reorder_level, location, description, supplier, product_type, unit,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of sourceRows(source, 'SELECT * FROM products')) {
        const oldId = text(row.id)
        const name = text(row.name)
        if (!oldId || !name || text(row.status) === 'deleted') {
          skipped += 1
          continue
        }
        const barcode = text(row.barcode).toLowerCase()
        const existingId = productByKey.get(norm(name, row.sku)) || (barcode ? productByBarcode.get(barcode) : undefined)
        if (existingId) {
          productMap.set(oldId, existingId)
          skipped += 1
          continue
        }
        const id = freshId('products', oldId)
        insertProduct.run([
          id,
          companyId,
          name,
          text(row.sku) || null,
          text(row.barcode) || null,
          text(row.hsn) || null,
          text(row.category) || null,
          text(row.company_category) || null,
          num(row.purchase_rate),
          num(row.selling_rate),
          num(row.tax_rate),
          num(row.opening_stock),
          num(row.current_stock),
          num(row.min_stock),
          text(row.brand) || null,
          num(row.mrp),
          num(row.reorder_level),
          text(row.location) || null,
          text(row.description) || null,
          text(row.supplier) || null,
          text(row.product_type) || null,
          text(row.unit) || null,
          text(row.status) || 'active',
          text(row.created_at) || new Date().toISOString(),
          text(row.updated_at) || new Date().toISOString(),
        ])
        productByKey.set(norm(name, row.sku), id)
        if (barcode) productByBarcode.set(barcode, id)
        productMap.set(oldId, id)
        productInserted.add(oldId)
        added += 1
      }

      const actor = (value: unknown) => userMap.get(text(value)) || currentUserId
      const existingInvoices = queryAll<{ id: string; invoice_number: string }>(
        'SELECT id, invoice_number FROM invoices WHERE company_id = ?',
        [companyId],
      )
      const invoiceByNumber = new Map(existingInvoices.map((row) => [text(row.invoice_number).toLowerCase(), row.id]))
      const insertInvoice = prepare(
        `INSERT INTO invoices (
          id, company_id, invoice_number, customer_id, customer_name, invoice_date, status, payment_status,
          payment_method, supply_type, subtotal, discount_amount, taxable_amount, cgst, sgst, igst, round_off, grand_total,
          paid_amount, notes, details, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      const addedInvoiceNumbers: string[] = []
      for (const row of sourceRows(source, 'SELECT * FROM invoices')) {
        const oldId = text(row.id)
        const number = text(row.invoice_number)
        if (!oldId || !number) {
          skipped += 1
          continue
        }
        if (invoiceByNumber.has(number.toLowerCase())) {
          skipped += 1
          continue
        }
        const customerId = customerMap.get(text(row.customer_id)) || null
        const id = freshId('invoices', oldId)
        insertInvoice.run([
          id,
          companyId,
          number,
          customerId,
          text(row.customer_name) || null,
          text(row.invoice_date) || new Date().toISOString(),
          text(row.status) || 'confirmed',
          text(row.payment_status) || 'unpaid',
          text(row.payment_method) || null,
          text(row.supply_type) || 'Business to Customer',
          num(row.subtotal),
          num(row.discount_amount),
          num(row.taxable_amount),
          num(row.cgst),
          num(row.sgst),
          num(row.igst),
          num(row.round_off),
          num(row.grand_total),
          num(row.paid_amount),
          text(row.notes) || null,
          text(row.details) || null,
          actor(row.created_by),
          text(row.created_at) || new Date().toISOString(),
          text(row.updated_at) || new Date().toISOString(),
        ])
        invoiceByNumber.set(number.toLowerCase(), id)
        invoiceInserted.add(oldId)
        invoiceMap.set(oldId, id)
        addedInvoiceNumbers.push(number)
        added += 1
      }

      const insertInvoiceItem = prepare(
        `INSERT INTO invoice_items (
          id, company_id, invoice_id, product_id, product_name, hsn, qty, rate, discount, tax_rate, tax_amount, amount, sort_order, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of sourceRows(source, 'SELECT * FROM invoice_items')) {
        const parent = text(row.invoice_id)
        const invoiceId = invoiceMap.get(parent)
        if (!invoiceInserted.has(parent) || !invoiceId || !text(row.product_name)) {
          skipped += 1
          continue
        }
        const productId = productMap.get(text(row.product_id)) || null
        insertInvoiceItem.run([
          freshId('invoice_items', text(row.id)),
          companyId,
          invoiceId,
          productId,
          text(row.product_name),
          text(row.hsn) || null,
          num(row.qty),
          num(row.rate),
          num(row.discount),
          num(row.tax_rate),
          num(row.tax_amount),
          num(row.amount),
          num(row.sort_order),
          text(row.details) || null,
        ])
        added += 1
      }

      const existingQuotations = queryAll<{ id: string; quotation_number: string }>(
        'SELECT id, quotation_number FROM quotations WHERE company_id = ?',
        [companyId],
      )
      const quotationByNumber = new Map(existingQuotations.map((row) => [text(row.quotation_number).toLowerCase(), row.id]))
      const insertQuotation = prepare(
        `INSERT INTO quotations (
          id, company_id, quotation_number, customer_id, customer_name, quotation_date, valid_until, status,
          subtotal, discount_amount, tax_amount, grand_total, notes, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      const addedQuotationNumbers: string[] = []
      for (const row of sourceRows(source, 'SELECT * FROM quotations')) {
        const oldId = text(row.id)
        const number = text(row.quotation_number)
        if (!oldId || !number || quotationByNumber.has(number.toLowerCase())) {
          skipped += 1
          continue
        }
        const id = freshId('quotations', oldId)
        insertQuotation.run([
          id,
          companyId,
          number,
          customerMap.get(text(row.customer_id)) || null,
          text(row.customer_name) || null,
          text(row.quotation_date) || new Date().toISOString(),
          text(row.valid_until) || null,
          text(row.status) || 'draft',
          num(row.subtotal),
          num(row.discount_amount),
          num(row.tax_amount),
          num(row.grand_total),
          text(row.notes) || null,
          actor(row.created_by),
          text(row.created_at) || new Date().toISOString(),
          text(row.updated_at) || new Date().toISOString(),
        ])
        quotationByNumber.set(number.toLowerCase(), id)
        quotationInserted.add(oldId)
        quotationMap.set(oldId, id)
        addedQuotationNumbers.push(number)
        added += 1
      }

      const insertQuotationItem = prepare(
        `INSERT INTO quotation_items (
          id, company_id, quotation_id, product_id, product_name, hsn, qty, rate, discount, tax_rate, amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of sourceRows(source, 'SELECT * FROM quotation_items')) {
        const parent = text(row.quotation_id)
        const quotationId = quotationMap.get(parent)
        if (!quotationInserted.has(parent) || !quotationId || !text(row.product_name)) {
          skipped += 1
          continue
        }
        insertQuotationItem.run([
          freshId('quotation_items', text(row.id)),
          companyId,
          quotationId,
          productMap.get(text(row.product_id)) || null,
          text(row.product_name),
          text(row.hsn) || null,
          num(row.qty),
          num(row.rate),
          num(row.discount),
          num(row.tax_rate),
          num(row.amount),
          num(row.sort_order),
        ])
        added += 1
      }

      const existingPurchases = queryAll<{ id: string; purchase_number: string }>(
        'SELECT id, purchase_number FROM purchases WHERE company_id = ?',
        [companyId],
      )
      const purchaseByNumber = new Map(existingPurchases.map((row) => [text(row.purchase_number).toLowerCase(), row.id]))
      const insertPurchase = prepare(
        `INSERT INTO purchases (
          id, company_id, purchase_number, supplier_name, purchase_date, subtotal, tax_amount, grand_total, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of sourceRows(source, 'SELECT * FROM purchases')) {
        const oldId = text(row.id)
        const number = text(row.purchase_number)
        if (!oldId || !number || purchaseByNumber.has(number.toLowerCase())) {
          skipped += 1
          continue
        }
        const id = freshId('purchases', oldId)
        insertPurchase.run([
          id,
          companyId,
          number,
          text(row.supplier_name) || 'Supplier',
          text(row.purchase_date) || new Date().toISOString(),
          num(row.subtotal),
          num(row.tax_amount),
          num(row.grand_total),
          text(row.notes) || null,
          actor(row.created_by),
          text(row.created_at) || new Date().toISOString(),
        ])
        purchaseByNumber.set(number.toLowerCase(), id)
        purchaseInserted.add(oldId)
        purchaseMap.set(oldId, id)
        added += 1
      }

      const insertPurchaseItem = prepare(
        `INSERT INTO purchase_items (
          id, company_id, purchase_id, product_id, product_name, qty, rate, tax_rate, amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of sourceRows(source, 'SELECT * FROM purchase_items')) {
        const parent = text(row.purchase_id)
        const purchaseId = purchaseMap.get(parent)
        const productId = productMap.get(text(row.product_id))
        if (!purchaseInserted.has(parent) || !purchaseId || !productId) {
          skipped += 1
          continue
        }
        insertPurchaseItem.run([
          freshId('purchase_items', text(row.id)),
          companyId,
          purchaseId,
          productId,
          text(row.product_name) || 'Product',
          num(row.qty),
          num(row.rate),
          num(row.tax_rate),
          num(row.amount),
        ])
        added += 1
      }

      const existingExpenses = queryAll<{ category: string; description: string | null; amount: number; expense_date: string }>(
        'SELECT category, description, amount, expense_date FROM expenses WHERE company_id = ?',
        [companyId],
      )
      const expenseKeys = new Set(existingExpenses.map((row) => norm(row.category, row.description, row.amount, row.expense_date)))
      const insertExpense = prepare(
        `INSERT INTO expenses (
          id, company_id, category, description, amount, expense_date, payment_method, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of sourceRows(source, 'SELECT * FROM expenses')) {
        const signature = norm(row.category, row.description, row.amount, row.expense_date)
        if (!text(row.category) || expenseKeys.has(signature)) {
          skipped += 1
          continue
        }
        insertExpense.run([
          freshId('expenses', text(row.id)),
          companyId,
          text(row.category),
          text(row.description) || null,
          num(row.amount),
          text(row.expense_date) || new Date().toISOString(),
          text(row.payment_method) || null,
          text(row.notes) || null,
          actor(row.created_by),
          text(row.created_at) || new Date().toISOString(),
        ])
        expenseKeys.add(signature)
        added += 1
      }

      const existingPayments = queryAll<{ invoice_id: string | null; amount: number; payment_date: string; method: string }>(
        'SELECT invoice_id, amount, payment_date, method FROM payments WHERE company_id = ?',
        [companyId],
      )
      const paymentKeys = new Set(existingPayments.map((row) => norm(row.invoice_id, row.amount, row.payment_date, row.method)))
      const insertPayment = prepare(
        `INSERT INTO payments (
          id, company_id, invoice_id, customer_id, customer_name, payment_date, method, amount, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of sourceRows(source, 'SELECT * FROM payments')) {
        const invoiceId = invoiceMap.get(text(row.invoice_id)) || null
        const signature = norm(invoiceId, row.amount, row.payment_date, row.method)
        if (!text(row.method) || paymentKeys.has(signature)) {
          skipped += 1
          continue
        }
        const localInvoice = invoiceId
          ? queryOne<{ id: string }>('SELECT id FROM invoices WHERE id = ? AND company_id = ?', [invoiceId, companyId])
          : null
        insertPayment.run([
          freshId('payments', text(row.id)),
          companyId,
          localInvoice ? invoiceId : null,
          customerMap.get(text(row.customer_id)) || null,
          text(row.customer_name) || null,
          text(row.payment_date) || new Date().toISOString(),
          text(row.method),
          num(row.amount),
          text(row.notes) || null,
          actor(row.created_by),
          text(row.created_at) || new Date().toISOString(),
        ])
        paymentKeys.add(signature)
        added += 1
      }

      const insertMovement = prepare(
        `INSERT INTO stock_movements (
          id, company_id, product_id, movement_type, qty, reference_type, reference_id, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of sourceRows(source, 'SELECT * FROM stock_movements')) {
        const sourceProduct = text(row.product_id)
        const productId = productMap.get(sourceProduct)
        if (!productInserted.has(sourceProduct) || !productId || !text(row.movement_type)) {
          skipped += 1
          continue
        }
        insertMovement.run([
          freshId('stock_movements', text(row.id)),
          companyId,
          productId,
          text(row.movement_type),
          num(row.qty),
          text(row.reference_type) || null,
          text(row.reference_id) || null,
          text(row.notes) || null,
          userMap.get(text(row.created_by)) || null,
          text(row.created_at) || new Date().toISOString(),
        ])
        added += 1
      }

      const existingSettings = new Set(
        queryAll<{ key: string }>('SELECT key FROM settings WHERE company_id = ?', [companyId]).map((row) => row.key),
      )
      const insertSetting = prepare('INSERT INTO settings (company_id, key, value) VALUES (?, ?, ?)')
      for (const row of sourceRows(source, 'SELECT * FROM settings')) {
        const key = text(row.key)
        if (!key || existingSettings.has(key)) {
          skipped += 1
          continue
        }
        insertSetting.run([companyId, key, text(row.value)])
        existingSettings.add(key)
        added += 1
      }

      bumpNextNumber(companyId, 'invoice_next', addedInvoiceNumbers)
      bumpNextNumber(companyId, 'quotation_next', addedQuotationNumbers)
    })
  } finally {
    for (const stmt of statements) stmt.free()
  }
  return { added, skipped }
}

export async function chooseBackupLocation(win: BrowserWindow | null) {
  requirePermission('backup.manage')
  const result = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'Choose Backup Location',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export async function chooseBackupFile(win: BrowserWindow | null) {
  const result = await dialog.showOpenDialog(win ?? undefined!, {
    title: 'Select Bizora Backup',
    filters: [{ name: 'Bizora Backup', extensions: ['bizora'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export function exportData(category: string, format: 'csv' | 'json' = 'csv') {
  const user = requirePermission('backup.manage')
  const cid = user.companyId
  const tables: Record<string, string> = {
    customers: 'SELECT * FROM customers WHERE company_id = ?',
    products: 'SELECT * FROM products WHERE company_id = ?',
    sales: 'SELECT * FROM invoices WHERE company_id = ?',
    invoices: 'SELECT * FROM invoices WHERE company_id = ?',
    purchases: 'SELECT * FROM purchases WHERE company_id = ?',
    expenses: 'SELECT * FROM expenses WHERE company_id = ?',
    payments: 'SELECT * FROM payments WHERE company_id = ?',
  }
  const sql = tables[category]
  if (!sql) throw new AppError('Unknown export category.', 'VALIDATION')

  const rows = queryAll(sql, [cid]) as Record<string, unknown>[]

  const dir = path.join(app.getPath('documents'), 'Bizora', 'Exports')
  mkdirSync(dir, { recursive: true })
  const name = `${category}_${stamp()}.${format === 'json' ? 'json' : 'csv'}`
  const filePath = path.join(dir, name)

  if (format === 'json') {
    writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8')
  } else if (!rows.length) {
    writeFileSync(filePath, '', 'utf8')
  } else {
    const headers = Object.keys(rows[0])
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const v = r[h]
            const s = v == null ? '' : String(v)
            return `"${s.replace(/"/g, '""')}"`
          })
          .join(','),
      ),
    ]
    writeFileSync(filePath, lines.join('\n'), 'utf8')
  }

  writeAudit(user.companyId, user, 'data.exported', 'export', null, `Exported ${category} to ${name}`)
  return { path: filePath, name }
}
