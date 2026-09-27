import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { ApiResult } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMoney(value: number | null | undefined, currency = 'INR'): string {
  const n = Number(value) || 0
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(n)
  } catch {
    return `₹${n.toFixed(2)}`
  }
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ''}`
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h && r) return `${ONES[h]} Hundred ${twoDigits(r)}`
  if (h) return `${ONES[h]} Hundred`
  return twoDigits(r)
}

/** Indian numbering: Crore / Lakh / Thousand */
export function amountInWords(value: number | null | undefined): string {
  const n = Math.round(Math.abs(Number(value) || 0))
  if (n === 0) return 'Zero Rupees only'
  const crore = Math.floor(n / 10000000)
  const lakh = Math.floor((n % 10000000) / 100000)
  const thousand = Math.floor((n % 100000) / 1000)
  const hundred = n % 1000
  const parts: string[] = []
  if (crore) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`)
  if (hundred) parts.push(threeDigits(hundred))
  return `${parts.join(' ')} Rupees only`
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function parseAddress(address?: string | null): { houseName: string; place: string } {
  const raw = (address || '').trim()
  if (!raw) return { houseName: '', place: '' }
  if (raw.includes('\n')) {
    const [house, ...rest] = raw.split('\n')
    return { houseName: house.trim(), place: rest.join(', ').trim() }
  }
  const idx = raw.indexOf(',')
  if (idx === -1) return { houseName: raw, place: '' }
  return { houseName: raw.slice(0, idx).trim(), place: raw.slice(idx + 1).trim() }
}

export function joinAddress(houseName: string, place: string): string {
  return [houseName.trim(), place.trim()].filter(Boolean).join(', ')
}

export async function callApi<T>(fn: () => Promise<ApiResult<T>>): Promise<T> {
  const result = await fn()
  if (!result.ok) {
    const err = new Error(result.error.message) as Error & { code?: string; detail?: string }
    err.code = result.error.code
    err.detail = result.error.detail
    throw err
  }
  return result.data
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export function statusTone(status: string): string {
  const s = status.toLowerCase()
  if (['paid', 'active', 'accepted', 'confirmed'].includes(s)) return 'success'
  if (['partial', 'partially paid', 'sent', 'draft'].includes(s)) return 'warning'
  if (['cancelled', 'rejected', 'inactive', 'unpaid'].includes(s)) return s === 'unpaid' ? 'warning' : 'danger'
  return 'neutral'
}
