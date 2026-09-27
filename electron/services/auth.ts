import { createHash, randomInt } from 'node:crypto'
import { queryAll, queryOne, run, withTransaction } from '../database'
import { generateId, hashPassword, hashPin, verifyPassword, generateSalt } from '../security/crypto'
import {
  AppError,
  clearSession,
  getSession,
  permissionsForRole,
  requireAuth,
  requirePermission,
  setAutoLockMinutes,
  setSessionUser,
  type Role,
  type SessionUser,
} from '../security/session'
import {
  beginCloudPasswordReset,
  clearCloudPasswordReset,
  completeCloudPasswordReset,
  findCloudAccount,
  findCloudResetTarget,
  isAccountCloudEnabled,
  issueCloudAccount,
  recordCloudLogin,
  syncCompanyAccounts,
  syncCompanyAccountsQuiet,
} from './accountCloud'
import { sendPasswordResetEmail } from './resetEmail'

function now(): string {
  return new Date().toISOString()
}

/** Default quick-unlock PIN when user has not configured one */
export const DEFAULT_UNLOCK_PIN = '0000'

async function persistPin(userId: string, companyId: string, pin: string): Promise<void> {
  const salt = generateSalt()
  const pinHash = await hashPin(pin, salt)
  run('UPDATE users SET pin_hash = ?, pin_salt = ?, updated_at = ? WHERE id = ? AND company_id = ?', [
    pinHash,
    salt.toString('hex'),
    now(),
    userId,
    companyId,
  ])
}

function mapUser(row: Record<string, unknown>): SessionUser {
  const role = row.role as Role
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    email: row.email as string,
    name: row.name as string,
    role,
    permissions: permissionsForRole(role, row.permissions as string | null),
  }
}

export function writeAudit(
  companyId: string,
  user: { id?: string; name?: string } | null,
  action: string,
  module: string,
  recordId: string | null,
  description: string,
): void {
  run(
    `INSERT INTO audit_logs (id, company_id, user_id, user_name, action, module, record_id, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [generateId(), companyId, user?.id ?? null, user?.name ?? null, action, module, recordId, description, now()],
  )
}

export function hasAnyCompany(): boolean {
  const row = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM companies')
  return (row?.c ?? 0) > 0
}

export async function registerCompany(input: {
  ownerName: string
  email: string
  password: string
  companyName: string
  businessType?: string
  mobile?: string
  companyEmail?: string
  gstin?: string
  address?: string
  currency?: string
  invoicePrefix?: string
  taxMode?: string
}): Promise<SessionUser> {
  const email = input.email.trim().toLowerCase()
  const localExisting = queryOne('SELECT id FROM users WHERE lower(email) = ?', [email])
  if (localExisting) {
    throw new AppError('An account with this email already exists. Sign in to continue.', 'DUPLICATE')
  }

  if (isAccountCloudEnabled()) {
    try {
      const taken = await findCloudAccount(email)
      if (taken?.directoryIssued) throw new AppError('An account with this email already exists.', 'DUPLICATE')
    } catch (err) {
      if (err instanceof AppError) throw err
      throw new AppError('Could not reach the account directory. Check your connection and try again.', 'CLOUD_UNAVAILABLE')
    }
  }

  const passwordHash = await hashPassword(input.password)
  const companyId = generateId()
  const userId = generateId()
  const ts = now()

  withTransaction(() => {
    run(
      `INSERT INTO companies (
        id, name, owner_name, email, mobile, address, gstin, business_type,
        currency, tax_mode, invoice_prefix, invoice_next, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        companyId,
        input.companyName.trim(),
        input.ownerName.trim(),
        (input.companyEmail || email).trim().toLowerCase(),
        input.mobile?.trim() || null,
        input.address?.trim() || null,
        input.gstin?.trim() || null,
        input.businessType?.trim() || null,
        input.currency || 'INR',
        input.taxMode || 'gst',
        input.invoicePrefix || 'INV',
        ts,
        ts,
      ],
    )

    run(
      `INSERT INTO users (
        id, company_id, name, email, password_hash, role, is_active, created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, 'owner', 1, ?, ?, ?)`,
      [userId, companyId, input.ownerName.trim(), email, passwordHash, ts, ts, ts],
    )

    const defaults: Record<string, string> = {
      auto_lock_minutes: '0',
      paper_format: 'A4',
      compact_mode: 'false',
      font_size: 'medium',
      theme: 'light',
      backup_schedule: 'daily',
      google_drive_backup: 'false',
      terms: 'Thank you for your business.',
    }
    for (const [key, value] of Object.entries(defaults)) {
      run('INSERT INTO settings (company_id, key, value) VALUES (?, ?, ?)', [companyId, key, value])
    }

    writeAudit(companyId, { id: userId, name: input.ownerName }, 'company.created', 'company', companyId, 'Company workspace created')
  })

  const user = mapUser({
    id: userId,
    company_id: companyId,
    email,
    name: input.ownerName.trim(),
    role: 'owner',
    permissions: null,
  })
  await persistPin(userId, companyId, DEFAULT_UNLOCK_PIN)
  if (isAccountCloudEnabled()) {
    try {
      await syncCompanyAccounts(companyId)
      await issueCloudAccount(email)
      const saved = await findCloudAccount(email)
      const verified = saved?.directoryIssued ? await verifyPassword(input.password, saved.passwordHash) : false
      if (!saved || !verified) {
        throw new Error('Account was not saved in the directory.')
      }
    } catch (err) {
      rollbackCompany(companyId)
      throw new AppError(
        err instanceof AppError
          ? err.message
          : 'Could not register this account. Check your connection and try again.',
        'CLOUD_UNAVAILABLE',
      )
    }
  }
  setSessionUser(user, true)
  return user
}

