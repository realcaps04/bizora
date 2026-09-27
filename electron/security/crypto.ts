import { argon2id, argon2Verify } from 'hash-wasm'
import { randomBytes, createCipheriv, createDecipheriv, scryptSync, createHash } from 'node:crypto'
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: randomBytes(16),
    parallelism: 1,
    memorySize: 19456,
    iterations: 2,
    hashLength: 32,
    outputType: 'encoded',
  })
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash })
  } catch {
    return false
  }
}

export async function hashPin(pin: string, salt: Buffer): Promise<string> {
  return argon2id({
    password: pin,
    salt,
    parallelism: 1,
    memorySize: 4096,
    iterations: 2,
    hashLength: 32,
    outputType: 'hex',
  })
}

export function generateId(): string {
  return randomBytes(16).toString('hex')
}

export function generateSalt(): Buffer {
  return randomBytes(16)
}

export function deriveBackupKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 })
}

export function encryptBuffer(data: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc])
}

export function decryptBuffer(payload: Buffer, key: Buffer): Buffer {
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const data = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

export function getOrCreateDbKey(userDataPath: string): Buffer {
  const keyPath = path.join(userDataPath, 'security', 'db.key')
  mkdirSync(path.dirname(keyPath), { recursive: true })

  if (existsSync(keyPath)) {
    try {
      const stored = readFileSync(keyPath)
      if (safeStorage.isEncryptionAvailable()) {
        const decoded = safeStorage.decryptString(stored)
        return Buffer.from(decoded, 'base64')
      }
      return Buffer.from(stored.toString('utf8'), 'base64')
    } catch {
      // Corrupt key file — regenerate (database will need re-init / restore)
    }
  }

  const key = randomBytes(32)
  const encoded = key.toString('base64')
  if (safeStorage.isEncryptionAvailable()) {
    writeFileSync(keyPath, safeStorage.encryptString(encoded))
  } else {
    writeFileSync(keyPath, encoded, 'utf8')
  }
  return key
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}
