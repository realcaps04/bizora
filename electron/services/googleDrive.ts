import { app, safeStorage, shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { loadAccountEnv } from './accountCloud'
import { createBackup, getBackupStatus, restoreBackup } from './backup'
import { AppError, requirePermission } from '../security/session'
import { writeAudit } from './auth'
import { getSettings } from './catalog'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email'
const FOLDER_NAME = 'Bizora Backups'

type DriveSession = {
  refreshToken: string
  accessToken: string
  expiresAt: number
  email: string
  folderId: string
}

type OAuthConfig = { clientId: string; clientSecret: string }

export type DriveBackupFile = {
  id: string
  name: string
  createdAt: string
  size: number
}

function sessionPath(): string {
  return path.join(app.getPath('userData'), 'security', 'google-drive.bin')
}

function readDotEnv(key: string): string {
  const files = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), '..', '.env'),
    path.join(app.getAppPath(), '.env'),
    path.join(app.getAppPath(), '..', '.env'),
  ]
  for (const file of files) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1 || trimmed.slice(0, eq).trim() !== key) continue
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      return value.trim()
    }
  }
  return ''
}

function readOAuthConfig(): OAuthConfig {
  loadAccountEnv()
  let clientId = (process.env.GOOGLE_CLIENT_ID || readDotEnv('GOOGLE_CLIENT_ID')).trim()
  let clientSecret = (process.env.GOOGLE_CLIENT_SECRET || readDotEnv('GOOGLE_CLIENT_SECRET')).trim()
  const files = [
    path.join(app.getPath('userData'), 'google-oauth.json'),
    process.resourcesPath ? path.join(process.resourcesPath, 'google-oauth.json') : '',
  ].filter(Boolean)
  for (const file of files) {
    if ((clientId && clientSecret) || !existsSync(file)) continue
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
        clientId?: string
        clientSecret?: string
        client_id?: string
        client_secret?: string
        installed?: { client_id?: string; client_secret?: string }
        web?: { client_id?: string; client_secret?: string }
      }
      const nested = parsed.installed || parsed.web
      if (!clientId) clientId = String(parsed.clientId || parsed.client_id || nested?.client_id || '').trim()
      if (!clientSecret) clientSecret = String(parsed.clientSecret || parsed.client_secret || nested?.client_secret || '').trim()
    } catch {
      /* ignore a broken local config */
    }
  }
  return { clientId, clientSecret }
}

function assertGoogleUrl(urlStr: string): void {
  let url: URL
  try {
    url = new URL(urlStr)
  } catch {
    throw new AppError('Google Drive returned an unexpected address.', 'DRIVE')
  }
  const host = url.hostname
  const allowed = host === 'www.googleapis.com' || host === 'oauth2.googleapis.com' || host.endsWith('.googleapis.com')
  if (url.protocol !== 'https:' || !allowed) {
    throw new AppError('Google Drive returned an unexpected address.', 'DRIVE')
  }
}

async function googleFetch(url: string, init?: RequestInit): Promise<Response> {
  assertGoogleUrl(url)
  try {
    return await fetch(url, init)
  } catch {
    throw new AppError('Google Drive needs an internet connection.', 'DRIVE')
  }
}

async function googleError(res: Response, hadSecret = false): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: string | { message?: string }
    error_description?: string
  } | null
  const code = typeof body?.error === 'string' ? body.error : ''
  if (code === 'invalid_client') {
    if (!hadSecret) {
      return 'Google did not accept this sign-in client. Add the desktop client secret as GOOGLE_CLIENT_SECRET, then try again.'
    }
    return 'The client secret in .env does not match this Google sign-in client. In Google Cloud, open that desktop client and copy its Client secret into GOOGLE_CLIENT_SECRET again.'
  }
  if (typeof body?.error === 'string' && body.error_description) return body.error_description
  if (body?.error && typeof body.error === 'object' && body.error.message) return body.error.message
  return `Google Drive request failed (${res.status}).`
}

function readSession(): DriveSession | null {
  const file = sessionPath()
  if (!existsSync(file) || !safeStorage.isEncryptionAvailable()) return null
  try {
    const parsed = JSON.parse(safeStorage.decryptString(readFileSync(file))) as DriveSession
    if (!parsed.refreshToken) return null
    return parsed
  } catch {
    return null
  }
}

