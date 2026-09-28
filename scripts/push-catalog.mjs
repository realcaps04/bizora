import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

function readEnv(file) {
  const values = {}
  const text = readFileSync(path.join(root, file), 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[trimmed.slice(0, eq).trim()] = value
  }
  return values
}

const env = readEnv('.env')
const url = (env.CONVEX_URL || '').replace(/\/$/, '')
const secret = env.ACCOUNT_SYNC_SECRET || ''
if (!url || !secret) {
  console.error('Convex URL or account sync secret is missing.')
  process.exit(1)
}

const CATALOG_FILES = {
  supermarkets: 'supermarket_pos_inventory_data-v2.csv',
  pharmacies: 'pharmacy_pos_inventory_data.csv',
  apparel: 'apparel_boutique_pos_inventory.csv',
  'agro-hardware': 'agro_hardware_pos_inventory.csv',
  'specialty-manufacturing': 'specialty_manufacturing_pos_inventory.csv',
  'heavy-manufacturing': 'heavy_manufacturing_pos_inventory.csv',
  restaurants: 'restaurant_food_service_pos_inventory.csv',
  cafes: 'cafe_bakery_pos_inventory.csv',
  software: 'software_development_it_pos_inventory.csv',
  ecommerce: 'ecommerce_online_retail_pos_inventory.csv',
  accounting: 'accounting_tax_consultancy_pos_inventory.csv',
}

function categories() {
  const text = readFileSync(path.join(root, 'src/data/companyCategories.ts'), 'utf8')
  const rows = []
  const pattern = /id: '([^']+)',\s*name: '([^']+)',\s*description: '([^']+)'/g
  for (const match of text.matchAll(pattern)) {
    rows.push({ key: match[1], name: match[2], description: match[3], productCount: 0 })
  }
  if (!rows.length) throw new Error('No categories found')
  return rows
}

function splitCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else current += char
  }
  cells.push(current.trim())
  return cells
}

function parseCsv(fileName) {
  const text = readFileSync(path.join(root, 'public', fileName), 'utf8').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'))
  const at = (names) => headers.findIndex((header) => names.includes(header))
  const rows = []
  const seen = new Set()
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    const pick = (names) => {
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
    const barcode = pick(['barcode']).trim()
    const category = pick(['category']).trim()
    const hsn = pick(['hsn', 'hsn_code']).trim()
    rows.push({
      name,
      sku,
      ...(barcode ? { barcode } : {}),
      ...(category ? { category } : {}),
      ...(hsn ? { hsn } : {}),
      taxType: exempt ? 'non_gst' : 'gst',
      gstRate: exempt ? 0 : rate,
      purchaseRate: Number(pick(['purchase_rate', 'purchase', 'cost'])) || 0,
      sellingRate: Number(pick(['selling_rate', 'sale_rate', 'sale', 'price'])) || 0,
      openingStock: Number(pick(['opening_stock', 'stock', 'qty', 'quantity'])) || 0,
    })
  }
  return rows
}

async function callConvex(kind, name, args) {
  const res = await fetch(`${url}/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: name, args: { ...args, secret }, format: 'json' }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || body?.status === 'error') {
    throw new Error(body?.errorMessage || `Convex request failed (${res.status})`)
  }
  return body?.value
}

async function callRetry(kind, name, args) {
  let wait = 500
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return await callConvex(kind, name, args)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === 6 || /Unauthorized/.test(message)) throw error
      await new Promise((resolve) => setTimeout(resolve, wait))
      wait *= 2
    }
  }
  return null
}

function chunks(items, size) {
  const pages = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}

const saved = categories()
await callRetry('mutation', 'catalog:upsertCategories', { categories: saved })
console.log(`categories ${saved.length}`)

for (const category of saved) {
  const file = CATALOG_FILES[category.key]
  if (!file) continue
  let removed = 0
  for (;;) {
    const deleted = await callRetry('mutation', 'catalog:deleteItems', { catalogKey: category.key, limit: 100 })
    removed += deleted
    if (!deleted) break
  }
  const rows = parseCsv(file)
  let inserted = 0
  for (const page of chunks(rows, 80)) {
    const count = await callRetry(
      'mutation',
      'catalog:insertItems',
      {
        items: page.map((row) => ({
          itemKey: `${category.key}|${row.name.toLowerCase()}|${row.sku.toLowerCase()}`,
          catalogKey: category.key,
          ...row,
        })),
      },
    )
    inserted += count
    if (inserted % 800 === 0 || inserted === rows.length) {
      console.log(`${category.key} ${inserted}/${rows.length}`)
    }
  }
  category.productCount = inserted
  await callRetry('mutation', 'catalog:upsertCategories', {
    categories: [{ key: category.key, name: category.name, description: category.description, productCount: inserted }],
  })
  console.log(`${category.key} saved ${inserted} removed ${removed}`)
}

const listed = await callRetry('query', 'catalog:listCategories', {})
const withProducts = listed.filter((row) => row.productCount > 0)
console.log(`done categories ${listed.length} with products ${withProducts.length} items ${withProducts.reduce((sum, row) => sum + row.productCount, 0)}`)
