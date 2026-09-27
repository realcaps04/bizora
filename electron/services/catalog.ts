import { queryAll, queryOne, run, withTransaction } from '../database'
import { generateId } from '../security/crypto'
import { AppError, requireAuth, requirePermission, setAutoLockMinutes } from '../security/session'
import { writeAudit } from './auth'

function now(): string {
  return new Date().toISOString()
}

function companyId(): string {
  return requireAuth().companyId
}

// ─── Company ───────────────────────────────────────────────

export function getCompany(): Record<string, unknown> | null {
  const user = requireAuth()
  return queryOne('SELECT * FROM companies WHERE id = ?', [user.companyId])
}

export function updateCompany(patch: Record<string, unknown>): void {
  const user = requirePermission('company.manage')
  const allowed = ['name', 'owner_name', 'email', 'mobile', 'address', 'gstin', 'business_type', 'currency', 'tax_mode', 'invoice_prefix', 'quotation_prefix', 'default_payment_methods'] as const
  const sets: string[] = []
  const vals: unknown[] = []
  for (const key of allowed) {
    if (key in patch) {
      sets.push(`${key} = ?`)
      vals.push(patch[key])
    }
  }
  if (!sets.length) return
  sets.push('updated_at = ?')
  vals.push(now(), user.companyId)
  run(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`, vals)
  writeAudit(user.companyId, user, 'company.updated', 'company', user.companyId, 'Company profile updated')
}

// ─── Customers ─────────────────────────────────────────────

export function listCustomers(opts: { search?: string; page?: number; pageSize?: number } = {}) {
  const cid = companyId()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  const search = opts.search?.trim()

  let where = 'c.company_id = ?'
  const params: unknown[] = [cid]
  if (search) {
    where += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.gstin LIKE ?)'
    const q = `%${search}%`
    params.push(q, q, q, q)
  }

  const total = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM customers c WHERE ${where}`, params)?.c ?? 0
  const rows = queryAll(
    `SELECT c.*,
      COALESCE((SELECT SUM(grand_total) FROM invoices i WHERE i.customer_id = c.id AND i.company_id = c.company_id AND i.status != 'cancelled'), 0) as total_purchases,
      COALESCE((SELECT SUM(grand_total - paid_amount) FROM invoices i WHERE i.customer_id = c.id AND i.company_id = c.company_id AND i.status != 'cancelled'), 0) as outstanding
     FROM customers c
     WHERE ${where}
     ORDER BY c.name
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )
  return { rows, total, page, pageSize }
}

export function getCustomer(id: string) {
  const cid = companyId()
  const customer = queryOne('SELECT * FROM customers WHERE id = ? AND company_id = ?', [id, cid])
  if (!customer) throw new AppError('Customer not found.', 'NOT_FOUND')
  const invoices = queryAll(
    `SELECT id, invoice_number, invoice_date, grand_total, payment_status, status
     FROM invoices WHERE customer_id = ? AND company_id = ? ORDER BY invoice_date DESC LIMIT 50`,
    [id, cid],
  )
  const payments = queryAll(
    `SELECT id, payment_date, method, amount FROM payments WHERE customer_id = ? AND company_id = ? ORDER BY payment_date DESC LIMIT 50`,
    [id, cid],
  )
  const stats = queryOne<{ total_sales: number; paid: number; outstanding: number }>(
    `SELECT
      COALESCE(SUM(grand_total),0) as total_sales,
      COALESCE(SUM(paid_amount),0) as paid,
      COALESCE(SUM(grand_total - paid_amount),0) as outstanding
     FROM invoices WHERE customer_id = ? AND company_id = ? AND status != 'cancelled'`,
    [id, cid],
  )
  return { customer, invoices, payments, stats }
}

export function createCustomer(input: {
  name: string
  phone?: string
  email?: string
  gstin?: string
  address?: string
}) {
  const user = requirePermission('customers.manage')
  const id = generateId()
  const ts = now()
  run(
    `INSERT INTO customers (id, company_id, name, phone, email, gstin, address, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [id, user.companyId, input.name.trim(), input.phone ?? null, input.email ?? null, input.gstin ?? null, input.address ?? null, ts, ts],
  )
  writeAudit(user.companyId, user, 'customer.created', 'customers', id, `Customer ${input.name} created`)
  return queryOne('SELECT * FROM customers WHERE id = ?', [id])
}

export function updateCustomer(id: string, patch: Record<string, unknown>) {
  const user = requirePermission('customers.manage')
  const existing = queryOne('SELECT id FROM customers WHERE id = ? AND company_id = ?', [id, user.companyId])
  if (!existing) throw new AppError('Customer not found.', 'NOT_FOUND')
  run(
    `UPDATE customers SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      gstin = COALESCE(?, gstin),
      address = COALESCE(?, address),
      status = COALESCE(?, status),
      updated_at = ?
     WHERE id = ? AND company_id = ?`,
    [
      patch.name ?? null,
      patch.phone ?? null,
      patch.email ?? null,
      patch.gstin ?? null,
      patch.address ?? null,
      patch.status ?? null,
      now(),
      id,
      user.companyId,
    ],
  )
  writeAudit(user.companyId, user, 'customer.updated', 'customers', id, 'Customer updated')
  return queryOne('SELECT * FROM customers WHERE id = ?', [id])
}

export function deleteCustomer(id: string) {
  const user = requirePermission('customers.delete')
  const existing = queryOne('SELECT name FROM customers WHERE id = ? AND company_id = ?', [id, user.companyId])
  if (!existing) throw new AppError('Customer not found.', 'NOT_FOUND')
  run(`UPDATE customers SET status = 'inactive', updated_at = ? WHERE id = ? AND company_id = ?`, [now(), id, user.companyId])
  writeAudit(user.companyId, user, 'customer.deleted', 'customers', id, `Customer ${(existing as { name: string }).name} deactivated`)
}

// ─── Products ──────────────────────────────────────────────

export function listProducts(opts: { search?: string; category?: string; lowStock?: boolean; page?: number; pageSize?: number } = {}) {
  const cid = companyId()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  let where = 'company_id = ?'
  const params: unknown[] = [cid]
  if (opts.search?.trim()) {
    where += ' AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)'
    const q = `%${opts.search.trim()}%`
    params.push(q, q, q)
  }
  if (opts.category) {
    where += ' AND category = ?'
    params.push(opts.category)
  }
  if (opts.lowStock) {
    where += ' AND current_stock <= min_stock'
  }
  const total = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM products WHERE ${where}`, params)?.c ?? 0
  const rows = queryAll(`SELECT * FROM products WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`, [...params, pageSize, offset])
  return { rows, total, page, pageSize }
}

export function searchProducts(q: string) {
  const cid = companyId()
  const term = q.trim()
  if (!term) return []
  return queryAll(
    `SELECT * FROM products
     WHERE company_id = ? AND status = 'active'
       AND (barcode = ? OR sku = ? OR name LIKE ?)
     ORDER BY
       CASE WHEN barcode = ? THEN 0 WHEN sku = ? THEN 1 ELSE 2 END,
       name
     LIMIT 20`,
    [cid, term, term, `%${term}%`, term, term],
  )
}

export function getProduct(id: string) {
  const cid = companyId()
  const product = queryOne('SELECT * FROM products WHERE id = ? AND company_id = ?', [id, cid])
  if (!product) throw new AppError('Product not found.', 'NOT_FOUND')
  return product
}

export function createProduct(input: {
  name: string
  sku?: string
  barcode?: string
  hsn?: string
  category?: string
  purchaseRate?: number
  sellingRate?: number
  taxRate?: number
  openingStock?: number
  minStock?: number
  brand?: string
  mrp?: number
  reorderLevel?: number
  location?: string
  description?: string
  supplier?: string
  productType?: string
  status?: string
}) {
  const user = requirePermission('products.manage')
  const id = generateId()
  const ts = now()
  const stock = input.openingStock ?? 0
  const status = input.status === 'inactive' ? 'inactive' : 'active'
  withTransaction(() => {
    run(
      `INSERT INTO products (
        id, company_id, name, sku, barcode, hsn, category,
        purchase_rate, selling_rate, tax_rate, opening_stock, current_stock, min_stock,
        brand, mrp, reorder_level, location, description, supplier, product_type,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user.companyId,
        input.name.trim(),
        input.sku?.trim() || null,
        input.barcode?.trim() || null,
        input.hsn?.trim() || null,
        input.category?.trim() || null,
        input.purchaseRate ?? 0,
        input.sellingRate ?? 0,
        input.taxRate ?? 0,
        stock,
        stock,
        input.minStock ?? 0,
        input.brand?.trim() || null,
        input.mrp ?? 0,
        input.reorderLevel ?? 0,
        input.location?.trim() || null,
        input.description?.trim() || null,
        input.supplier?.trim() || null,
        input.productType?.trim() || null,
        status,
        ts,
        ts,
      ],
    )
    if (stock !== 0) {
      run(
        `INSERT INTO stock_movements (id, company_id, product_id, movement_type, qty, reference_type, notes, created_by, created_at)
         VALUES (?, ?, ?, 'opening', ?, 'product', 'Opening stock', ?, ?)`,
        [generateId(), user.companyId, id, stock, user.id, ts],
      )
    }
    writeAudit(user.companyId, user, 'product.created', 'products', id, `Product ${input.name} created`)
  })
  return queryOne('SELECT * FROM products WHERE id = ?', [id])
}