function rollbackCompany(companyId: string): void {
  run('DELETE FROM audit_logs WHERE company_id = ?', [companyId])
  run('DELETE FROM settings WHERE company_id = ?', [companyId])
  run('DELETE FROM users WHERE company_id = ?', [companyId])
  run('DELETE FROM companies WHERE id = ?', [companyId])
  clearSession()
}

function isLoginEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function resetCodeHash(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex')
}

export async function requestPasswordReset(emailRaw: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase()
  if (!isLoginEmail(email)) throw new AppError('Enter a valid email address.', 'VALIDATION')
  if (!isAccountCloudEnabled()) {
    throw new AppError('Account directory is not configured.', 'CLOUD_UNAVAILABLE')
  }

  let target = await findCloudResetTarget(email).catch(() => {
    throw new AppError('Could not reach the account directory. Check your connection and try again.', 'CLOUD_UNAVAILABLE')
  })
  if (!target) {
    const localUser = queryOne<{ company_id: string; is_active: number }>(
      'SELECT company_id, is_active FROM users WHERE lower(email) = ?',
      [email],
    )
    const localCompany = queryOne<{ id: string }>('SELECT id FROM companies WHERE lower(email) = ?', [email])
    const companyId =
      localUser && Number(localUser.is_active) === 1 ? localUser.company_id : localCompany?.id
    if (companyId) {
      try {
        await syncCompanyAccounts(companyId)
        target = await findCloudResetTarget(email)
      } catch {
        throw new AppError('Could not reach the account directory. Check your connection and try again.', 'CLOUD_UNAVAILABLE')
      }
    }
  }
  if (!target) {
    throw new AppError('No registered account uses this email.', 'NOT_FOUND')
  }

  const code = String(randomInt(100000, 1000000))
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  try {
    await beginCloudPasswordReset(email, resetCodeHash(code), expiresAt)
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('No registered account')) {
      throw new AppError('No registered account uses this email.', 'NOT_FOUND')
    }
    throw new AppError('Could not reach the account directory. Check your connection and try again.', 'CLOUD_UNAVAILABLE')
  }

  try {
    await sendPasswordResetEmail({ toEmail: email, toName: target.name, code })
  } catch (err) {
    await clearCloudPasswordReset(email).catch(() => undefined)
    const message = err instanceof Error ? err.message : ''
    if (message.includes('not configured')) {
      throw new AppError('EmailJS is not configured. Add the service, template, and public key, then try again.', 'EMAIL_FAILED')
    }
    if (message.includes('non-browser')) {
      throw new AppError(
        'EmailJS is blocking this send. In the EmailJS dashboard, open Account, Security, and allow API requests from non-browser applications.',
        'EMAIL_FAILED',
      )
    }
    if (message.toLowerCase().includes('recipients address is empty')) {
      throw new AppError(
        'The EmailJS template has no recipient. Open the template, set To Email to {{to_email}}, and save it.',
        'EMAIL_FAILED',
      )
    }
    throw new AppError('Could not send the reset email. Check the EmailJS settings and try again.', 'EMAIL_FAILED')
  }
}

