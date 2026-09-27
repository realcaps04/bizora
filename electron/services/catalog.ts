import { queryAll, queryOne, run, withTransaction } from '../database'
import { generateId } from '../security/crypto'
import { AppError, requireAuth, requirePermission, setAutoLockMinutes } from '../security/session'
import { writeAudit } from './auth'
import { COMPANY_CATEGORIES } from '../../src/data/companyCategories'
import { listSharedCatalog, syncProductQuiet } from './accountCloud'

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

function filterNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function distinctValues(companyId: string, column: string): string[] {
  return queryAll<Record<string, string>>(
    `SELECT DISTINCT ${column} AS value FROM products
     WHERE company_id = ? AND status != 'deleted' AND ${column} IS NOT NULL AND TRIM(${column}) != ''
     ORDER BY ${column}`,
    [companyId],
  ).map((row) => row.value)
}

export function listProducts(opts: {
  search?: string
  category?: string
  companyCategory?: string
  brand?: string
  supplier?: string
  productType?: string
  location?: string
  status?: string
  tax?: string
  stock?: string
  lowStock?: boolean
  sellingMin?: number | string
  sellingMax?: number | string
  purchaseMin?: number | string
  purchaseMax?: number | string
  page?: number
  pageSize?: number
  idsOnly?: boolean
} = {}) {
  const cid = companyId()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  let where = `company_id = ? AND status != 'deleted'`
  const params: unknown[] = [cid]
  if (opts.search?.trim()) {
    where += ` AND (
      name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR hsn LIKE ?
      OR brand LIKE ? OR supplier LIKE ? OR category LIKE ? OR location LIKE ? OR description LIKE ?
    )`
    const q = `%${opts.search.trim()}%`
    params.push(q, q, q, q, q, q, q, q, q)
  }
  if (opts.category) {
    where += ' AND category = ?'
    params.push(opts.category)
  }
  if (opts.companyCategory) {
    where += ' AND company_category = ?'
    params.push(opts.companyCategory)
  }
  if (opts.brand) {
    where += ' AND brand = ?'
    params.push(opts.brand)
  }
  if (opts.supplier) {
    where += ' AND supplier = ?'
    params.push(opts.supplier)
  }
  if (opts.productType) {
    where += ' AND product_type = ?'
    params.push(opts.productType)
  }
  if (opts.location) {
    where += ' AND location = ?'
    params.push(opts.location)
  }
  if (opts.status === 'active' || opts.status === 'inactive') {
    where += ' AND status = ?'
    params.push(opts.status)
  }
  if (opts.tax === 'gst') where += ' AND tax_rate > 0'
  else if (opts.tax === 'non_gst') where += ' AND tax_rate = 0'
  else if (opts.tax) {
    const rate = filterNumber(opts.tax)
    if (rate != null) {
      where += ' AND tax_rate = ?'
      params.push(rate)
    }
  }
  const stock = opts.lowStock ? 'low' : opts.stock
  if (stock === 'in') where += ' AND current_stock > 0'
  else if (stock === 'out') where += ' AND current_stock <= 0'
  else if (stock === 'low') where += ' AND current_stock <= min_stock'
  else if (stock === 'reorder') where += ' AND reorder_level > 0 AND current_stock <= reorder_level'
  const sellingMin = filterNumber(opts.sellingMin)
  const sellingMax = filterNumber(opts.sellingMax)
  const purchaseMin = filterNumber(opts.purchaseMin)
  const purchaseMax = filterNumber(opts.purchaseMax)
  if (sellingMin != null) {
    where += ' AND selling_rate >= ?'
    params.push(sellingMin)
  }
  if (sellingMax != null) {
    where += ' AND selling_rate <= ?'
    params.push(sellingMax)
  }
  if (purchaseMin != null) {
    where += ' AND purchase_rate >= ?'
    params.push(purchaseMin)
  }
  if (purchaseMax != null) {
    where += ' AND purchase_rate <= ?'
    params.push(purchaseMax)
  }
  if (opts.idsOnly) {
    const ids = queryAll<{ id: string }>(`SELECT id FROM products WHERE ${where} ORDER BY name`, params).map((row) => row.id)
    return { ids, total: ids.length, page, pageSize, rows: [], categories: [], companyCategories: [], brands: [], suppliers: [], productTypes: [], locations: [] }
  }
  const total = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM products WHERE ${where}`, params)?.c ?? 0
  const rows = queryAll(`SELECT * FROM products WHERE ${where} ORDER BY name LIMIT ? OFFSET ?`, [...params, pageSize, offset])
  return {
    rows,
    total,
    page,
    pageSize,
    categories: distinctValues(cid, 'category'),
    companyCategories: distinctValues(cid, 'company_category'),
    brands: distinctValues(cid, 'brand'),
    suppliers: distinctValues(cid, 'supplier'),
    productTypes: distinctValues(cid, 'product_type'),
    locations: distinctValues(cid, 'location'),
  }
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
  const product = queryOne(`SELECT * FROM products WHERE id = ? AND company_id = ? AND status != 'deleted'`, [id, cid])
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
  unit?: string
  companyCategory?: string
  status?: string
}) {
  const user = requirePermission('products.manage')
  const id = generateId()
  const ts = now()
  const stock = input.openingStock ?? 0
  const status = input.status === 'inactive' ? 'inactive' : 'active'
  const companyCategory = input.companyCategory?.trim() || ''
  if (companyCategory && !COMPANY_CATEGORIES.some((item) => item.name === companyCategory)) {
    throw new AppError('Choose a company category.', 'VALIDATION')
  }
  withTransaction(() => {
    run(
      `INSERT INTO products (
        id, company_id, name, sku, barcode, hsn, category, company_category,
        purchase_rate, selling_rate, tax_rate, opening_stock, current_stock, min_stock,
        brand, mrp, reorder_level, location, description, supplier, product_type, unit,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user.companyId,
        input.name.trim(),
        input.sku?.trim() || null,
        input.barcode?.trim() || null,
        input.hsn?.trim() || null,
        input.category?.trim() || null,
        companyCategory || null,
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
        input.unit?.trim() || 'Pcs',
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
  const saved = queryOne<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', [id])
  syncProductQuiet(saved)
  return saved
}

export function createProducts(items: Array<Parameters<typeof createProduct>[0]>) {
  const named = items.filter((item) => item?.name?.trim())
  if (!named.length) throw new AppError('Add at least one product name.', 'VALIDATION')
  for (const item of named) {
    const nonGst = String((item as { taxType?: string }).taxType || '').toLowerCase() === 'non_gst'
    createProduct({
      ...item,
      taxRate: nonGst ? 0 : item.taxRate ?? 0,
    })
  }
  return { count: named.length }
}

export async function listProductCatalog() {
  requirePermission('products.manage')
  const shared = await listSharedCatalog()
  const categories = [...new Set([...COMPANY_CATEGORIES.map((item) => item.name), ...shared.categories])]
  return { categories }
}

export async function importProductCatalog(companyCategory: string) {
  const user = requirePermission('products.manage')
  const label = companyCategory.trim()
  if (!label) throw new AppError('Choose a company category.', 'VALIDATION')
  const shared = await listSharedCatalog(label)
  const existing = queryAll<{ name: string; sku: string | null }>(
    `SELECT name, sku FROM products WHERE company_id = ? AND status != 'deleted'`,
    [
    user.companyId,
  ])
  const have = new Set(existing.map((row) => `${row.name.trim().toLowerCase()}|${(row.sku || '').trim().toLowerCase()}`))
  const fresh = shared.products.filter((product) => {
    const key = `${product.name.trim().toLowerCase()}|${(product.sku || '').trim().toLowerCase()}`
    return product.name.trim() && !have.has(key)
  })
  if (!fresh.length) {
    throw new AppError(
      shared.products.length
        ? 'Those products are already in this company.'
        : `No shared products are saved for ${label} yet.`,
      'NOT_FOUND',
    )
  }
  const result = createProducts(
    fresh.map((product) => ({
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      category: product.category,
      brand: product.brand,
      hsn: product.hsn,
      taxRate: product.taxType === 'non_gst' ? 0 : product.gstRate,
      purchaseRate: product.purchaseRate,
      sellingRate: product.sellingRate,
      mrp: product.mrp,
      minStock: product.minStock,
      reorderLevel: product.reorderLevel,
      description: product.description,
      supplier: product.supplier,
      productType: product.productType,
      openingStock: 0,
      status: 'active',
    })),
  )
  return { ...result, matched: shared.products.length }
}

export function updateProduct(id: string, patch: Record<string, unknown>) {
  const user = requirePermission('products.manage')
  const existing = queryOne<Record<string, unknown>>('SELECT * FROM products WHERE id = ? AND company_id = ? AND status != \'deleted\'', [id, user.companyId])
  if (!existing) throw new AppError('Product not found.', 'NOT_FOUND')

  const companyCategory = String(patch.companyCategory ?? existing.company_category ?? '').trim()
  if (companyCategory && !COMPANY_CATEGORIES.some((item) => item.name === companyCategory)) {
    throw new AppError('Choose a company category.', 'VALIDATION')
  }
  const nextStock = patch.currentStock === undefined ? Number(existing.current_stock) : Number(patch.currentStock) || 0
  const stockDelta = nextStock - Number(existing.current_stock)
  const ts = now()
  withTransaction(() => {
    run(
      `UPDATE products SET
        name = ?,
        sku = ?,
        barcode = ?,
        hsn = ?,
        category = ?,
        company_category = ?,
        purchase_rate = ?,
        selling_rate = ?,
        tax_rate = ?,
        mrp = ?,
        min_stock = ?,
        reorder_level = ?,
        current_stock = ?,
        brand = ?,
        location = ?,
        description = ?,
        supplier = ?,
        product_type = ?,
        unit = ?,
        status = ?,
        updated_at = ?
       WHERE id = ? AND company_id = ?`,
      [
        String(patch.name ?? existing.name).trim(),
        String(patch.sku ?? existing.sku ?? '').trim() || null,
        String(patch.barcode ?? existing.barcode ?? '').trim() || null,
        String(patch.hsn ?? existing.hsn ?? '').trim() || null,
        String(patch.category ?? existing.category ?? '').trim() || null,
        companyCategory || null,
        patch.purchaseRate ?? existing.purchase_rate ?? 0,
        patch.sellingRate ?? existing.selling_rate ?? 0,
        patch.taxRate ?? existing.tax_rate ?? 0,
        patch.mrp ?? existing.mrp ?? 0,
        patch.minStock ?? existing.min_stock ?? 0,
        patch.reorderLevel ?? existing.reorder_level ?? 0,
        nextStock,
        String(patch.brand ?? existing.brand ?? '').trim() || null,
        String(patch.location ?? existing.location ?? '').trim() || null,
        String(patch.description ?? existing.description ?? '').trim() || null,
        String(patch.supplier ?? existing.supplier ?? '').trim() || null,
        String(patch.productType ?? existing.product_type ?? '').trim() || null,
        String(patch.unit ?? existing.unit ?? '').trim() || 'Pcs',
        patch.status === 'inactive' ? 'inactive' : 'active',
        ts,
        id,
        user.companyId,
      ],
    )
    if (stockDelta !== 0) {
      run(
        `INSERT INTO stock_movements (id, company_id, product_id, movement_type, qty, reference_type, notes, created_by, created_at)
         VALUES (?, ?, ?, 'adjustment', ?, 'product', 'Stock updated on this account', ?, ?)`,
        [generateId(), user.companyId, id, stockDelta, user.id, ts],
      )
    }
    if (patch.sellingRate !== undefined && Number(patch.sellingRate) !== Number(existing.selling_rate)) {
      writeAudit(user.companyId, user, 'product.price_changed', 'products', id, `Price changed from ${existing.selling_rate} to ${patch.sellingRate}`)
    } else {
      writeAudit(user.companyId, user, 'product.updated', 'products', id, 'Product updated for this account')
    }
  })
  return queryOne<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', [id])
}

/** Hide the product on this company only. The shared catalog is left unchanged. */
export function deleteProduct(id: string) {
  const user = requirePermission('products.manage')
  const existing = queryOne<{ name: string }>('SELECT name FROM products WHERE id = ? AND company_id = ? AND status != \'deleted\'', [
    id,
    user.companyId,
  ])
  if (!existing) throw new AppError('Product not found.', 'NOT_FOUND')
  run(`UPDATE products SET status = 'deleted', updated_at = ? WHERE id = ? AND company_id = ?`, [now(), id, user.companyId])
  writeAudit(user.companyId, user, 'product.deleted', 'products', id, `Removed ${existing.name} from this company`)
  return true
}

export function deleteProducts(ids: string[]) {
  const user = requirePermission('products.manage')
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (!unique.length) throw new AppError('Select at least one product.', 'VALIDATION')
  const ts = now()
  let count = 0
  withTransaction(() => {
    for (const id of unique) {
      const existing = queryOne<{ name: string }>(
        `SELECT name FROM products WHERE id = ? AND company_id = ? AND status != 'deleted'`,
        [id, user.companyId],
      )
      if (!existing) continue
      run(`UPDATE products SET status = 'deleted', updated_at = ? WHERE id = ? AND company_id = ?`, [ts, id, user.companyId])
      count += 1
    }
    writeAudit(user.companyId, user, 'product.deleted', 'products', null, `Removed ${count} products from this company`)
  })
  if (!count) throw new AppError('Those products are no longer in this company.', 'NOT_FOUND')
  return { count }
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
  const saved = queryOne<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', [id])
  syncProductQuiet(saved, true)
  return saved
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