function writeSession(session: DriveSession): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new AppError('Windows could not protect the Google sign-in on this computer.', 'DRIVE')
  }
  mkdirSync(path.dirname(sessionPath()), { recursive: true })
  writeFileSync(sessionPath(), safeStorage.encryptString(JSON.stringify(session)))
}

function clearSession(): void {
  const file = sessionPath()
  if (existsSync(file)) unlinkSync(file)
}

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const { clientId, clientSecret } = readOAuthConfig()
  if (!clientId) throw new AppError('Google Drive is not configured on this computer.', 'DRIVE')
  const payload: Record<string, string> = { ...body, client_id: clientId }
  if (clientSecret) payload.client_secret = clientSecret
  const res = await googleFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(payload).toString(),
  })
  if (!res.ok) throw new AppError(await googleError(res, Boolean(clientSecret)), 'DRIVE')
  return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string }
}

async function accessToken(session: DriveSession): Promise<{ token: string; session: DriveSession }> {
  if (session.accessToken && session.expiresAt > Date.now() + 60_000) {
    return { token: session.accessToken, session }
  }
  const refreshed = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  })
  const next: DriveSession = {
    ...session,
    accessToken: refreshed.access_token,
    expiresAt: Date.now() + refreshed.expires_in * 1000,
    refreshToken: refreshed.refresh_token || session.refreshToken,
  }
  writeSession(next)
  return { token: next.accessToken, session: next }
}

async function apiJson<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  const res = await googleFetch(url, { ...init, headers })
  if (!res.ok) throw new AppError(await googleError(res), 'DRIVE')
  return (await res.json()) as T
}

function validId(id: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(id)
}

async function ensureFolder(token: string, session: DriveSession): Promise<DriveSession> {
  if (session.folderId && validId(session.folderId)) {
    const res = await googleFetch(
      `https://www.googleapis.com/drive/v3/files/${session.folderId}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.ok) {
      const info = (await res.json()) as { trashed?: boolean }
      if (!info.trashed) return session
    }
  }
  const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`)
  const found = await apiJson<{ files?: { id: string }[] }>(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1&spaces=drive`,
  )
  const existing = found.files?.[0]?.id
  if (existing && validId(existing)) {
    const next = { ...session, folderId: existing }
    writeSession(next)
    return next
  }
  const created = await apiJson<{ id: string }>(token, 'https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  if (!created.id || !validId(created.id)) throw new AppError('Google Drive did not create the backup folder.', 'DRIVE')
  const next = { ...session, folderId: created.id }
  writeSession(next)
  return next
}

function startLoopback(expectedState: string): Promise<{ redirectUri: string; code: Promise<string>; close: () => void }> {
  return new Promise((resolve, reject) => {
    let settled = false
    let finishCode!: (code: string) => void
    let failCode!: (error: Error) => void
    const code = new Promise<string>((res, rej) => {
      finishCode = res
      failCode = rej
    })
    void code.catch(() => undefined)
    const finish = (error: Error | null, authCode?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      if (error) failCode(error)
      else if (authCode) finishCode(authCode)
    }
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404)
        res.end()
        return
      }
      const failed = Boolean(url.searchParams.get('error'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<!doctype html><html><body style="font-family:Segoe UI,sans-serif;padding:48px;color:#0f172a"><h1 style="font-size:20px">Bizora</h1><p>${
          failed
            ? 'Sign-in was cancelled. You can close this window.'
            : 'Google Drive is connected. You can close this window and return to Bizora.'
        }</p></body></html>`,
      )
      if (failed) {
        finish(new AppError('Google sign-in was cancelled.', 'DRIVE'))
        return
      }
      const authCode = url.searchParams.get('code') || ''
      const state = url.searchParams.get('state') || ''
      if (!authCode || state !== expectedState) {
        finish(new AppError('Google sign-in could not be verified. Try again.', 'DRIVE'))
        return
      }
      finish(null, authCode)
    })
    const timer = setTimeout(() => {
      finish(new AppError('Google sign-in timed out. Try connecting again.', 'DRIVE'))
    }, 180_000)
    server.on('error', () => {
      finish(new AppError('Bizora could not open the Google sign-in on this computer.', 'DRIVE'))
      reject(new AppError('Bizora could not open the Google sign-in on this computer.', 'DRIVE'))
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        finish(new AppError('Bizora could not open the Google sign-in on this computer.', 'DRIVE'))
        reject(new AppError('Bizora could not open the Google sign-in on this computer.', 'DRIVE'))
        return
      }
      resolve({
        redirectUri: `http://127.0.0.1:${addr.port}/callback`,
        code,
        close: () => {
          clearTimeout(timer)
          server.close()
        },
      })
    })
  })
}

