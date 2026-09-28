import { app, net } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { AppError } from '../security/session'

const REPO = 'realcaps04/bizora'

type ReleaseAsset = { name?: string; browser_download_url?: string }
type Release = { tag_name?: string; assets?: ReleaseAsset[] }

let pending: { version: string; url: string } | null = null
let installing = false

function versionParts(value: string): number[] {
  return value
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0)
}

function isNewer(latest: string, current: string): boolean {
  const next = versionParts(latest)
  const now = versionParts(current)
  const length = Math.max(next.length, now.length)
  for (let i = 0; i < length; i += 1) {
    const diff = (next[i] || 0) - (now[i] || 0)
    if (diff > 0) return true
    if (diff < 0) return false
  }
  return false
}

function allowedHost(hostname: string): boolean {
  return (
    hostname === 'github.com' ||
    hostname === 'api.github.com' ||
    hostname === 'objects.githubusercontent.com' ||
    hostname === 'release-assets.githubusercontent.com' ||
    hostname.endsWith('.githubusercontent.com')
  )
}

function request(url: string, headers: Record<string, string>, redirects = 0): Promise<import('node:http').IncomingMessage> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !allowedHost(parsed.hostname)) {
      reject(new AppError('The update link is not from the Bizora release.', 'VALIDATION'))
      return
    }
    const req = https.get(parsed, { headers }, (res) => {
      const location = res.headers.location
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && location) {
        res.resume()
        if (redirects > 5) {
          reject(new AppError('The update download was redirected too many times.', 'INTERNAL'))
          return
        }
        const next = new URL(location, parsed).toString()
        resolve(request(next, headers, redirects + 1))
        return
      }
      resolve(res)
    })
    req.setTimeout(20_000, () => {
      req.destroy(new Error('timed out'))
    })
    req.on('error', reject)
  })
}

async function readBody(url: string): Promise<string> {
  const res = await net.fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Bizora',
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    throw new AppError('GitHub did not answer the update check.', 'INTERNAL')
  }
  return res.text()
}

export type UpdateCheck = {
  current: string
  latest: string
  available: boolean
  reachable: boolean
}

function currentOffer(reachable: boolean): UpdateCheck {
  const current = app.getVersion()
  if (!pending) return { current, latest: current, available: false, reachable }
  return { current, latest: pending.version, available: true, reachable: true }
}

export async function checkForAppUpdate(): Promise<UpdateCheck> {
  if (installing) return currentOffer(true)
  const current = app.getVersion()
  let body = ''
  try {
    body = await readBody(`https://api.github.com/repos/${REPO}/releases/latest`)
  } catch {
    return currentOffer(false)
  }
  if (!body) return currentOffer(false)
  let release: Release
  try {
    release = JSON.parse(body) as Release
  } catch {
    return currentOffer(false)
  }
  const latest = String(release.tag_name || '').replace(/^v/i, '')
  const asset = (release.assets || []).find((item) => /Bizora-Setup-.*\.exe$/i.test(item.name || ''))
  const url = asset?.browser_download_url || ''
  if (!latest || !url || !isNewer(latest, current)) {
    pending = null
    return { current, latest: latest || current, available: false, reachable: true }
  }
  pending = { version: latest, url }
  return { current, latest, available: true, reachable: true }
}

export async function installAppUpdate(onProgress?: (percent: number) => void): Promise<{ version: string }> {
  if (installing) throw new AppError('The update is already downloading.', 'VALIDATION')
  if (!pending) throw new AppError('No update is ready.', 'NOT_FOUND')
  installing = true
  const { version, url } = pending
  const dest = path.join(app.getPath('temp'), `Bizora-Setup-${version}.exe`)
  try {
    const res = await request(url, { 'User-Agent': 'Bizora', Accept: 'application/octet-stream' })
    if (res.statusCode !== 200) {
      res.resume()
      throw new AppError('The update could not be downloaded.', 'INTERNAL')
    }
    const total = Number(res.headers['content-length']) || 0
    let received = 0
    await new Promise<void>((resolve, reject) => {
      const file = fs.createWriteStream(dest)
      res.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (total > 0) onProgress?.(Math.min(99, Math.round((received / total) * 100)))
      })
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
      file.on('error', reject)
      res.on('error', reject)
    })
  } catch (error) {
    installing = false
    fs.rmSync(dest, { force: true })
    throw error
  }
  onProgress?.(100)
  const child = spawn(dest, ['/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
  setTimeout(() => app.quit(), 600)
  return { version }
}
