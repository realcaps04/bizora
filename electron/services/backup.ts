import { app, dialog, BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { exportRawDatabase, persistNow, replaceDatabaseFromBuffer, queryOne, queryAll } from '../database'
import { deriveBackupKey, encryptBuffer, decryptBuffer, generateSalt, generateId } from '../security/crypto'
import { AppError, requirePermission, requireAuth } from '../security/session'
import { writeAudit } from './auth'
import { getSettings } from './catalog'

const MAGIC = Buffer.from('BIZORA1')

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

export async function createBackup(password: string): Promise<{ path: string; name: string }> {
  const user = requirePermission('backup.manage')
  if (!password || password.length < 6) {
    throw new AppError('Backup password must be at least 6 characters.', 'VALIDATION')
  }

  persistNow()
  const raw = exportRawDatabase()
  const salt = generateSalt()
  const key = deriveBackupKey(password, salt)
  const encrypted = encryptBuffer(raw, key)

  const company = queryOne<{ name: string }>('SELECT name FROM companies WHERE id = ?', [user.companyId])
  const meta = Buffer.from(
    JSON.stringify({
      app: 'Bizora',
      version: 1,
      companyId: user.companyId,
      companyName: company?.name ?? 'Business',
      createdAt: new Date().toISOString(),
      createdBy: user.name,
    }),
    'utf8',
  )

  // Format: MAGIC | saltLen(1) | salt | metaLen(4) | meta | ciphertext
  const metaLen = Buffer.alloc(4)
  metaLen.writeUInt32BE(meta.length, 0)
  const payload = Buffer.concat([MAGIC, Buffer.from([salt.length]), salt, metaLen, meta, encrypted])

  const dir = resolveBackupDir()
  mkdirSync(dir, { recursive: true })
  const name = `BusinessBackup_${stamp()}.bizora`
  const filePath = path.join(dir, name)
  writeFileSync(filePath, payload)

  writeAudit(user.companyId, user, 'backup.created', 'backup', null, `Backup created: ${name}`)
  return { path: filePath, name }
}

export async function inspectBackup(filePath: string, password: string) {
  if (!existsSync(filePath)) throw new AppError('Backup file not found.', 'NOT_FOUND')
  const payload = readFileSync(filePath)
  if (payload.subarray(0, 7).toString() !== 'BIZORA1') {
    throw new AppError('This file is not a valid Bizora backup.', 'INVALID_BACKUP')
  }
  const saltLen = payload[7]
  const salt = payload.subarray(8, 8 + saltLen)
  const metaLen = payload.readUInt32BE(8 + saltLen)
  const metaStart = 8 + saltLen + 4
  const meta = JSON.parse(payload.subarray(metaStart, metaStart + metaLen).toString('utf8')) as {
    companyName: string
    createdAt: string
  }
  const cipher = payload.subarray(metaStart + metaLen)
  const key = deriveBackupKey(password, salt)
  try {
    decryptBuffer(cipher, key)
  } catch {
    throw new AppError('Incorrect backup password.', 'INVALID_PASSWORD')
  }
  return meta
}

export async function restoreBackup(filePath: string, password: string) {
  const user = requirePermission('backup.manage')
  const payload = readFileSync(filePath)
  if (payload.subarray(0, 7).toString() !== 'BIZORA1') {
    throw new AppError('This file is not a valid Bizora backup.', 'INVALID_BACKUP')
  }

  const saltLen = payload[7]
  const salt = payload.subarray(8, 8 + saltLen)
  const metaLen = payload.readUInt32BE(8 + saltLen)
  const metaStart = 8 + saltLen + 4
  const meta = JSON.parse(payload.subarray(metaStart, metaStart + metaLen).toString('utf8'))
  const cipher = payload.subarray(metaStart + metaLen)
  const key = deriveBackupKey(password, salt)

  let raw: Buffer
  try {
    raw = decryptBuffer(cipher, key)
  } catch {
    throw new AppError('Incorrect backup password or corrupted backup.', 'INVALID_PASSWORD')
  }

  // Safety backup of current DB before restore
  try {
    const safetyDir = path.join(resolveBackupDir(), 'pre-restore')
    mkdirSync(safetyDir, { recursive: true })
    const safetyName = `PreRestore_${stamp()}.bizora`
    const safetyPass = generateId()
    const safetySalt = generateSalt()
    const safetyKey = deriveBackupKey(safetyPass, safetySalt)
    const safetyEnc = encryptBuffer(exportRawDatabase(), safetyKey)
    const safetyMeta = Buffer.from(JSON.stringify({ note: 'auto pre-restore', createdAt: new Date().toISOString() }), 'utf8')
    const ml = Buffer.alloc(4)
    ml.writeUInt32BE(safetyMeta.length, 0)
    writeFileSync(
      path.join(safetyDir, safetyName),
      Buffer.concat([MAGIC, Buffer.from([safetySalt.length]), safetySalt, ml, safetyMeta, safetyEnc]),
    )
  } catch {
    /* best-effort */
  }

  replaceDatabaseFromBuffer(raw)
  writeAudit(user.companyId, user, 'backup.restored', 'backup', null, `Restored backup from ${meta.createdAt}`)
  return meta
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