export async function completePasswordReset(emailRaw: string, code: string, newPassword: string): Promise<void> {
  const email = emailRaw.trim().toLowerCase()
  if (!isLoginEmail(email)) throw new AppError('Enter a valid email address.', 'VALIDATION')
  if (!/^\d{6}$/.test(code.trim())) throw new AppError('Enter the 6-digit code from your email.', 'VALIDATION')
  if (newPassword.trim().length < 8) throw new AppError('Password must be at least 8 characters.', 'WEAK_PASSWORD')
  if (!isAccountCloudEnabled()) {
    throw new AppError('Account directory is not configured.', 'CLOUD_UNAVAILABLE')
  }

  const passwordHash = await hashPassword(newPassword)
  let accountEmail = email
  try {
    const saved = await completeCloudPasswordReset(email, resetCodeHash(code), passwordHash)
    accountEmail = saved?.accountEmail || email
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('not valid') || message.includes('Password could not')) {
      throw new AppError('This reset code is not valid or has expired.', 'INVALID_CODE')
    }
    throw new AppError('Could not reach the account directory. Check your connection and try again.', 'CLOUD_UNAVAILABLE')
  }

  const local =
    queryOne<{ id: string; company_id: string }>('SELECT id, company_id FROM users WHERE lower(email) = ?', [accountEmail]) ||
    (accountEmail === email
      ? undefined
      : queryOne<{ id: string; company_id: string }>('SELECT id, company_id FROM users WHERE lower(email) = ?', [email]))
  if (local) {
    run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND company_id = ?', [
      passwordHash,
      now(),
      local.id,
      local.company_id,
    ])
  }
}

export async function login(emailRaw: string, password: string): Promise<SessionUser> {
  const email = emailRaw.trim().toLowerCase()
  if (!isLoginEmail(email) || !password.trim()) {
    throw new AppError('Invalid email or password.', 'INVALID_CREDENTIALS')
  }
  if (!isAccountCloudEnabled()) {
    throw new AppError('Account directory is not configured. Sign-in is unavailable.', 'CLOUD_UNAVAILABLE')
  }

  const row = queryOne<Record<string, unknown>>(
    `SELECT * FROM users WHERE lower(email) = ? AND is_active = 1`,
    [email],
  )
  const localHash = typeof row?.password_hash === 'string' ? row.password_hash : ''
  if (!row || !localHash.startsWith('$argon2')) {
    throw new AppError('Invalid email or password.', 'INVALID_CREDENTIALS')
  }

  const ok = await verifyPassword(password, localHash)
  if (!ok) throw new AppError('Invalid email or password.', 'INVALID_CREDENTIALS')

  await assertCloudLogin(email, password, String(row.id))

  run('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?', [now(), now(), row.id])
  const user = mapUser(row)
  let hasPin = Boolean(row.pin_hash && row.pin_salt)
  if (!hasPin) {
    await persistPin(user.id, user.companyId, DEFAULT_UNLOCK_PIN)
    hasPin = true
  }
  setSessionUser(user, hasPin)

  const lockSetting = queryOne<{ value: string }>(
    'SELECT value FROM settings WHERE company_id = ? AND key = ?',
    [user.companyId, 'auto_lock_minutes'],
  )
  // Never auto-lock by default — only Lock / Logout when the user chooses.
  // Migrate previous built-in default of 15 minutes → never.
  let minutes = lockSetting ? Number(lockSetting.value) || 0 : 0
  if (!lockSetting || lockSetting.value === '15') {
    minutes = 0
    run('INSERT OR REPLACE INTO settings (company_id, key, value) VALUES (?, ?, ?)', [
      user.companyId,
      'auto_lock_minutes',
      '0',
    ])
  }
  setAutoLockMinutes(minutes)

  writeAudit(user.companyId, user, 'user.login', 'auth', user.id, 'User signed in')
  try {
    await recordCloudLogin(email, now())
  } catch (err) {
    console.error('[convex] last-login update failed:', err instanceof Error ? err.message : err)
  }
  return user
}