export function updateProduct(id: string, patch: Record<string, unknown>) {
  const user = requirePermission('products.manage')
  const existing = queryOne<Record<string, unknown>>('SELECT * FROM products WHERE id = ? AND company_id = ?', [id, user.companyId])
  if (!existing) throw new AppError('Product not found.', 'NOT_FOUND')

  run(
    `UPDATE products SET
      name = COALESCE(?, name),
      sku = COALESCE(?, sku),
      barcode = COALESCE(?, barcode),
      hsn = COALESCE(?, hsn),
      category = COALESCE(?, category),
      purchase_rate = COALESCE(?, purchase_rate),
      selling_rate = COALESCE(?, selling_rate),
      tax_rate = COALESCE(?, tax_rate),
      min_stock = COALESCE(?, min_stock),
      status = COALESCE(?, status),
      updated_at = ?
     WHERE id = ? AND company_id = ?`,
    [
      patch.name ?? null,
      patch.sku ?? null,
      patch.barcode ?? null,
      patch.hsn ?? null,
      patch.category ?? null,
      patch.purchaseRate ?? null,
      patch.sellingRate ?? null,
      patch.taxRate ?? null,
      patch.minStock ?? null,
      patch.status ?? null,
      now(),
      id,
      user.companyId,
    ],
  )

  if (patch.sellingRate !== undefined && patch.sellingRate !== existing.selling_rate) {
    writeAudit(user.companyId, user, 'product.price_changed', 'products', id, `Price changed from ${existing.selling_rate} to ${patch.sellingRate}`)
  } else {
    writeAudit(user.companyId, user, 'product.updated', 'products', id, 'Product updated')
  }
  return queryOne('SELECT * FROM products WHERE id = ?', [id])
}

