import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPANY_CATEGORIES } from '../../src/data/companyCategories'
import { getDb, getMeta, queryAll, setMeta, withTransaction } from '../database'
import { generateId } from '../security/crypto'
import { AppError, requirePermission } from '../security/session'
import { listCatalogCategories, listCatalogItems, listCatalogPage } from './accountCloud'
import { writeAudit } from './auth'

export interface StarterCatalog {
  id: string
  name: string
  description: string
  file?: string
}

const CATALOG_FILES: Record<string, string> = {
  supermarkets: 'supermarket_pos_inventory_data-v2.csv',
  pharmacies: 'pharmacy_pos_inventory_data.csv',
  apparel: 'apparel_boutique_pos_inventory.csv',
  'agro-hardware': 'agro_hardware_pos_inventory.csv',
  'specialty-manufacturing': 'specialty_manufacturing_pos_inventory.csv',
  'heavy-manufacturing': 'heavy_manufacturing_pos_inventory.csv',
  restaurants: 'restaurant_food_service_pos_inventory.csv',
  cafes: 'cafe_bakery_pos_inventory.csv',
  software: 'software_development_it_pos_inventory.csv',
  'it-support': 'it_support_cybersecurity_pos_inventory.csv',
  ecommerce: 'ecommerce_online_retail_pos_inventory.csv',
  'auto-repair': 'automotive_repair_maintenance_pos_inventory.csv',
  accounting: 'accounting_tax_consultancy_pos_inventory.csv',
  'skilled-trades': 'kerala_plumbing_master_catalog_10000.csv',
}

/** Bump when Product_list changes so existing companies pick up new rows. */
const DEFAULT_PRODUCTS_VERSION = 'product-list-3'

const EXTRA_DEFAULT_FILES: Array<{ file: string; companyCategory: string }> = [
  { file: 'silpolin_tarpaulin_sheets_catalog.csv', companyCategory: 'Specialty Manufacturing' },
  { file: 'tarpaulin_master_catalog_10000.csv', companyCategory: 'Specialty Manufacturing' },
]

/** Company types shown on Bulk add. Add a CSV in public/ and set `CATALOG_FILES` when a file is ready. */
export const STARTER_CATALOGS: StarterCatalog[] = COMPANY_CATEGORIES.map((category) => ({
  ...category,
  file: CATALOG_FILES[category.id],
}))

interface CatalogRow {
  name: string
  sku: string
  barcode: string
  category: string
  hsn: string
  taxRate: number
  purchaseRate: number
  sellingRate: number
  openingStock: number
}

const countCache = new Map<string, number>()

function catalogFile(fileName: string): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const roots = [
    process.env.VITE_PUBLIC || '',
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), 'dist'),
    path.join(here, '../public'),
    path.join(here, '../dist'),
    app.isReady() ? path.join(app.getAppPath(), 'public') : '',
    app.isReady() ? path.join(app.getAppPath(), 'dist') : '',
  ].filter(Boolean)
  const candidates = roots.flatMap((root) => [
    path.join(root, 'Product_list', fileName),
    path.join(root, fileName),
  ])
  return candidates.find((file) => existsSync(file)) ?? null
}

function defaultProductSources(): Array<{ file: string; companyCategory: string }> {
  const fromCategories = COMPANY_CATEGORIES.flatMap((category) => {
    const file = CATALOG_FILES[category.id]
    return file ? [{ file, companyCategory: category.name }] : []
  })
  return [...fromCategories, ...EXTRA_DEFAULT_FILES]
}