async function assertCloudLogin(email: string, password: string, localUserId: string): Promise<void> {
  let cloud
  try {
    cloud = await findCloudAccount(email)
  } catch {
    throw new AppError('Could not reach the account directory. Check your connection and try again.', 'CLOUD_UNAVAILABLE')
  }
  if (
    !cloud ||
    !cloud.directoryIssued ||
    !cloud.isActive ||
    cloud.localId !== localUserId ||
    !cloud.passwordHash.startsWith('$argon2')
  ) {
    throw new AppError('Invalid email or password.', 'INVALID_CREDENTIALS')
  }
  const cloudOk = await verifyPassword(password, cloud.passwordHash)
  if (!cloudOk) throw new AppError('Invalid email or password.', 'INVALID_CREDENTIALS')
}

export async function setupPin(pin: string): Promise<void> {
  const user = requireAuth()
  if (!/^\d{4,6}$/.test(pin)) throw new AppError('PIN must be 4–6 digits.', 'INVALID_PIN')
  await persistPin(user.id, user.companyId, pin)
  setSessionUser(user, true)
  writeAudit(user.companyId, user, 'pin.setup', 'security', user.id, 'Quick unlock PIN configured')
}

export async function quickUnlock(pin: string): Promise<SessionUser> {
  const session = getSession()
  if (!session.user) throw new AppError('Please sign in first.', 'AUTH_REQUIRED')

  const row = queryOne<Record<string, unknown>>(
    'SELECT * FROM users WHERE id = ? AND company_id = ? AND is_active = 1',
    [session.user.id, session.user.companyId],
  )
  if (!row) throw new AppError('User not found.', 'NOT_FOUND')

  if (!row.pin_hash || !row.pin_salt) {
    if (pin !== DEFAULT_UNLOCK_PIN) {
      throw new AppError(`PIN is not configured. Use default PIN ${DEFAULT_UNLOCK_PIN}.`, 'PIN_NOT_SET')
    }
    await persistPin(session.user.id, session.user.companyId, DEFAULT_UNLOCK_PIN)
    const user = mapUser(row)
    setSessionUser(user, true)
    return user
  }

  const salt = Buffer.from(row.pin_salt as string, 'hex')
  const pinHash = await hashPin(pin, salt)
  if (pinHash !== row.pin_hash) throw new AppError('Incorrect PIN.', 'INVALID_PIN')

  const user = mapUser(row)
  setSessionUser(user, true)
  writeAudit(user.companyId, user, 'user.unlock', 'auth', user.id, 'Application unlocked with PIN')
  return user
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const user = requirePermission('security.manage')
  const row = queryOne<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ? AND company_id = ?', [
    user.id,
    user.companyId,
  ])
  if (!row) throw new AppError('User not found.', 'NOT_FOUND')
  const ok = await verifyPassword(currentPassword, row.password_hash)
  if (!ok) throw new AppError('Current password is incorrect.', 'INVALID_CREDENTIALS')
  if (newPassword.length < 8) throw new AppError('New password must be at least 8 characters.', 'WEAK_PASSWORD')

  const hash = await hashPassword(newPassword)
  run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND company_id = ?', [
    hash,
    now(),
    user.id,
    user.companyId,
  ])
  if (isAccountCloudEnabled()) {
    try {
      await syncCompanyAccounts(user.companyId)
      const saved = await findCloudAccount(user.email)
      const verified = saved ? await verifyPassword(newPassword, saved.passwordHash) : false
      if (!verified) throw new Error('Password was not updated in the directory.')
    } catch {
      run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND company_id = ?', [
        row.password_hash,
        now(),
        user.id,
        user.companyId,
      ])
      throw new AppError('Could not update the account directory. Your password was not changed.', 'CLOUD_UNAVAILABLE')
    }
  }
  writeAudit(user.companyId, user, 'password.changed', 'security', user.id, 'Password changed')
}

export function logout(): void {
  const session = getSession()
  if (session.user) {
    writeAudit(session.user.companyId, session.user, 'user.logout', 'auth', session.user.id, 'User signed out')
  }
  clearSession()
}

