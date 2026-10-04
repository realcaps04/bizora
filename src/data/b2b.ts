import { codeFromPlace, stateByCode, stateFromGstin } from '@/data/gstStates'

export const INVOICE_TYPES = ['Tax Invoice', 'Bill of Supply', 'Debit Note', 'Credit Note']
export const PAYMENT_TERMS = ['Immediate', '7 Days', '15 Days', '30 Days', '45 Days', '60 Days']
export const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid'] as const

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

export interface B2bDetails {
  gstin: string
  billingAddress: string
  state: string
  stateCode: string
  placeOfSupply: string
  placeTouched: boolean
  contactPerson: string
  mobile: string
  email: string
  pan: string
  shipDifferent: boolean
  shippingAddress: string
  customerCode: string
  paymentTerms: string
  creditLimit: string
  poNumber: string
  poDate: string
  reverseCharge: boolean
  invoiceType: string
  dueDate: string
  dueTouched: boolean
  deliveryChallan: string
  transporter: string
  vehicleNumber: string
  ewayBill: string
  referenceNumber: string
  notes: string
  paymentStatus: PaymentStatus
  paymentDate: string
  transactionRef: string
  bankDetails: string
}

export interface LineExtra {
  discountPercent: number
  cessRate: number
  otherCharges: number
  batch: string
  serial: string
  mrp: number
  description: string
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/

export function emptyB2b(placeOfSupply = ''): B2bDetails {
  return {
    gstin: '',
    billingAddress: '',
    state: '',
    stateCode: '',
    placeOfSupply,
    placeTouched: false,
    contactPerson: '',
    mobile: '',
    email: '',
    pan: '',
    shipDifferent: false,
    shippingAddress: '',
    customerCode: '',
    paymentTerms: '',
    creditLimit: '',
    poNumber: '',
    poDate: '',
    reverseCharge: false,
    invoiceType: 'Tax Invoice',
    dueDate: '',
    dueTouched: false,
    deliveryChallan: '',
    transporter: '',
    vehicleNumber: '',
    ewayBill: '',
    referenceNumber: '',
    notes: '',
    paymentStatus: 'unpaid',
    paymentDate: '',
    transactionRef: '',
    bankDetails: '',
  }
}

export function emptyLineExtra(): LineExtra {
  return {
    discountPercent: 0,
    cessRate: 0,
    otherCharges: 0,
    batch: '',
    serial: '',
    mrp: 0,
    description: '',
  }
}

function asRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>
  return {}
}

function textOf(data: Record<string, unknown>, key: string, fallback = ''): string {
  const value = data[key]
  return value == null ? fallback : String(value)
}

function numberOf(data: Record<string, unknown>, key: string): number {
  const value = Number(data[key])
  return Number.isFinite(value) ? value : 0
}

export function parseB2b(raw: unknown, placeOfSupply = ''): B2bDetails {
  const base = emptyB2b(placeOfSupply)
  const data = asRecord(raw)
  const status = textOf(data, 'paymentStatus')
  return {
    ...base,
    gstin: textOf(data, 'gstin').toUpperCase(),
    billingAddress: textOf(data, 'billingAddress'),
    state: textOf(data, 'state'),
    stateCode: textOf(data, 'stateCode'),
    placeOfSupply: textOf(data, 'placeOfSupply', base.placeOfSupply),
    placeTouched: Boolean(data.placeTouched) || Boolean(textOf(data, 'placeOfSupply').trim()),
    contactPerson: textOf(data, 'contactPerson'),
    mobile: textOf(data, 'mobile'),
    email: textOf(data, 'email'),
    pan: textOf(data, 'pan').toUpperCase(),
    shipDifferent: Boolean(data.shipDifferent),
    shippingAddress: textOf(data, 'shippingAddress'),
    customerCode: textOf(data, 'customerCode'),
    paymentTerms: textOf(data, 'paymentTerms'),
    creditLimit: textOf(data, 'creditLimit'),
    poNumber: textOf(data, 'poNumber'),
    poDate: textOf(data, 'poDate'),
    reverseCharge: Boolean(data.reverseCharge),
    invoiceType: textOf(data, 'invoiceType', base.invoiceType) || base.invoiceType,
    dueDate: textOf(data, 'dueDate'),
    dueTouched: Boolean(data.dueTouched),
    deliveryChallan: textOf(data, 'deliveryChallan'),
    transporter: textOf(data, 'transporter'),
    vehicleNumber: textOf(data, 'vehicleNumber'),
    ewayBill: textOf(data, 'ewayBill'),
    referenceNumber: textOf(data, 'referenceNumber'),
    notes: textOf(data, 'notes'),
    paymentStatus: status === 'paid' || status === 'partial' || status === 'unpaid' ? status : base.paymentStatus,
    paymentDate: textOf(data, 'paymentDate'),
    transactionRef: textOf(data, 'transactionRef'),
    bankDetails: textOf(data, 'bankDetails'),
  }
}

export function parseLineExtra(raw: unknown): LineExtra {
  const data = asRecord(raw)
  const base = emptyLineExtra()
  return {
    discountPercent: numberOf(data, 'discountPercent'),
    cessRate: numberOf(data, 'cessRate'),
    otherCharges: numberOf(data, 'otherCharges'),
    batch: textOf(data, 'batch'),
    serial: textOf(data, 'serial'),
    mrp: numberOf(data, 'mrp'),
    description: textOf(data, 'description'),
  }
}

