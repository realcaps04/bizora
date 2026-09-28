import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { useAppStore } from '@/stores/app'
import { callApi } from '@/utils'

const DISMISS_KEY = 'bizora-update-dismissed'
const CHECK_EVERY_MS = 15 * 60 * 1000

function dismissedVersion(): string {
  try {
    return sessionStorage.getItem(DISMISS_KEY) || ''
  } catch {
    return ''
  }
}

export function UpdatePrompt() {
  const setAppUpdate = useAppStore((s) => s.setAppUpdate)
  const [offer, setOffer] = useState<{ current: string; latest: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!window.bizora?.checkForUpdate) return
    let stopped = false
    let checking = false

    async function look() {
      if (stopped || checking || busy || !navigator.onLine) return
      checking = true
      try {
        const update = await callApi(() => window.bizora.checkForUpdate())
        if (stopped || !update) return
        setAppUpdate(update)
        if (!update.available || update.latest === dismissedVersion()) return
        setOffer({ current: update.current, latest: update.latest })
      } catch {
        // No connection, or GitHub did not answer. The next online event retries.
      } finally {
        checking = false
      }
    }

    void look()
    const timer = window.setInterval(() => void look(), CHECK_EVERY_MS)
    const onOnline = () => void look()
    window.addEventListener('online', onOnline)
    return () => {
      stopped = true
      window.clearInterval(timer)
      window.removeEventListener('online', onOnline)
    }
  }, [busy, setAppUpdate])

  useEffect(() => {
    if (!offer || !window.bizora.onUpdateProgress) return
    return window.bizora.onUpdateProgress(setPercent)
  }, [offer])

  if (!offer) return null

  async function update() {
    setBusy(true)
    setError('')
    try {
      await callApi(() => window.bizora.installUpdate())
    } catch (err) {
      setBusy(false)
      setError(err instanceof Error ? err.message : 'The update could not be downloaded.')
    }
  }

  function later() {
    try {
      sessionStorage.setItem(DISMISS_KEY, offer?.latest || '')
    } catch {
      // The prompt stays closed for this visit even if storage is blocked.
    }
    setOffer(null)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-white shadow-xl">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">A new version is available</h2>
        </div>
        <div className="px-4 py-4 text-sm text-ink">
          <p>
            Bizora {offer.latest} is the latest version. This computer is running {offer.current}.
          </p>
          <p className="mt-2 text-ink-muted">
            The update installs from this app and then Bizora restarts. Your bills and records stay on this PC.
          </p>
          {busy ? (
            <p className="mt-3 font-medium">
              Downloading the latest version{percent > 0 ? `… ${percent}%` : '…'}
            </p>
          ) : null}
          {error ? <p className="mt-3 text-danger">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="outline" disabled={busy} onClick={later}>
            Later
          </Button>
          <Button disabled={busy} onClick={() => void update()}>
            Update to latest
          </Button>
        </div>
      </div>
    </div>
  )
}