export async function createStaff(input: {
  name: string
  email: string
  password: string
  role: Role
  permissions?: string[]
  mobile?: string
}): Promise<Record<string, unknown>> {
  const actor = requirePermission('staff.manage')
  if (input.role === 'owner') throw new AppError('Cannot create another owner account.', 'FORBIDDEN')

  const email = input.email.trim().toLowerCase()
  if (!isLoginEmail(email)) throw new AppError('Enter a valid email address.', 'VALIDATION')
  if (input.password.trim().length < 8) {
    throw new AppError('Password must be at least 8 characters.', 'WEAK_PASSWORD')
  }
  const existing = queryOne('SELECT id FROM users WHERE lower(email) = ?', [email])
  if (existing) throw new AppError('A user with this email already exists.', 'DUPLICATE')
  if (isAccountCloudEnabled()) {
    try {
      const taken = await findCloudAccount(email)
      if (taken?.directoryIssued) throw new AppError('A user with this email already exists.', 'DUPLICATE')
    } catch (err) {
      if (err instanceof AppError) throw err
      throw new AppError('Could not reach the account directory. Check your connection and try again.', 'CLOUD_UNAVAILABLE')
    }
  }

  const id = generateId()
  const ts = now()
  const passwordHash = await hashPassword(input.password)
  const permissions = input.permissions ? JSON.stringify(input.permissions) : null

  run(
    `INSERT INTO users (id, company_id, name, email, password_hash, role, permissions, mobile, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [id, actor.companyId, input.name.trim(), email, passwordHash, input.role, permissions, input.mobile ?? null, ts, ts],
  )
  await persistPin(id, actor.companyId, DEFAULT_UNLOCK_PIN)
  if (isAccountCloudEnabled()) {
    try {
      await syncCompanyAccounts(actor.companyId)
      await issueCloudAccount(email)
      const saved = await findCloudAccount(email)
      const verified = saved?.directoryIssued ? await verifyPassword(input.password, saved.passwordHash) : false
      if (!saved || !verified) throw new Error('Staff account was not saved in the directory.')
    } catch (err) {
      run('DELETE FROM users WHERE id = ? AND company_id = ?', [id, actor.companyId])
      if (err instanceof AppError) throw err
      throw new AppError('Could not register this staff account. Check your connection and try again.', 'CLOUD_UNAVAILABLE')
    }
  }
  writeAudit(actor.companyId, actor, 'staff.created', 'staff', id, `Staff account created for ${input.name}`)
  return queryOne('SELECT id, name, email, role, mobile, is_active, created_at FROM users WHERE id = ?', [id])!
}

export function listStaff(): Record<string, unknown>[] {
  const user = requirePermission('staff.manage')
  return queryAll(
    `SELECT id, name, email, role, mobile, is_active, last_login_at, created_at
     FROM users WHERE company_id = ? ORDER BY role, name`,
    [user.companyId],
  )
}

export function updateStaff(id: string, patch: { role?: Role; isActive?: boolean; name?: string; permissions?: string[] }): void {
  const actor = requirePermission('staff.manage')
  const target = queryOne<Record<string, unknown>>('SELECT * FROM users WHERE id = ? AND company_id = ?', [id, actor.companyId])
  if (!target) throw new AppError('Staff member not found.', 'NOT_FOUND')
  if (target.role === 'owner') throw new AppError('Owner account cannot be modified this way.', 'FORBIDDEN')

  run(
    `UPDATE users SET
      name = COALESCE(?, name),
      role = COALESCE(?, role),
      is_active = COALESCE(?, is_active),
      permissions = COALESCE(?, permissions),
      updated_at = ?
     WHERE id = ? AND company_id = ?`,
    [
      patch.name ?? null,
      patch.role ?? null,
      patch.isActive === undefined ? null : patch.isActive ? 1 : 0,
      patch.permissions ? JSON.stringify(patch.permissions) : null,
      now(),
      id,
      actor.companyId,
    ],
  )
  writeAudit(actor.companyId, actor, 'staff.updated', 'staff', id, 'Staff account updated')
  syncCompanyAccountsQuiet(actor.companyId)
}
