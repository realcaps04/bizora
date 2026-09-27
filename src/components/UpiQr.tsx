import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function isUpiId(value: string) {
  return /^[a-zA-Z0-9._-]{2,}@[a-zA-Z][a-zA-Z0-9.-]{1,}$/.test(value.trim())
}

export function upiPayLink(opts: { upiId: string; payeeName?: string; amount?: number; note?: string }) {
  const params = new URLSearchParams()
  params.set('pa', opts.upiId.trim())
  params.set('pn', (opts.payeeName || 'Merchant').trim().slice(0, 50) || 'Merchant')
  params.set('cu', 'INR')
  if (opts.amount && opts.amount > 0) params.set('am', opts.amount.toFixed(2))
  if (opts.note?.trim()) params.set('tn', opts.note.trim().slice(0, 50))
  return `upi://pay?${params.toString()}`
}

export function UpiQr({
  upiId,
  payeeName,
  amount,
  note,
  size = 132,
}: {
  upiId: string
  payeeName?: string
  amount?: number
  note?: string
  size?: number
}) {
  const [src, setSrc] = useState('')
  const valid = isUpiId(upiId)

  useEffect(() => {
    if (!valid) {
      setSrc('')
      return
    }
    let cancelled = false
    void QRCode.toDataURL(upiPayLink({ upiId, payeeName, amount, note }), {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
    }).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [upiId, payeeName, amount, note, size, valid])

  if (!src) return null
  return <img src={src} width={size} height={size} alt={`UPI QR for ${upiId.trim()}`} className="bg-white" />
}
