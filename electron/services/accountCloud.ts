import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { queryAll, queryOne } from '../database'

let envLoaded = false

/** Read project .env without pulling business data anywhere. */
export function loadAccountEnv(): void {
  if (envLoaded) return
  envLoaded = true
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
  ]
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

export async function completeCloudPasswordReset(email: string, codeHash: string, passwordHash: string): Promise<void> {
  await callConvex('mutation', 'accounts:completePasswordReset', {
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