async function connectUnlocked(): Promise<DriveSession> {
  const user = requirePermission('backup.manage')
  const { clientId } = readOAuthConfig()
  if (!clientId) throw new AppError('Google Drive is not configured on this computer.', 'DRIVE')

  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(16).toString('hex')
  const loopback = await startLoopback(state)
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', loopback.redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', DRIVE_SCOPE)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('access_type', 'offline')
  authUrl.searchParams.set('prompt', 'consent')
  authUrl.searchParams.set('state', state)

  await shell.openExternal(authUrl.toString())
  let code = ''
  try {
    code = await loopback.code
  } finally {
    loopback.close()
  }

  const tokens = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    redirect_uri: loopback.redirectUri,
  })
  if (!tokens.refresh_token) {
    throw new AppError('Google did not allow Bizora to save this sign-in. Try connecting again.', 'DRIVE')
  }

  let email = ''
  try {
    const info = await apiJson<{ email?: string }>(tokens.access_token, 'https://www.googleapis.com/oauth2/v2/userinfo')
    email = info.email || ''
  } catch {
    email = ''
  }

  let session: DriveSession = {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    email,
    folderId: '',
  }
  writeSession(session)
  session = await ensureFolder(tokens.access_token, session)
  writeAudit(user.companyId, user, 'backup.drive_connected', 'backup', null, email ? `Google Drive connected: ${email}` : 'Google Drive connected')
  try {
    const latest = getBackupStatus().lastBackup
    if (latest) await uploadLocalBackup(latest.path, latest.name)
  } catch {
    /* connecting still succeeds if the first upload cannot run yet */
  }
  return session
}

export async function uploadLocalBackup(filePath: string, name: string): Promise<'uploaded' | 'skipped' | 'off'> {
  const user = requirePermission('backup.manage')
  const settings = getSettings()
  if (settings.google_drive_backup !== 'true') return 'off'
  const session = readSession()
  if (!session) return 'off'
  if (!existsSync(filePath)) return 'off'
  const auth = await accessToken(session)
  const withFolder = await ensureFolder(auth.token, auth.session)
  const already = await listFiles(auth.token, withFolder.folderId)
  if (already.some((file) => file.name === name)) return 'skipped'
  const data = readFileSync(filePath)
  await uploadFile(auth.token, withFolder.folderId, name, data)
  writeAudit(user.companyId, user, 'backup.drive_uploaded', 'backup', null, `Uploaded ${name} to Google Drive`)
  return 'uploaded'
}

export async function uploadLatestLocalBackup(): Promise<{ name: string; result: 'uploaded' | 'skipped' | 'off' }> {
  requirePermission('backup.manage')
  const latest = getBackupStatus().lastBackup
  if (!latest) throw new AppError('Create a backup on this computer first.', 'DRIVE')
  const result = await uploadLocalBackup(latest.path, latest.name)
  if (result === 'off') throw new AppError('Connect Google Drive before uploading the backup file.', 'DRIVE')
  return { name: latest.name, result }
}

let connectLock: Promise<{ email: string }> | null = null

export function connectDrive(): Promise<{ email: string }> {
  if (!connectLock) {
    connectLock = connectUnlocked()
      .then((session) => ({ email: session.email }))
      .finally(() => {
        connectLock = null
      })
  }
  return connectLock
}

