import { getMeta, queryOne, setMeta } from '../database'

export type Role = 'owner' | 'manager' | 'cashier' | 'staff'

export interface SessionUser {
  id: string
  companyId: string
  email: string
  name: string
  role: Role
  permissions: string[]
}

export interface SessionState {
  user: SessionUser | null
  locked: boolean
  hasPin: boolean
  lastActivity: number
  autoLockMinutes: number
}

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  owner: [
    'company.manage',
    'staff.manage',
    'reports.view',
    'invoices.create',
    'invoices.edit',
    'invoices.delete',
    'invoices.cancel',
    'products.manage',
    'customers.manage',
    'customers.delete',
    'settings.manage',
    'backup.manage',
    'purchases.manage',
    'expenses.manage',
    'payments.manage',
    'quotations.manage',
    'audit.view',
    'security.manage',
  ],
  manager: [
    'reports.view',
    'invoices.create',
    'invoices.edit',
    'products.manage',
    'customers.manage',
    'purchases.manage',
    'expenses.manage',
    'payments.manage',
    'quotations.manage',
    'audit.view',
  ],
  cashier: [
    'invoices.create',
    'customers.manage',
    'payments.manage',
    'quotations.manage',
  ],
  staff: ['invoices.create', 'customers.manage'],
}

export function permissionsForRole(role: Role, custom?: string | null): string[] {
  if (custom) {
    try {
      const parsed = JSON.parse(custom) as string[]
      if (Array.isArray(parsed) && parsed.length) return parsed
    } catch {
      /* fall through */
    }
  }
  return ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.staff
}

export function hasPermission(user: SessionUser | null, permission: string): boolean {
  if (!user) return false
  if (user.role === 'owner') return true
  return user.permissions.includes(permission)
}

const SESSION_KEY = 'auth_session'

let session: SessionState = {
  user: null,
  locked: false,
  hasPin: false,
  lastActivity: Date.now(),
  autoLockMinutes: 0,
}

function persistSession(): void {
  try {
    if (!session.user) {
      setMeta(SESSION_KEY, '')
      return
    }
    setMeta(
      SESSION_KEY,
      JSON.stringify({
        userId: session.user.id,
        companyId: session.user.companyId,
        locked: session.locked,
        autoLockMinutes: session.autoLockMinutes,
      }),
    )
  } catch {
    // Database is not open yet.
  }
}

/** Restore the last sign-in after a refresh or restart. Sign out is the only clear. */
export function restoreSession(): void {
  try {
    const raw = getMeta(SESSION_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as { userId?: string; companyId?: string; locked?: boolean; autoLockMinutes?: number }
    if (!saved.userId || !saved.companyId) return
    const row = queryOne<Record<string, unknown>>(
      'SELECT id, company_id, email, name, role, permissions, pin_hash, pin_salt, is_active FROM users WHERE id = ? AND company_id = ?',
      [saved.userId, saved.companyId],
    )
    if (!row || Number(row.is_active) !== 1) {
      setMeta(SESSION_KEY, '')
      return
    }
    const role = row.role as Role
    session = {
      user: {
        id: String(row.id),
        companyId: String(row.company_id),
        email: String(row.email),
        name: String(row.name),
        role,
        permissions: permissionsForRole(role, row.permissions as string | null),
      },
      locked: Boolean(saved.locked),
      hasPin: Boolean(row.pin_hash && row.pin_salt),
      lastActivity: Date.now(),
      autoLockMinutes: Number(saved.autoLockMinutes) || 0,
    }
  } catch {
    // Ignore a damaged session record and leave the user signed out.
  }
}

export function getSession(): SessionState {
  return { ...session, user: session.user ? { ...session.user } : null }
}

export function setSessionUser(user: SessionUser | null, hasPin = false): void {
  session = {
    ...session,
    user,
    locked: false,
    hasPin,
    lastActivity: Date.now(),
  }
  persistSession()
}

export function touchSession(): void {
  session.lastActivity = Date.now()
}

export function lockSession(): void {
  if (session.user) session.locked = true
  persistSession()
}

export function unlockSession(): void {
  session.locked = false
  session.lastActivity = Date.now()
  persistSession()
}

export function clearSession(): void {
  session = {
    user: null,
    locked: false,
    hasPin: false,
    lastActivity: Date.now(),
    autoLockMinutes: session.autoLockMinutes,
  }
  persistSession()
}

export function setAutoLockMinutes(minutes: number): void {
  session.autoLockMinutes = minutes
  persistSession()
}

export function shouldAutoLock(): boolean {
  if (!session.user || session.locked || session.autoLockMinutes <= 0) return false
  const elapsed = Date.now() - session.lastActivity
  return elapsed >= session.autoLockMinutes * 60_000
}

export function requireAuth(): SessionUser {
  if (!session.user) {
    throw new AppError('Please sign in to continue.', 'AUTH_REQUIRED')
  }
  if (session.locked) {
    throw new AppError('Application is locked. Enter your PIN to continue.', 'SESSION_LOCKED')
  }
  touchSession()
  return session.user
}

export function requirePermission(permission: string): SessionUser {
  const user = requireAuth()
  if (!hasPermission(user, permission)) {
    throw new AppError('You do not have permission to perform this action.', 'FORBIDDEN')
  }
  return user
}

export class AppError extends Error {
  code: string
  constructor(message: string, code = 'APP_ERROR') {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}