/** Insert every bundled Product_list row that this company does not already have. */
export function ensureDefaultProducts(companyId: string): number {
  const key = `default_products:${companyId}`
  if (getMeta(key) === DEFAULT_PRODUCTS_VERSION) return 0
  const sources = defaultProductSources()
  if (!sources.some((source) => catalogFile(source.file))) return 0

  const existing = queryAll<{ name: string; sku: string | null }>(
    `SELECT name, sku FROM products WHERE company_id = ? AND status != 'deleted'`,
    [companyId],
  )
  const have = new Set(existing.map((row) => `${row.name.trim().toLowerCase()}|${(row.sku || '').trim().toLowerCase()}`))
  const ts = new Date().toISOString()
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO products (
      id, company_id, name, sku, barcode, hsn, category, company_category,
      purchase_rate, selling_rate, tax_rate, opening_stock, current_stock, min_stock,
      brand, mrp, reorder_level, location, description, supplier, product_type, unit,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 0, 0, NULL, NULL, NULL, NULL, 'Pcs', 'active', ?, ?)`,
  )
  let count = 0
  let parsed = 0
  try {
    withTransaction(() => {
      for (const source of sources) {
        const rows = readCatalogRows(source.file)
        parsed += rows.length
        for (const row of rows) {
          const identity = `${row.name.toLowerCase()}|${row.sku.toLowerCase()}`
          if (have.has(identity)) continue
          have.add(identity)
          stmt.run([
            generateId(),
            companyId,
            row.name,
            row.sku || null,
            row.barcode || null,
            row.hsn || null,
            row.category || null,
            source.companyCategory,
            row.purchaseRate,
            row.sellingRate,
            row.taxRate,
            ts,
            ts,
          ])
          count += 1
        }
      }
    })
  } finally {
    stmt.free()
  }
  if (parsed > 0 && sources.every((source) => catalogFile(source.file))) setMeta(key, DEFAULT_PRODUCTS_VERSION)
  return count
}

export function ensureDefaultProductsForAllCompanies(): void {
  const companies = queryAll<{ id: string }>('SELECT id FROM companies')
  for (const company of companies) ensureDefaultProducts(company.id)
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

export function parseProductCsv(text: string): CatalogRow[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'))
  const at = (names: string[]) => headers.findIndex((header) => names.includes(header))
  if (at(['name', 'product', 'product_name']) < 0) return []
  const rows: CatalogRow[] = []
  const seen = new Set<string>()
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    const pick = (names: string[]) => {
      const position = at(names)
      return position >= 0 ? cells[position] || '' : ''
    }
    const name = pick(['name', 'product', 'product_name']).trim()
    if (!name) continue
    const sku = pick(['sku', 'code', 'product_code']).trim()
    const key = `${name.toLowerCase()}|${sku.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const taxRaw = pick(['tax_type', 'taxtype', 'gst_type']).toLowerCase()
    const rate = Number(pick(['gst_rate', 'gst', 'tax_rate', 'tax'])) || 0
    const exempt = taxRaw.includes('exempt') || taxRaw.includes('non') || rate <= 0
    rows.push({
      name,
      sku,
      barcode: pick(['barcode']).trim(),
      category: pick(['category']).trim(),
      hsn: pick(['hsn', 'hsn_code']).trim(),
      taxRate: exempt ? 0 : rate,
      purchaseRate: Number(pick(['purchase_rate', 'purchase', 'cost'])) || 0,
      sellingRate: Number(pick(['selling_rate', 'sale_rate', 'sale', 'price'])) || 0,
      openingStock: Number(pick(['opening_stock', 'stock', 'qty', 'quantity'])) || 0,
    })
  }
  return rows
}

function readCatalogRows(fileName: string): CatalogRow[] {
  const file = catalogFile(fileName)
  if (!file) return []
  return parseProductCsv(readFileSync(file, 'utf8'))
}