export function adjustStock(id: string, qty: number, notes?: string) {
  const user = requirePermission('products.manage')
  const product = queryOne<{ current_stock: number; name: string }>('SELECT current_stock, name FROM products WHERE id = ? AND company_id = ?', [
    id,
    user.companyId,
  ])
  if (!product) throw new AppError('Product not found.', 'NOT_FOUND')
  const ts = now()
  withTransaction(() => {
    run('UPDATE products SET current_stock = current_stock + ?, updated_at = ? WHERE id = ? AND company_id = ?', [
      qty,
      ts,
      id,
      user.companyId,
    ])
    run(
      `INSERT INTO stock_movements (id, company_id, product_id, movement_type, qty, reference_type, notes, created_by, created_at)
       VALUES (?, ?, ?, 'adjustment', ?, 'adjustment', ?, ?, ?)`,
      [generateId(), user.companyId, id, qty, notes ?? 'Stock adjustment', user.id, ts],
    )
    writeAudit(user.companyId, user, 'stock.adjusted', 'products', id, `Stock adjusted by ${qty} for ${product.name}`)
  })
  return queryOne('SELECT * FROM products WHERE id = ?', [id])
}

// ─── Settings ──────────────────────────────────────────────

export function getSettings(): Record<string, string> {
  const user = requireAuth()
  const rows = queryAll<{ key: string; value: string }>('SELECT key, value FROM settings WHERE company_id = ?', [user.companyId])
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function updateSettings(patch: Record<string, string>) {
  const user = requirePermission('settings.manage')
  for (const [key, value] of Object.entries(patch)) {
    run('INSERT OR REPLACE INTO settings (company_id, key, value) VALUES (?, ?, ?)', [user.companyId, key, String(value)])
  }
  if (patch.auto_lock_minutes != null) {
    setAutoLockMinutes(Number(patch.auto_lock_minutes) || 0)
  }
  writeAudit(user.companyId, user, 'settings.updated', 'settings', null, 'Settings updated')
}
