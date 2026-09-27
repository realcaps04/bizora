import { type Database, type SqlJsStatic } from 'sql.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { app } from 'electron'
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema'
import { decryptBuffer, encryptBuffer, getOrCreateDbKey } from '../security/crypto'

const require = createRequire(import.meta.url)

let SQL: SqlJsStatic | null = null
let db: Database | null = null
let dbPath = ''
let dbKey: Buffer | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL
  // Load via CommonJS so Electron ESM main doesn't bundle sql.js (__dirname issue)
  const initSqlJs = require('sql.js') as (cfg?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
  SQL = await initSqlJs({
    locateFile: () => pathToFileURL(wasmPath).href,
  })
  return SQL
}

function getDbFilePath(): string {
  const dir = path.join(app.getPath('userData'), 'data')
  mkdirSync(dir, { recursive: true })
  return path.join(dir, 'bizora.db.enc')
}

export async function initDatabase(): Promise<void> {
  const sql = await loadSqlJs()
  dbPath = getDbFilePath()
  dbKey = getOrCreateDbKey(app.getPath('userData'))

  if (existsSync(dbPath)) {
    const encrypted = readFileSync(dbPath)
    try {
      const decrypted = decryptBuffer(encrypted, dbKey)
      db = new sql.Database(new Uint8Array(decrypted))
    } catch {
      throw new Error(
        'Unable to open the local database. The file may be corrupted or the encryption key changed.',
      )
    }
  } else {
    db = new sql.Database()
  }

  db.run(SCHEMA_SQL)
  ensureProductColumns()
  const version = getMeta('schema_version')
  if (!version) {
    setMeta('schema_version', SCHEMA_VERSION)
    setMeta('created_at', new Date().toISOString())
  }
  persistNow()
}

const PRODUCT_EXTRA_COLUMNS: Array<[string, string]> = [
  ['brand', 'TEXT'],
  ['mrp', 'REAL NOT NULL DEFAULT 0'],
  ['reorder_level', 'REAL NOT NULL DEFAULT 0'],
  ['location', 'TEXT'],
  ['description', 'TEXT'],
  ['supplier', 'TEXT'],
  ['product_type', 'TEXT'],
]

function ensureProductColumns(): void {
  const cols = queryAll<{ name: string }>('PRAGMA table_info(products)')
  const have = new Set(cols.map((col) => col.name))
  for (const [name, ddl] of PRODUCT_EXTRA_COLUMNS) {
    if (!have.has(name)) run(`ALTER TABLE products ADD COLUMN ${name} ${ddl}`)
  }
}

export function getDb(): Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function getMeta(key: string): string | null {
  const row = queryOne<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])
  return row?.value ?? null
}

export function setMeta(key: string, value: string): void {
  run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value])
}

export function run(sql: string, params: unknown[] = []): void {
  const database = getDb()
  database.run(sql, params as never[])
  const trimmed = sql.trim().toUpperCase()
  if (trimmed === 'BEGIN' || trimmed === 'COMMIT' || trimmed === 'ROLLBACK') {
    return
  }
  schedulePersist()
}

export function queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const database = getDb()
  const stmt = database.prepare(sql)
  stmt.bind(params as never[])
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

export function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  const rows = queryAll<T>(sql, params)
  return rows[0] ?? null
}

export function withTransaction<T>(fn: () => T): T {
  run('BEGIN')
  try {
    const result = fn()
    run('COMMIT')
    persistNow()
    return result
  } catch (err) {
    try {
      run('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw err
  }
}

function schedulePersist(): void {
  dirty = true
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistNow()
  }, 250)
}

export function persistNow(): void {
  if (!db || !dbKey) return
  const data = Buffer.from(db.export())
  const encrypted = encryptBuffer(data, dbKey)
  const tmp = `${dbPath}.tmp`
  writeFileSync(tmp, encrypted)
  renameSync(tmp, dbPath)
  dirty = false
}

export function exportRawDatabase(): Buffer {
  persistNow()
  return Buffer.from(getDb().export())
}

export function replaceDatabaseFromBuffer(raw: Buffer): void {
  if (!SQL || !dbKey) throw new Error('Database not ready')
  persistNow()
  db?.close()
  db = new SQL.Database(new Uint8Array(raw))
  db.run(SCHEMA_SQL)
  persistNow()
}

export function getDatabasePath(): string {
  return dbPath
}

export function isDirty(): boolean {
  return dirty
}

export function closeDatabase(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistNow()
  db?.close()
  db = null
}
