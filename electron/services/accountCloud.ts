import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { GST_BUSINESSES, parseGstBusinessCsv, type GstBusinessRecord } from '../../src/data/gstBusinesses'
import { queryAll, queryOne, run } from '../database'
import { AppError, requireAuth, requirePermission } from '../security/session'

let envLoaded = false

/** Read project .env without pulling business data anywhere. */
export function loadAccountEnv(): void {
  if (envLoaded) return
  envLoaded = true
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(path.dirname(process.execPath), '.env'),
  ]
  try {
    candidates.push(path.join(app.getAppPath(), '.env'), path.join(app.getAppPath(), '..', '.env'))
  } catch {
    /* app path is only available after Electron is ready */
  }
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, '.env'))
  for (const file of candidates) {
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
    return
  }
}

function cloudReady(): { url: string; secret: string } | null {
  loadAccountEnv()
  const url = (process.env.CONVEX_URL || '').trim().replace(/\/$/, '')
  const secret = (process.env.ACCOUNT_SYNC_SECRET || '').trim()
  if (!url || !secret) return null
  return { url, secret }
}

export function isAccountCloudEnabled(): boolean {
  return cloudReady() !== null
}

async function callConvex<T>(kind: 'mutation' | 'query', name: string, args: Record<string, unknown>): Promise<T> {
  const cloud = cloudReady()
  if (!cloud) throw new Error('Account directory is not configured.')
  const res = await fetch(`${cloud.url}/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: name,
      args: { ...args, secret: cloud.secret },
      format: 'json',
    }),
  })
  const body = (await res.json().catch(() => null)) as {
    status?: string
    errorMessage?: string
    value?: T
  } | null
  if (!res.ok || body?.status === 'error') {
    throw new Error(body?.errorMessage || `Convex account request failed (${res.status})`)
  }
  return body?.value as T
}

async function mutate(name: string, args: Record<string, unknown>): Promise<void> {
  if (!cloudReady()) return
  await callConvex('mutation', name, args)
}

export interface CloudAccount {
  localId: string
  companyLocalId: string
  name: string
  email: string
  passwordHash: string
  role: string
  isActive: boolean
  directoryIssued: boolean
}

export async function findCloudResetTarget(email: string): Promise<{ name: string; accountEmail: string } | null> {
  return callConvex<{ name: string; accountEmail: string } | null>('query', 'accounts:lookupResetTarget', {
    email: email.trim().toLowerCase(),
  })
}

export async function findCloudAccount(email: string): Promise<CloudAccount | null> {
  return callConvex<CloudAccount | null>('query', 'accounts:findByEmail', {
    email: email.trim().toLowerCase(),
  })
}

export async function issueCloudAccount(email: string): Promise<void> {
  await callConvex('mutation', 'accounts:issueAccount', {
    email: email.trim().toLowerCase(),
  })
}

export async function beginCloudPasswordReset(email: string, codeHash: string, expiresAt: string): Promise<{ name: string }> {
  return callConvex<{ name: string }>('mutation', 'accounts:beginPasswordReset', {
    email: email.trim().toLowerCase(),
    codeHash,
    expiresAt,
  })
}

export async function clearCloudPasswordReset(email: string): Promise<void> {
  await callConvex('mutation', 'accounts:clearPasswordReset', {
    email: email.trim().toLowerCase(),
  })
}

export async function completeCloudPasswordReset(
  email: string,
  codeHash: string,
  passwordHash: string,
): Promise<{ accountEmail: string }> {
  return callConvex<{ accountEmail: string }>('mutation', 'accounts:completePasswordReset', {
    email: email.trim().toLowerCase(),
    codeHash,
    passwordHash,
  })
}

export async function recordCloudLogin(email: string, at: string): Promise<void> {
  await callConvex('mutation', 'accounts:recordLogin', {
    email: email.trim().toLowerCase(),
    at,
  })
}

/**
 * Push company profile and login accounts only.
 * Does not read invoices, products, customers, purchases, or other workspace data.
 */
export async function syncCompanyAccounts(companyId: string): Promise<void> {
  if (!cloudReady()) return

  const company = queryOne<Record<string, unknown>>(
    `SELECT id, name, owner_name, email, mobile, address, gstin, business_type, created_at, updated_at
     FROM companies WHERE id = ?`,
    [companyId],
  )
  if (!company) return

  await mutate('accounts:upsertCompany', {
    localId: String(company.id),
    name: String(company.name || ''),
    ownerName: String(company.owner_name || ''),
    email: String(company.email || ''),
    mobile: company.mobile ? String(company.mobile) : undefined,
    address: company.address ? String(company.address) : undefined,
    gstin: company.gstin ? String(company.gstin) : undefined,
    businessType: company.business_type ? String(company.business_type) : undefined,
    createdAt: String(company.created_at),
    updatedAt: String(company.updated_at),
  })

  const users = queryAll<Record<string, unknown>>(
    `SELECT id, company_id, name, email, password_hash, role, mobile, is_active, created_at, updated_at, last_login_at
     FROM users WHERE company_id = ?`,
    [companyId],
  )

  for (const user of users) {
    await mutate('accounts:upsertAccount', {
      localId: String(user.id),
      companyLocalId: String(user.company_id),
      name: String(user.name || ''),
      email: String(user.email || ''),
      passwordHash: String(user.password_hash || ''),
      role: String(user.role || 'staff'),
      mobile: user.mobile ? String(user.mobile) : undefined,
      isActive: Number(user.is_active) === 1,
      createdAt: String(user.created_at),
      updatedAt: String(user.updated_at),
      lastLoginAt: user.last_login_at ? String(user.last_login_at) : undefined,
    })
  }
}

export function syncCompanyAccountsQuiet(companyId: string): void {
  void syncCompanyAccounts(companyId).catch((err) => {
    console.error('[convex] account sync failed:', err instanceof Error ? err.message : err)
  })
}

function companyBusinessType(companyId: string): string {
  const company = queryOne<{ business_type: string | null }>('SELECT business_type FROM companies WHERE id = ?', [companyId])
  return company?.business_type || ''
}

function optionalText(value: unknown): string | undefined {
  const text = value == null ? '' : String(value).trim()
  return text || undefined
}

/** Copy one local product into the Convex product catalog. Stock updates do not republish prices. */
export function syncProductQuiet(row: Record<string, unknown> | null | undefined, stockOnly = false): void {
  if (!row || !cloudReady()) return
  const gstRate = Number(row.tax_rate) || 0
  const taxType = gstRate > 0 ? 'gst' : 'non_gst'
  void callConvex('mutation', 'products:upsert', {
    localId: String(row.id),
    companyLocalId: String(row.company_id),
    name: String(row.name || ''),
    sku: optionalText(row.sku),
    barcode: optionalText(row.barcode),
    category: optionalText(row.category),
    companyCategory: optionalText(row.company_category) || optionalText(companyBusinessType(String(row.company_id))),
    brand: optionalText(row.brand),
    hsn: optionalText(row.hsn),
    taxType,
    gstRate: taxType === 'gst' ? gstRate : 0,
    purchaseRate: Number(row.purchase_rate) || 0,
    sellingRate: Number(row.selling_rate) || 0,
    mrp: Number(row.mrp) || 0,
    openingStock: Number(row.opening_stock) || 0,
    currentStock: Number(row.current_stock) || 0,
    minStock: Number(row.min_stock) || 0,
    reorderLevel: Number(row.reorder_level) || 0,
    location: optionalText(row.location),
    description: optionalText(row.description),
    supplier: optionalText(row.supplier),
    productType: optionalText(row.product_type),
    status: String(row.status || 'active'),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    stockOnly,
  }).catch((err) => {
    console.error('[convex] product sync failed:', err instanceof Error ? err.message : err)
  })
}

export function syncProductById(productId: string): void {
  const row = queryOne<Record<string, unknown>>('SELECT * FROM products WHERE id = ?', [productId])
  syncProductQuiet(row, true)
}

export interface SharedCatalogProduct {
  name: string
  sku: string
  barcode: string
  category: string
  brand: string
  hsn: string
  taxType: 'gst' | 'non_gst'
  gstRate: number
  purchaseRate: number
  sellingRate: number
  mrp: number
  minStock: number
  reorderLevel: number
  description: string
  supplier: string
  productType: string
}

export async function listSharedCatalog(companyCategory?: string): Promise<{
  categories: string[]
  products: SharedCatalogProduct[]
}> {
  if (!cloudReady()) return { categories: [], products: [] }
  return callConvex<{ categories: string[]; products: SharedCatalogProduct[] }>('query', 'products:listShared', {
    companyCategory: companyCategory?.trim() || undefined,
  })
}

export interface CatalogCategory {
  key: string
  name: string
  description: string
  productCount: number
}

export interface CatalogItem {
  name: string
  sku: string
  barcode: string
  category: string
  hsn: string
  taxType: 'gst' | 'non_gst'
  gstRate: number
  purchaseRate: number
  sellingRate: number
  openingStock: number
}

export interface GstBusiness {
  name: string
  gstin: string
  registrationType: string
  address: string
}

const GST_BUSINESSES_KEY = 'gst_businesses'
const GST_BUSINESSES_OMIT_KEY = 'gst_business_omit'

function normalizeBusiness(row: Partial<GstBusinessRecord>): GstBusiness | null {
  const name = String(row.name || '').trim()
  const gstin = String(row.gstin || '').trim().toUpperCase()
  if (!name || !gstin) return null
  return {
    name,
    gstin,
    registrationType: String(row.registrationType || 'Regular').trim() || 'Regular',
    address: String(row.address || '').trim(),
  }
}

function mergeBusinesses(...lists: GstBusiness[][]): GstBusiness[] {
  const byGstin = new Map<string, GstBusiness>()
  for (const list of lists) {
    for (const row of list) {
      const next = normalizeBusiness(row)
      if (next) byGstin.set(next.gstin, next)
    }
  }
  return [...byGstin.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function readSetting(key: string): string {
  const user = requireAuth()
  return (
    queryOne<{ value: string }>('SELECT value FROM settings WHERE company_id = ? AND key = ?', [user.companyId, key])
      ?.value || ''
  )
}

function writeSetting(key: string, value: string) {
  const user = requireAuth()
  run('INSERT OR REPLACE INTO settings (company_id, key, value) VALUES (?, ?, ?)', [user.companyId, key, value])
}

function readImportedBusinesses(): GstBusiness[] {
  const raw = readSetting(GST_BUSINESSES_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Partial<GstBusinessRecord>[]
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => normalizeBusiness(item)).filter((item): item is GstBusiness => Boolean(item))
  } catch {
    return []
  }
}

function readOmittedGstins(): Set<string> {
  const raw = readSetting(GST_BUSINESSES_OMIT_KEY)
  if (!raw) return new Set()
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean))
  } catch {
    return new Set()
  }
}

/** Shared GST registrations for the B2B business-name field and purchase suppliers. */
export async function listGstBusinesses(): Promise<GstBusiness[]> {
  const imported = readImportedBusinesses()
  const omitted = readOmittedGstins()
  let remote: GstBusiness[] = []
  if (cloudReady()) {
    try {
      remote = await callConvex<GstBusiness[]>('query', 'gstBusinesses:list', {})
    } catch (err) {
      console.error('[convex] gst business list failed:', err instanceof Error ? err.message : err)
    }
  }
  const shared = mergeBusinesses(GST_BUSINESSES, remote).filter((row) => !omitted.has(row.gstin))
  return mergeBusinesses(shared, imported)
}

/** Save a CSV of business name, GSTIN, registration type, and address. */
export async function importGstBusinesses(csvText: string): Promise<{ count: number; rows: GstBusiness[] }> {
  requirePermission('settings.manage')
  const incoming = parseGstBusinessCsv(csvText || '')
    .map((row) => normalizeBusiness(row))
    .filter((row): row is GstBusiness => Boolean(row))
  if (!incoming.length) {
    throw new AppError('The CSV needs a header row and at least one business with a name and GSTIN.', 'VALIDATION')
  }
  const stored = mergeBusinesses(readImportedBusinesses(), incoming)
  writeSetting(GST_BUSINESSES_KEY, JSON.stringify(stored))
  if (cloudReady()) {
    try {
      await callConvex('mutation', 'gstBusinesses:upsert', { businesses: incoming })
    } catch (err) {
      console.error('[convex] gst business import failed:', err instanceof Error ? err.message : err)
    }
  }
  return { count: incoming.length, rows: await listGstBusinesses() }
}

/** Update one business. A changed GSTIN replaces the previous row. */
export async function updateGstBusiness(input: {
  originalGstin: string
  name: string
  gstin: string
  registrationType?: string
  address?: string
}): Promise<GstBusiness[]> {
  requirePermission('settings.manage')
  const next = normalizeBusiness(input)
  if (!next) throw new AppError('Enter the business name and GSTIN.', 'VALIDATION')
  const original = String(input.originalGstin || '').trim().toUpperCase()
  const imported = readImportedBusinesses().filter((row) => row.gstin !== original && row.gstin !== next.gstin)
  imported.push(next)
  writeSetting(GST_BUSINESSES_KEY, JSON.stringify(imported))
  const omitted = readOmittedGstins()
  if (original && original !== next.gstin) omitted.add(original)
  omitted.delete(next.gstin)
  writeSetting(GST_BUSINESSES_OMIT_KEY, JSON.stringify([...omitted]))
  if (cloudReady()) {
    try {
      await callConvex('mutation', 'gstBusinesses:upsert', { businesses: [next] })
    } catch (err) {
      console.error('[convex] gst business update failed:', err instanceof Error ? err.message : err)
    }
  }
  return listGstBusinesses()
}

/** Shared categories stored for download into the local app. */
export async function listCatalogCategories(): Promise<CatalogCategory[]> {
  if (!cloudReady()) return []
  return callConvex<CatalogCategory[]>('query', 'catalog:listCategories', {})
}

/** One page of a category, for the bulk-add screen. */
export async function listCatalogPage(
  catalogKey: string,
  opts?: { cursor?: string; limit?: number },
): Promise<{ items: CatalogItem[]; cursor: string; isDone: boolean }> {
  if (!cloudReady()) return { items: [], cursor: '', isDone: true }
  return callConvex<{ items: CatalogItem[]; cursor: string; isDone: boolean }>('query', 'catalog:listItems', {
    catalogKey,
    cursor: opts?.cursor || undefined,
    limit: opts?.limit ?? 40,
  })
}

/** Every shared product in one category, for copying into the local database. */
export async function listCatalogItems(catalogKey: string): Promise<CatalogItem[]> {
  if (!cloudReady()) return []
  const items: CatalogItem[] = []
  let cursor = ''
  for (;;) {
    const page = await callConvex<{ items: CatalogItem[]; cursor: string; isDone: boolean }>('query', 'catalog:listItems', {
      catalogKey,
      cursor: cursor || undefined,
      limit: 200,
    })
    items.push(...(page.items || []))
    if (page.isDone || !page.cursor) break
    cursor = page.cursor
  }
  return items
}