async function listFiles(token: string, folderId: string): Promise<DriveBackupFile[]> {
  if (!validId(folderId)) return []
  const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`)
  const listed = await apiJson<{ files?: { id: string; name: string; createdTime?: string; size?: string }[] }>(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=createdTime desc&pageSize=20&fields=files(id,name,createdTime,size)`,
  )
  return (listed.files || [])
    .filter((file) => file.name.endsWith('.bizora') && validId(file.id))
    .map((file) => ({
      id: file.id,
      name: file.name,
      createdAt: file.createdTime || '',
      size: Number(file.size || 0),
    }))
}

export async function getDriveStatus(): Promise<{
  configured: boolean
  connected: boolean
  email: string | null
  backups: DriveBackupFile[]
}> {
  requirePermission('backup.manage')
  const configured = Boolean(readOAuthConfig().clientId)
  const session = readSession()
  if (!configured || !session) {
    return { configured, connected: false, email: null, backups: [] }
  }
  try {
    const auth = await accessToken(session)
    const withFolder = await ensureFolder(auth.token, auth.session)
    const backups = await listFiles(auth.token, withFolder.folderId)
    return { configured: true, connected: true, email: withFolder.email || session.email || null, backups }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/invalid_grant|expired or revoked/i.test(message)) {
      clearSession()
      return { configured: true, connected: false, email: null, backups: [] }
    }
    return { configured: true, connected: true, email: session.email || null, backups: [] }
  }
}

async function uploadFile(token: string, folderId: string, name: string, data: Buffer): Promise<string> {
  const start = await googleFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/octet-stream',
      'X-Upload-Content-Length': String(data.length),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  })
  if (!start.ok) throw new AppError(await googleError(start), 'DRIVE')
  const location = start.headers.get('location')
  if (!location) throw new AppError('Google Drive did not accept the backup.', 'DRIVE')
  assertGoogleUrl(location)
  const put = await googleFetch(location, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: new Uint8Array(data),
  })
  if (!put.ok) throw new AppError(await googleError(put), 'DRIVE')
  const saved = (await put.json()) as { id?: string }
  if (!saved.id) throw new AppError('Google Drive did not accept the backup.', 'DRIVE')
  return saved.id
}

export async function backupToDrive(): Promise<{ name: string }> {
  const local = await createBackup()
  try {
    const result = await uploadLocalBackup(local.path, local.name)
    if (result === 'off') {
      throw new AppError('The backup was saved on this computer. Connect Google Drive to upload that file.', 'DRIVE')
    }
  } catch (error) {
    if (error instanceof AppError && error.message.startsWith('The backup was saved')) throw error
    const message = error instanceof AppError ? error.message : 'Google Drive upload failed.'
    throw new AppError(`The backup was saved on this computer, but it was not uploaded. ${message}`, 'DRIVE')
  }
  return { name: local.name }
}

export async function restoreFromDrive(fileId: string) {
  const user = requirePermission('backup.manage')
  if (!validId(fileId)) throw new AppError('That Google Drive backup could not be opened.', 'DRIVE')
  const session = readSession()
  if (!session) throw new AppError('Connect Google Drive before restoring.', 'DRIVE')
  const auth = await accessToken(session)
  const res = await googleFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  })
  if (!res.ok) throw new AppError(await googleError(res), 'DRIVE')
  const data = Buffer.from(await res.arrayBuffer())
  const tempDir = path.join(app.getPath('temp'), 'bizora-drive')
  mkdirSync(tempDir, { recursive: true })
  const filePath = path.join(tempDir, `drive-${fileId}.bizora`)
  writeFileSync(filePath, data)
  try {
    const meta = await restoreBackup(filePath)
    writeAudit(user.companyId, user, 'backup.drive_restored', 'backup', null, 'Restored a backup from Google Drive')
    return meta
  } finally {
    try {
      unlinkSync(filePath)
    } catch {
      /* temp file is encrypted */
    }
  }
}

export async function disconnectDrive(): Promise<true> {
  const user = requirePermission('backup.manage')
  const session = readSession()
  if (!session?.refreshToken) return true
  try {
    await googleFetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: session.refreshToken }).toString(),
    })
  } catch {
    /* local sign-out still proceeds */
  }
  clearSession()
  writeAudit(user.companyId, user, 'backup.drive_disconnected', 'backup', null, 'Google Drive disconnected')
  return true
}