export async function previewStarterCatalog(opts: { catalogId: string; search?: string; cursor?: string; pageSize?: number }) {
  requirePermission('products.manage')
  const catalog = STARTER_CATALOGS.find((item) => item.id === opts.catalogId)
  const remote = await listCatalogCategories()
  const category = remote.find((item) => item.key === opts.catalogId)
  if (!catalog && !category) throw new AppError('Choose a company category.', 'VALIDATION')
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 40))
  const search = (opts.search || '').trim().toLowerCase()
  const toProduct = (row: { name: string; sku: string; category: string; purchaseRate: number; sellingRate: number; taxType: string; gstRate: number }) => ({
    name: row.name,
    sku: row.sku,
    category: row.category,
    purchaseRate: row.purchaseRate,
    sellingRate: row.sellingRate,
    taxRate: row.taxType === 'non_gst' ? 0 : row.gstRate || 0,
  })
  if (search) {
    const matches = []
    let cursor = ''
    let isDone = false
    while (matches.length < pageSize && !isDone) {
      const page = await listCatalogPage(opts.catalogId, { cursor, limit: 200 })
      for (const row of page.items) {
        if (`${row.name} ${row.sku} ${row.category}`.toLowerCase().includes(search)) matches.push(row)
        if (matches.length >= pageSize) break
      }
      cursor = page.cursor
      isDone = page.isDone || !page.cursor
    }
    return {
      id: opts.catalogId,
      name: category?.name || catalog?.name || '',
      total: matches.length,
      cursor: '',
      isDone: true,
      products: matches.map(toProduct),
    }
  }
  const page = await listCatalogPage(opts.catalogId, { cursor: opts.cursor, limit: pageSize })
  return {
    id: opts.catalogId,
    name: category?.name || catalog?.name || '',
    total: category?.productCount || page.items.length,
    cursor: page.cursor,
    isDone: page.isDone,
    products: page.items.map(toProduct),
  }
}

export async function listStarterCatalogs() {
  requirePermission('products.manage')
  try {
    const categories = await listCatalogCategories()
    if (categories.length) {
      return categories.map((category) => ({
        id: category.key,
        name: category.name,
        description: category.description,
        ready: category.productCount > 0,
        productCount: category.productCount,
      }))
    }
  } catch {
    /* Bundled files still show a count when Convex is offline. */
  }
  return STARTER_CATALOGS.map((catalog) => {
    const fileReady = Boolean(catalog.file && catalogFile(catalog.file))
    let productCount = 0
    if (fileReady && catalog.file) {
      const cached = countCache.get(catalog.file)
      if (cached != null) productCount = cached
      else {
        productCount = readCatalogRows(catalog.file).length
        countCache.set(catalog.file, productCount)
      }
    }
    return {
      id: catalog.id,
      name: catalog.name,
      description: catalog.description,
      ready: productCount > 0,
      productCount,
    }
  })
}

async function catalogRows(catalog: StarterCatalog): Promise<CatalogRow[]> {
  try {
    const remote = await listCatalogItems(catalog.id)
    if (remote.length) {
      return remote.map((product) => ({
        name: product.name.trim(),
        sku: (product.sku || '').trim(),
        barcode: product.barcode || '',
        category: product.category || '',
        hsn: product.hsn || '',
        taxRate: product.taxType === 'non_gst' ? 0 : product.gstRate || 0,
        purchaseRate: product.purchaseRate || 0,
        sellingRate: product.sellingRate || 0,
        openingStock: product.openingStock || 0,
      }))
    }
  } catch {
    /* The bundled file can still be imported when the shared catalog is offline. */
  }
  return catalog.file && catalogFile(catalog.file) ? readCatalogRows(catalog.file) : []
}

