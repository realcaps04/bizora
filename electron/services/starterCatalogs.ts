import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { COMPANY_CATEGORIES } from '../../src/data/companyCategories'
import { getDb, queryAll, withTransaction } from '../database'
import { generateId } from '../security/crypto'
import { AppError, requirePermission } from '../security/session'
import { listSharedCatalog } from './accountCloud'
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
  'specialty-manufacturing': 'specialty_manufacturing_pos_inventory.csv',
  'heavy-manufacturing': 'heavy_manufacturing_pos_inventory.csv',
  restaurants: 'restaurant_food_service_pos_inventory.csv',
  cafes: 'cafe_bakery_pos_inventory.csv',
  software: 'software_development_it_pos_inventory.csv',
  ecommerce: 'ecommerce_online_retail_pos_inventory.csv',
  accounting: 'accounting_tax_consultancy_pos_inventory.csv',
}

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
}

const countCache = new Map<string, number>()

function catalogFile(fileName: string): string | null {
  const candidates = [
    process.env.VITE_PUBLIC ? path.join(process.env.VITE_PUBLIC, fileName) : '',
    path.join(process.cwd(), 'public', fileName),
    path.join(process.cwd(), 'dist', fileName),
  ].filter(Boolean)
  return candidates.find((file) => existsSync(file)) ?? null
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

function readCatalogRows(fileName: string): CatalogRow[] {
  const file = catalogFile(fileName)
  if (!file) return []
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'))
  const at = (names: string[]) => headers.findIndex((header) => names.includes(header))
  const nameAt = at(['name', 'product', 'product_name'])
  if (nameAt < 0) return []
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
    })
  }
  return rows
}

const rowCache = new Map<string, CatalogRow[]>()

export async function previewStarterCatalog(opts: { catalogId: string; search?: string; page?: number; pageSize?: number }) {
  requirePermission('products.manage')
  const catalog = STARTER_CATALOGS.find((item) => item.id === opts.catalogId)
  if (!catalog) throw new AppError('Choose a company category.', 'VALIDATION')
  let rows = rowCache.get(catalog.id)
  if (!rows) {
    rows = await catalogRows(catalog)
    rowCache.set(catalog.id, rows)
  }
  const query = (opts.search || '').trim().toLowerCase()
  const matched = query
    ? rows.filter((row) => `${row.name} ${row.sku} ${row.category}`.toLowerCase().includes(query))
    : rows
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 40))
  const page = Math.max(1, opts.page ?? 1)
  const start = (page - 1) * pageSize
  return {
    id: catalog.id,
    name: catalog.name,
    total: matched.length,
    page,
    pageSize,
    products: matched.slice(start, start + pageSize).map((row) => ({
      name: row.name,
      sku: row.sku,
      category: row.category,
      purchaseRate: row.purchaseRate,
      sellingRate: row.sellingRate,
      taxRate: row.taxRate,
    })),
  }
}

export async function listStarterCatalogs() {
  requirePermission('products.manage')
  let sharedNames = new Set<string>()
  try {
    const shared = await listSharedCatalog()
    sharedNames = new Set(shared.categories.map((name) => name.trim().toLowerCase()).filter(Boolean))
  } catch {
    sharedNames = new Set()
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
    const sharedReady = sharedNames.has(catalog.name.toLowerCase())
    return {
      id: catalog.id,
      name: catalog.name,
      description: catalog.description,
      ready: fileReady || sharedReady,
      productCount: fileReady ? productCount : sharedReady ? null : 0,
    }
  })
}

async function catalogRows(catalog: StarterCatalog): Promise<CatalogRow[]> {
  const rows = catalog.file && catalogFile(catalog.file) ? readCatalogRows(catalog.file) : []
  const seen = new Set(rows.map((row) => `${row.name.toLowerCase()}|${row.sku.toLowerCase()}`))
  try {
    const shared = await listSharedCatalog(catalog.name)
    for (const product of shared.products) {
      const name = product.name.trim()
      if (!name) continue
      const sku = (product.sku || '').trim()
      const key = `${name.toLowerCase()}|${sku.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        name,
        sku,
        barcode: product.barcode || '',
        category: product.category || '',
        hsn: product.hsn || '',
        taxRate: product.taxType === 'non_gst' ? 0 : product.gstRate || 0,
        purchaseRate: product.purchaseRate || 0,
        sellingRate: product.sellingRate || 0,
      })
    }
  } catch {
    /* The bundled file can still be imported when the shared catalog is offline. */
  }
  return rows
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, 0, 0, NULL, NULL, NULL, NULL, 'Pcs', 'active', ?, ?)`,
  )
  try {
    withTransaction(() => {
      for (const row of fresh) {
        stmt.run([
          generateId(),
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
          ts,
          ts,
        ])
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
  }
  return { count: fresh.length, skipped: rows.length - fresh.length, name: catalog.name }
}