export function serializeLineExtra(extra: LineExtra): string | null {
  const hasValue =
    extra.discountPercent > 0 ||
    extra.cessRate > 0 ||
    extra.otherCharges > 0 ||
    extra.mrp > 0 ||
    Boolean(extra.batch.trim() || extra.serial.trim() || extra.description.trim())
  return hasValue ? JSON.stringify(extra) : null
}

export function gstinError(value: string): string {
  const gstin = value.trim().toUpperCase()
  if (!gstin) return 'Enter the buyer GSTIN'
  if (!GSTIN_PATTERN.test(gstin)) return 'Enter a valid 15-character GSTIN'
  if (!stateByCode(gstin.slice(0, 2))) return 'GSTIN state code is not valid'
  return ''
}

export function panError(value: string): string {
  const pan = value.trim().toUpperCase()
  if (!pan) return ''
  if (!PAN_PATTERN.test(pan)) return 'Enter a valid PAN'
  return ''
}

export function dueDateFromTerms(invoiceDate: string, terms: string): string {
  const label = terms.trim()
  if (!label || !invoiceDate) return ''
  let days = 0
  if (/^immediate$/i.test(label)) days = 0
  else {
    const match = label.match(/^(\d+)\s*days?$/i)
    if (!match) return ''
    days = Number(match[1])
  }
  const date = new Date(`${invoiceDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function applyCustomerProfile(
  current: B2bDetails,
  customer: { phone?: string; email?: string; gstin?: string; address?: string; details?: string },
): B2bDetails {
  const saved = customer.details ? parseB2b(customer.details) : null
  const gstin = (customer.gstin || saved?.gstin || '').toUpperCase()
  const fromGstin = gstin ? stateFromGstin(gstin) : undefined
  return {
    ...current,
    gstin,
    billingAddress: saved?.billingAddress || customer.address || '',
    state: saved?.state || fromGstin?.name || current.state,
    stateCode: saved?.stateCode || fromGstin?.code || current.stateCode,
    placeOfSupply: saved?.placeOfSupply || current.placeOfSupply,
    placeTouched: Boolean(saved?.placeOfSupply) || current.placeTouched,
    contactPerson: saved?.contactPerson || '',
    mobile: customer.phone || saved?.mobile || '',
    email: customer.email || saved?.email || '',
    pan: saved?.pan || '',
    shipDifferent: saved?.shipDifferent || false,
    shippingAddress: saved?.shippingAddress || '',
    customerCode: saved?.customerCode || '',
    paymentTerms: saved?.paymentTerms || current.paymentTerms,
    creditLimit: saved?.creditLimit || '',
  }
}

export function validateB2bSale(input: {
  customerName: string
  details: B2bDetails
  invoiceDate: string
  paymentMethod: string
  paidAmount: number
  items: Array<{
    key: string
    productName: string
    hsn: string
    qty: number
    rate: number
    specification: string
    taxRate: number
  }>
}): Record<string, string> {
  const errors: Record<string, string> = {}
  const details = input.details
  if (!input.customerName.trim()) errors.customer = 'Enter the customer / business name'
  const gstin = gstinError(details.gstin)
  if (gstin) errors.gstin = gstin
  if (!details.billingAddress.trim()) errors.billingAddress = 'Enter the billing address'
  if (!details.state.trim()) errors.state = 'Select the state'
  if (!details.stateCode.trim()) errors.stateCode = 'State code is required'
  if (!details.placeOfSupply.trim()) errors.placeOfSupply = 'Select the place of supply'
  if (details.shipDifferent && !details.shippingAddress.trim()) errors.shippingAddress = 'Enter the shipping address'
  const pan = panError(details.pan)
  if (pan) errors.pan = pan
  if (details.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim())) {
    errors.email = 'Enter a valid email'
  }
  if (!details.invoiceType.trim()) errors.invoiceType = 'Select the invoice type'
  if (!input.invoiceDate) errors.invoiceDate = 'Enter the invoice date'
  if (!details.paymentStatus) errors.paymentStatus = 'Select the payment status'
  const paying = details.paymentStatus === 'paid' || details.paymentStatus === 'partial' || input.paidAmount > 0
  if (paying) {
    if (!input.paymentMethod.trim()) errors.paymentMethod = 'Select the payment method'
    if (!(input.paidAmount > 0)) errors.paidAmount = 'Enter the amount paid'
    if (!details.paymentDate) errors.paymentDate = 'Enter the payment date'
  }
  const lines = input.items.filter((item) => item.productName.trim())
  if (!lines.length) errors.items = 'Add at least one product'
  for (const item of lines) {
    if (!item.specification.trim()) errors[`unit:${item.key}`] = 'Select the unit'
    if (!(item.qty > 0)) errors[`qty:${item.key}`] = 'Enter the quantity'
    if (!(item.rate > 0)) errors[`rate:${item.key}`] = 'Enter the rate'
    if (item.taxRate > 0 && !item.hsn.trim()) errors[`hsn:${item.key}`] = 'Enter HSN/SAC'
  }
  return errors
}

export function isInterState(companyPlace: string, companyGstin: string, placeOfSupply: string): boolean {
  const supplyCode = codeFromPlace(placeOfSupply)
  const companyCode = codeFromPlace(companyPlace) || companyGstin.trim().slice(0, 2)
  return Boolean(supplyCode && companyCode && supplyCode !== companyCode)
}