export async function importStarterCatalog(catalogId: string) {
  const user = requirePermission('products.manage')
  const catalog = STARTER_CATALOGS.find((item) => item.id === catalogId)
  if (!catalog) throw new AppError('Choose a company category.', 'VALIDATION')
  const rows = await catalogRows(catalog)
  if (!rows.length) throw new AppError(`No products are saved for ${catalog.name} yet.`, 'NOT_FOUND')

  const existing = queryAll<{ name: string; sku: string | null }>(
    `SELECT name, sku FROM products WHERE company_id = ? AND status != 'deleted'`,
    [
    user.companyId,
  ])
  const have = new Set(existing.map((row) => `${row.name.trim().toLowerCase()}|${(row.sku || '').trim().toLowerCase()}`))
  const fresh = rows.filter((row) => !have.has(`${row.name.toLowerCase()}|${row.sku.toLowerCase()}`))
  if (!fresh.length) {
    throw new AppError('Those products are already in this company.', 'NOT_FOUND')
  }

  const ts = new Date().toISOString()
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO products (
      id, company_id, name, sku, barcode, hsn, category, company_category,
      purchase_rate, selling_rate, tax_rate, opening_stock, current_stock, min_stock,
      brand, mrp, reorder_level, location, description, supplier, product_type, unit,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, 0, NULL, NULL, NULL, NULL, 'Pcs', 'active', ?, ?)`,
  )
  const movement = db.prepare(
    `INSERT INTO stock_movements (id, company_id, product_id, movement_type, qty, reference_type, notes, created_by, created_at)
     VALUES (?, ?, ?, 'opening', ?, 'product', 'Opening stock', ?, ?)`,
  )
  try {
    withTransaction(() => {
      for (const row of fresh) {
        const id = generateId()
        const stock = Number.isFinite(row.openingStock) ? row.openingStock : 0
        stmt.run([
          id,
          user.companyId,
          row.name,
          row.sku || null,
          row.barcode || null,
          row.hsn || null,
          row.category || null,
          catalog.name,
          row.purchaseRate,
          row.sellingRate,
          row.taxRate,
          stock,
          stock,
          ts,
          ts,
        ])
        if (stock !== 0) movement.run([generateId(), user.companyId, id, stock, user.id, ts])
      }
      writeAudit(
        user.companyId,
        user,
        'product.imported',
        'products',
        null,
        `Imported ${fresh.length} products from ${catalog.name}`,
      )
    })
  } finally {
    stmt.free()
    movement.free()
  }
  return { count: fresh.length, skipped: rows.length - fresh.length, name: catalog.name }
}

export async function importProductsCsv(companyCategoryId: string, csvText: string) {
  const user = requirePermission('products.manage')
  const catalog = COMPANY_CATEGORIES.find((item) => item.id === companyCategoryId || item.name === companyCategoryId)
  if (!catalog) throw new AppError('Choose a company category.', 'VALIDATION')
  const rows = parseProductCsv(csvText || '')
  if (!rows.length) throw new AppError('The CSV has no products. The first row needs a name column.', 'VALIDATION')

  const existing = queryAll<{ name: string; sku: string | null }>(
    `SELECT name, sku FROM products WHERE company_id = ? AND status != 'deleted'`,
    [user.companyId],
  )
  const have = new Set(existing.map((row) => `${row.name.trim().toLowerCase()}|${(row.sku || '').trim().toLowerCase()}`))
  const fresh = rows.filter((row) => !have.has(`${row.name.toLowerCase()}|${row.sku.toLowerCase()}`))
  if (!fresh.length) throw new AppError('Those products are already in this company.', 'NOT_FOUND')

  const ts = new Date().toISOString()
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO products (
      id, company_id, name, sku, barcode, hsn, category, company_category,
      purchase_rate, selling_rate, tax_rate, opening_stock, current_stock, min_stock,
      brand, mrp, reorder_level, location, description, supplier, product_type, unit,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, 0, NULL, NULL, NULL, NULL, 'Pcs', 'active', ?, ?)`,
  )
  const movement = db.prepare(
    `INSERT INTO stock_movements (id, company_id, product_id, movement_type, qty, reference_type, notes, created_by, created_at)
     VALUES (?, ?, ?, 'opening', ?, 'product', 'Opening stock', ?, ?)`,
  )
  try {
    withTransaction(() => {
      for (const row of fresh) {
        const id = generateId()
        const stock = Number.isFinite(row.openingStock) ? row.openingStock : 0
        stmt.run([
          id,
          user.companyId,
          row.name,
          row.sku || null,
          row.barcode || null,
          row.hsn || null,
          row.category || null,
          catalog.name,
          row.purchaseRate,
          row.sellingRate,
          row.taxRate,
          stock,
          stock,
          ts,
          ts,
        ])
        if (stock !== 0) movement.run([generateId(), user.companyId, id, stock, user.id, ts])
      }
      writeAudit(
        user.companyId,
        user,
        'product.imported',
        'products',
        null,
        `Imported ${fresh.length} products from CSV into ${catalog.name}`,
      )
    })
  } finally {
    stmt.free()
    movement.free()
  }
  return { count: fresh.length, skipped: rows.length - fresh.length, name: catalog.name }
}
