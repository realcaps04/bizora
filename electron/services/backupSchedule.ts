import { getSession } from '../security/session'
import { createBackup, getBackupStatus } from './backup'
import { getSettings } from './catalog'
import { uploadLocalBackup } from './googleDrive'

const DAY = 24 * 60 * 60 * 1000
let running = false

async function runAutomaticBackup(): Promise<void> {
  if (running) return
  const session = getSession()
  if (!session.user || session.locked) return
  running = true
  try {
    const settings = getSettings()
    const schedule = settings.backup_schedule || 'manual'
    if (schedule === 'manual') return
    const status = getBackupStatus()
    const last = status.lastBackup ? new Date(status.lastBackup.mtime).getTime() : 0
    const wait = schedule === 'weekly' ? 7 * DAY : DAY
    const due = !last || Date.now() - last >= wait
    if (!due) {
      if (status.lastBackup) await uploadLocalBackup(status.lastBackup.path, status.lastBackup.name)
      return
    }
    const created = await createBackup()
    await uploadLocalBackup(created.path, created.name)
  } catch {
    /* a missed automatic backup can run again later */
  } finally {
    running = false
  }
}

export function startAutomaticBackups(): void {
  setTimeout(() => void runAutomaticBackup(), 20_000)
  setInterval(() => void runAutomaticBackup(), 30 * 60 * 1000)
}
