import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  ChevronDown,
  FileText,
  Plus,
  Printer,
  Search,
  Settings,
  Trash2,
} from 'lucide-react'
import { B2bSaleForm } from '@/components/B2bSaleForm'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { useAppStore } from '@/stores/app'
import { callApi, formatMoney, joinAddress, parseAddress } from '@/utils'
import {
  applyCustomerProfile,
  dueDateFromTerms,
  emptyB2b,
  emptyLineExtra,
  isInterState,
  parseB2b,
  parseLineExtra,
  serializeLineExtra,
  validateB2bSale,
  type B2bDetails,
  type PaymentStatus,
} from '@/data/b2b'
import { PRODUCT_UNITS, productUnit } from '@/data/units'
import type { Customer, Product } from '@/types'

interface LineItem {
  key: string
  productId?: string
  productName: string
  specification: string
  hsn: string
  qty: number
  rate: number
  discount: number
  taxRate: number
  discountPercent: number
  cessRate: number
  otherCharges: number
  batch: string
  serial: string
  mrp: number
  description: string
}

const GST_OPTIONS = [0, 5, 12, 18, 28]

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function lineAmount(item: Pick<LineItem, 'qty' | 'rate' | 'discount' | 'taxRate'>) {
  return round2(Math.max(0, item.qty * item.rate - item.discount) * (1 + item.taxRate / 100))
}

/** Derive unit rate from tax-inclusive amount: amount = (qty * rate - discount) * (1 + gst/100) */
function rateFromAmount(amount: number, qty: number, discount: number, taxRate: number) {
  const q = qty > 0 ? qty : 1
  const factor = 1 + taxRate / 100
  if (factor <= 0) return 0
  const taxable = amount / factor
  return Math.max(0, (taxable + discount) / q)
}

function sanitizeAmountInput(value: string) {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned
  return `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`
}

function splitStoredName(name: string): { productName: string; specification: string } {
  const match = name.match(/^(.*) \(([^)]+)\)$/)
  if (match) return { productName: match[1], specification: match[2] }
  return { productName: name, specification: 'Pcs' }
}

function emptyLine(): LineItem {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productName: '',
    specification: 'Pcs',
    hsn: '',
    qty: 1,
    rate: 0,
    discount: 0,
    taxRate: 18,
    ...emptyLineExtra(),
  }
}

function formatDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}-${m}-${y}`
}

export function NewSalePage({ invoiceId }: { invoiceId?: string } = {}) {
  const navigate = useNavigate()
  const { showToast } = useAppStore()
  const productSearchRef = useRef<HTMLInputElement>(null)

  const [invoiceNumber, setInvoiceNumber] = useState('…')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const customerInputRef = useRef<HTMLInputElement>(null)
  const [houseName, setHouseName] = useState('')
  const [place, setPlace] = useState('')
  const [gstin, setGstin] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [supplyType, setSupplyType] = useState('Business to Customer')
  const [b2b, setB2b] = useState<B2bDetails>(() => emptyB2b())
  const [companyPlace, setCompanyPlace] = useState('Kerala (32)')
  const [companyGstin, setCompanyGstin] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [itemMore, setItemMore] = useState<Record<string, boolean>>({})
  const [paidAmount, setPaidAmount] = useState(0)
  const [paidTouched, setPaidTouched] = useState(false)
  const [items, setItems] = useState<LineItem[]>(() => Array.from({ length: 2 }, () => emptyLine()))
  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null)
  const productAnchor = useRef<HTMLInputElement | null>(null)
  const [productMenu, setProductMenu] = useState<{ top: number; left: number; width: number } | null>(null)

  function placeProductMenu(el?: HTMLInputElement | null) {
    const node = el ?? productAnchor.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const width = Math.min(640, Math.max(rect.width, 560))
    const left = Math.min(rect.left, window.innerWidth - width - 8)
    setProductMenu({ top: rect.bottom + 4, left: Math.max(8, left), width })
  }
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    gstin: '',
    houseName: '',
    place: '',
  })

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase()
    if (!q) return customers.slice(0, 8)
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (c.gstin || '').toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [customers, customerQuery])

  const selectedCustomer = customers.find((c) => c.id === customerId)

  useEffect(() => {
    void (async () => {
      const tasks: Promise<unknown>[] = [callApi(() => window.bizora.listCustomers({ pageSize: 200 }))]
      if (!invoiceId) tasks.unshift(callApi(() => window.bizora.nextInvoiceNumber()))
      const result = await Promise.all(tasks)
      if (!invoiceId) setInvoiceNumber(result[0] as string)
      const cust = invoiceId ? result[0] : result[1]
      setCustomers(((cust as { rows: Customer[] }).rows) || [])
    })()
  }, [invoiceId])

  useEffect(() => {
    void callApi(() => window.bizora.getSettings())
      .then((settings) => {
        const place = String((settings as { place_of_supply?: string }).place_of_supply || 'Kerala (32)')
        setCompanyPlace(place)
        setB2b((prev) => (prev.placeOfSupply ? prev : { ...prev, placeOfSupply: place }))
      })
      .catch(() => {})
    void callApi(() => window.bizora.getCompany())
      .then((company) => setCompanyGstin(String((company as { gstin?: string } | null)?.gstin || '')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!invoiceId) return
    void (async () => {
      try {
        const data = (await callApi(() => window.bizora.getInvoice(invoiceId))) as {
          invoice: Record<string, unknown>
          items: Record<string, unknown>[]
          customer?: Record<string, unknown> | null
        }
        if (data.invoice.status === 'cancelled') {
          showToast('Cancelled invoices cannot be edited', 'error')
          navigate(`/invoices/${invoiceId}`)
          return
        }
        setInvoiceNumber(String(data.invoice.invoice_number || ''))
        setInvoiceDate(String(data.invoice.invoice_date || '').slice(0, 10))
        setCustomerId(data.invoice.customer_id ? String(data.invoice.customer_id) : '')
        setCustomerQuery(String(data.invoice.customer_name || ''))
        setPaymentMethod(String(data.invoice.payment_method || 'Cash'))
        setSupplyType(String(data.invoice.supply_type || 'Business to Customer'))
        const loaded = parseB2b(data.invoice.details, '')
        loaded.notes = data.invoice.notes ? String(data.invoice.notes) : loaded.notes
        const paymentStatus = String(data.invoice.payment_status || '')
        if (paymentStatus === 'paid' || paymentStatus === 'partial' || paymentStatus === 'unpaid') {
          loaded.paymentStatus = paymentStatus
        }
        setB2b(loaded)
        setPaidAmount(Number(data.invoice.paid_amount) || 0)
        setPaidTouched(true)
        if (data.customer) {
          const parsed = parseAddress(data.customer.address ? String(data.customer.address) : '')
          setHouseName(parsed.houseName)
          setPlace(parsed.place)
          setGstin(data.customer.gstin ? String(data.customer.gstin) : '')
        }
        const lines = data.items.map((row) => {
          const named = splitStoredName(String(row.product_name || ''))
          return {
            key: String(row.id || emptyLine().key),
            productId: row.product_id ? String(row.product_id) : undefined,
            productName: named.productName,
            specification: named.specification,
            hsn: row.hsn ? String(row.hsn) : '',
            qty: Number(row.qty) || 1,
            rate: Number(row.rate) || 0,
            discount: Number(row.discount) || 0,
            taxRate: Number(row.tax_rate) || 0,
            ...parseLineExtra(row.details),
          }
        })
        setItems(lines.length ? lines : [emptyLine()])
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to open this invoice', 'error')
        navigate('/invoices')
      }
    })()
  }, [invoiceId, navigate, showToast])

  useEffect(() => {
    if (!productQuery.trim()) {
      setProductResults([])
      return
    }
    const t = setTimeout(() => {
      void callApi(() => window.bizora.searchProducts(productQuery)).then((rows) =>
        setProductResults(rows as Product[]),
      )
    }, 150)
    return () => clearTimeout(t)
  }, [productQuery])

  useEffect(() => {
    if (!activeRowKey || productResults.length === 0) {
      setProductMenu(null)
      return
    }
    placeProductMenu()
    const onMove = () => placeProductMenu()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [activeRowKey, productResults])

  const isB2B = supplyType === 'Business to Business'
  const interState = isB2B && isInterState(companyPlace, companyGstin, b2b.placeOfSupply)

  const filledItems = useMemo(
    () => items.filter((i) => i.productName.trim() && i.qty > 0),
    [items],
  )

  const totals = useMemo(() => {
    const subtotal = round2(filledItems.reduce((s, i) => s + i.qty * i.rate, 0))
    const discount = round2(filledItems.reduce((s, i) => s + i.discount, 0))
    const afterLines = filledItems.map((i) => {
      const base = Math.max(0, i.qty * i.rate - i.discount)
      const tax = (base * i.taxRate) / 100
      const cess = (base * (i.cessRate || 0)) / 100
      const other = i.otherCharges || 0
      return { base, tax, cess, other, taxRate: i.taxRate }
    })
    const taxable = round2(afterLines.reduce((s, i) => s + i.base, 0))
    const taxTotal = round2(afterLines.reduce((s, i) => s + i.tax, 0))
    const cessTotal = round2(afterLines.reduce((s, i) => s + i.cess, 0))
    const otherTotal = round2(afterLines.reduce((s, i) => s + i.other, 0))
    const cgst = interState ? 0 : round2(taxTotal / 2)
    const sgst = interState ? 0 : round2(taxTotal / 2)
    const igst = interState ? taxTotal : 0
    const beforeRound = taxable + taxTotal + cessTotal + otherTotal
    const grandTotal = Math.round(beforeRound)
    const roundOff = round2(grandTotal - beforeRound)
    const avgHalf = afterLines[0]?.taxRate ? afterLines[0].taxRate / 2 : 9
    return {
      subtotal,
      discount,
      taxable,
      cgst,
      sgst,
      igst,
      cessTotal,
      otherTotal,
      roundOff,
      grandTotal,
      interState,
      avgHalf,
    }
  }, [filledItems, interState])

  useEffect(() => {
    if (!paidTouched && !isB2B) setPaidAmount(totals.grandTotal)
  }, [totals.grandTotal, paidTouched, isB2B])

  useEffect(() => {
    if (!isB2B) return
    setB2b((prev) => {
      if (prev.dueTouched) return prev
      const next = dueDateFromTerms(invoiceDate, prev.paymentTerms)
      if (!next || next === prev.dueDate) return prev
      return { ...prev, dueDate: next }
    })
  }, [invoiceDate, isB2B, b2b.paymentTerms])

  const balance = round2(Math.max(0, totals.grandTotal - paidAmount))

  function selectCustomer(c: Customer) {
    setCustomerId(c.id)
    setCustomerQuery(c.name)
    const parsed = parseAddress(c.address)
    setHouseName(parsed.houseName)
    setPlace(parsed.place)
    setGstin(c.gstin || '')
    setB2b((prev) => applyCustomerProfile(prev, c))
    setCustomerOpen(false)
  }

  function clearCustomer() {
    setCustomerId('')
    setCustomerQuery('')
    setHouseName('')
    setPlace('')
    setGstin('')
  }

  function updateItem(key: string, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key !== key) return item
        const next = { ...item, ...patch }
        if (
          patch.discount === undefined &&
          (patch.qty !== undefined || patch.rate !== undefined || patch.discountPercent !== undefined) &&
          next.discountPercent > 0
        ) {
          next.discount = round2((next.qty * next.rate * next.discountPercent) / 100)
        }
        if (patch.discount !== undefined && patch.discountPercent === undefined) {
          const base = next.qty * next.rate
          next.discountPercent = base > 0 ? round2((next.discount / base) * 100) : 0
        }
        return next
      }),
    )
  }

  function chooseEntry(next: string) {
    setSupplyType(next)
    setFieldErrors({})
    if (next !== 'Business to Business') {
      setPaidTouched(false)
      return
    }
    setB2b((prev) => ({
      ...prev,
      gstin: prev.gstin || gstin.toUpperCase(),
      billingAddress: prev.billingAddress || joinAddress(houseName, place),
      placeOfSupply: prev.placeOfSupply || companyPlace,
      invoiceType: prev.invoiceType || 'Tax Invoice',
      paymentStatus: paidTouched ? prev.paymentStatus : 'unpaid',
    }))
    if (!paidTouched) {
      setPaidAmount(0)
      setPaidTouched(true)
    }
  }

  function setPaymentStatus(status: PaymentStatus) {
    setPaidTouched(true)
    setB2b((prev) => ({
      ...prev,
      paymentStatus: status,
      paymentDate: status === 'unpaid' ? prev.paymentDate : prev.paymentDate || invoiceDate,
    }))
    if (status === 'paid') setPaidAmount(totals.grandTotal)
    if (status === 'unpaid') setPaidAmount(0)
  }

  function addBlankRow() {
    setItems((prev) => [...prev, emptyLine()])
  }

  function applyProduct(key: string, p: Product) {
    updateItem(key, {
      productId: p.id,
      productName: p.name,
      specification: productUnit(p.unit),
      hsn: p.hsn || '',
      rate: Number(p.selling_rate) || 0,
      taxRate: Number(p.tax_rate) || 18,
    })
    setProductQuery('')
    setProductResults([])
    setActiveRowKey(null)
  }

  function addProductFromSearch(p: Product) {
    setItems((prev) => {
      const blank = prev.find((i) => !i.productName.trim())
      if (blank) {
        return prev.map((i) =>
          i.key === blank.key
            ? {
                ...i,
                productId: p.id,
                productName: p.name,
                specification: productUnit(p.unit),
                hsn: p.hsn || '',
                rate: Number(p.selling_rate) || 0,
                taxRate: Number(p.tax_rate) || 18,
              }
            : i,
        )
      }
      return [
        ...prev,
        {
          key: `line-${Date.now()}`,
          productId: p.id,
          productName: p.name,
          specification: productUnit(p.unit),
          hsn: p.hsn || '',
          qty: 1,
          rate: Number(p.selling_rate) || 0,
          discount: 0,
          taxRate: Number(p.tax_rate) || 18,
          ...emptyLineExtra(),
          description: String((p as Product & { description?: string }).description || ''),
          mrp: Number((p as Product & { mrp?: number }).mrp) || 0,
        },
      ]
    })
    setProductQuery('')
    setProductResults([])
  }

  async function saveNewCustomer() {
    if (!newCustomer.name.trim()) {
      showToast('Enter customer name', 'error')
      return
    }
    try {
      const payload = {
        name: newCustomer.name,
        phone: newCustomer.phone,
        email: newCustomer.email,
        gstin: newCustomer.gstin,
        address: joinAddress(newCustomer.houseName, newCustomer.place),
      }
      const created = (await callApi(() => window.bizora.createCustomer(payload))) as Customer
      const list = await callApi(() => window.bizora.listCustomers({ pageSize: 200 }))
      setCustomers(((list as { rows: Customer[] }).rows) || [])
      if (created?.id) selectCustomer(created)
      else {
        const row = ((list as { rows: Customer[] }).rows || []).find(
          (c) => c.name.toLowerCase() === newCustomer.name.trim().toLowerCase(),
        )
        if (row) selectCustomer(row)
      }
      setNewCustomerOpen(false)
      setNewCustomer({ name: '', phone: '', email: '', gstin: '', houseName: '', place: '' })
      showToast('Customer added', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to add customer', 'error')
    }
  }

  async function save(mode: 'generate' | 'draft' | 'print' | 'pdf') {
    if (!filledItems.length) {
      showToast('Add at least one product', 'error')
      return
    }
    if (isB2B && mode !== 'draft') {
      const errors = validateB2bSale({
        customerName: customerQuery,
        details: b2b,
        invoiceDate,
        paymentMethod,
        paidAmount,
        items,
      })
      setFieldErrors(errors)
      const first = Object.values(errors)[0]
      if (first) {
        showToast(first, 'error')
        return
      }
    } else {
      setFieldErrors({})
    }
    setSaving(true)
    try {
      let nextCustomerId = customerId
      if (isB2B && customerQuery.trim()) {
        const profile = {
          name: customerQuery.trim(),
          phone: b2b.mobile,
          email: b2b.email,
          gstin: b2b.gstin,
          address: b2b.billingAddress,
          details: JSON.stringify(b2b),
        }
        if (nextCustomerId) {
          await callApi(() => window.bizora.updateCustomer({ id: nextCustomerId, ...profile }))
        } else {
          const created = (await callApi(() => window.bizora.createCustomer(profile))) as Customer
          nextCustomerId = created.id
          setCustomerId(created.id)
        }
      }
      const payload = {
        customerId: nextCustomerId || undefined,
        customerName: isB2B
          ? customerQuery.trim()
          : (selectedCustomer?.name || customerQuery).trim() ||
            (supplyType === 'Business to Customer' ? 'Cash Sales' : 'Walk-in Customer'),
        invoiceDate,
        paymentMethod,
        supplyType,
        notes: isB2B ? b2b.notes : undefined,
        details: isB2B ? JSON.stringify(b2b) : '',
        paymentDate: isB2B ? b2b.paymentDate : undefined,
        interState,
        paidAmount: mode === 'draft' ? 0 : paidAmount,
        status: mode === 'draft' ? 'draft' : 'confirmed',
        items: filledItems.map((i) => ({
          productId: i.productId,
          productName: i.specification.trim()
            ? `${i.productName} (${i.specification.trim()})`
            : i.productName,
          hsn: i.hsn || undefined,
          qty: i.qty,
          rate: i.rate,
          discount: i.discount,
          taxRate: i.taxRate,
          cessRate: i.cessRate,
          otherCharges: i.otherCharges,
          details: serializeLineExtra(i),
        })),
      }
      const result = await callApi(() =>
        invoiceId ? window.bizora.updateInvoice({ id: invoiceId, ...payload }) : window.bizora.createInvoice(payload),
      )
      const invoice = (result as { invoice: { id: string } }).invoice
      showToast(invoiceId ? 'Invoice updated' : mode === 'draft' ? 'Draft saved' : 'Invoice generated', 'success')
      if (mode === 'print' || mode === 'pdf') {
        navigate(`/invoices/${invoice.id}?print=1`)
      } else if (mode === 'draft') {
        navigate(`/invoices/${invoice.id}`)
      } else {
        navigate(`/invoices/${invoice.id}`)
      }
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "We couldn't save this invoice. Please check the information and try again.",
        'error',
      )
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save('generate')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="-m-5 flex min-h-[calc(100%+2.5rem)] flex-col bg-[#F5F7FA]">
      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#EAF4FF] text-[#0878F9]">
              <FileText size={20} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-[18px] font-bold tracking-tight text-[#031C45]">
                {invoiceId ? 'Edit invoice' : 'Sales Invoice'}
              </h1>
              <p className="mt-0.5 text-[13px] text-[#62789A]">
                {invoiceId ? 'Update this invoice. The invoice number stays the same.' : 'Create a new sales invoice.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Supply Type</span>
              <div className="relative">
                <select
                  value={supplyType}
                  onChange={(e) => chooseEntry(e.target.value)}
                  className="h-9 w-[220px] appearance-none rounded-md border border-[#D8E4F2] bg-white py-1.5 pl-3 pr-8 text-[13px] font-medium text-[#031C45] outline-none focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15"
                >
                  <option
                    value="Business to Customer"
                    style={{ backgroundColor: '#EAF4FF', color: '#031C45', fontWeight: 600 }}
                  >
                    Business to Customer
                  </option>
                  <option
                    value="Business to Business"
                    style={{ backgroundColor: '#EEF2FF', color: '#1E3A8A', fontWeight: 600 }}
                  >
                    Business to Business
                  </option>
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Invoice No.</span>
              <div className="relative">
                <input
                  readOnly
                  value={invoiceNumber}
                  className="h-9 w-[180px] rounded-md border border-[#D8E4F2] bg-white py-1.5 pl-3 pr-9 text-[13px] font-medium text-[#031C45] outline-none"
                />
                <button
                  type="button"
                  title="Invoice settings"
                  onClick={() => navigate('/settings')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0878F9]"
                >
                  <Settings size={14} />
                </button>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Date</span>
              <div className="relative">
                <Calendar
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                />
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="h-9 w-[160px] rounded-md border border-[#D8E4F2] bg-white py-1.5 pl-8 pr-2 text-[13px] text-[#031C45] outline-none focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15"
                  title={formatDisplayDate(invoiceDate)}
                />
              </div>
            </label>
          </div>
        </div>

        {isB2B ? (
          <B2bSaleForm
            customerQuery={customerQuery}
            customerOpen={customerOpen}
            customers={filteredCustomers}
            onCustomerQuery={(value) => {
              setCustomerQuery(value)
              setCustomerOpen(true)
              if (!value) clearCustomer()
            }}
            onCustomerFocus={() => setCustomerOpen(true)}
            onCustomerBlur={() => {
              setTimeout(() => setCustomerOpen(false), 150)
            }}
            onSelectCustomer={selectCustomer}
            onNewCustomer={() => setNewCustomerOpen(true)}
            value={b2b}
            onChange={(patch) => setB2b((prev) => ({ ...prev, ...patch }))}
            errors={fieldErrors}
            invoiceDate={invoiceDate}
          />
        ) : null}

        {/* Customer */}
        {!isB2B ? <section className="rounded-[12px] border border-[#D8E4F2] bg-white p-4 shadow-[0_2px_10px_rgba(6,41,92,0.03)]">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              <div>
                <span className="mb-1.5 block text-[12px] font-medium text-[#62789A]">Customer</span>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                    />
                    <input
                      value={customerQuery}
                      onChange={(e) => {
                        setCustomerQuery(e.target.value)
                        setCustomerOpen(true)
                        if (!e.target.value) clearCustomer()
                      }}
                      ref={customerInputRef}
                      onFocus={() => setCustomerOpen(true)}
                      onBlur={() =>
                        setTimeout(() => {
                          setCustomerOpen(false)
                        }, 150)
                      }
                      placeholder={
                        supplyType === 'Business to Customer'
                          ? 'Cash Sales'
                          : 'Search customer by name, phone or code.'
                      }
                      className="h-9 w-full rounded-md border border-[#D8E4F2] bg-white py-1.5 pl-9 pr-3 text-[13px] text-[#031C45] outline-none placeholder:text-[#94A3B8] focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15"
                    />
                    {customerOpen && filteredCustomers.length > 0 ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-48 overflow-auto rounded-md border border-[#D8E4F2] bg-white shadow-lg">
                        {filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex w-full flex-col px-3 py-2 text-left hover:bg-[#F5F9FF]"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectCustomer(c)}
                          >
                            <span className="text-[13px] font-medium text-[#031C45]">{c.name}</span>
                            <span className="text-[11.5px] text-[#62789A]">
                              {[c.phone, c.gstin].filter(Boolean).join(' · ') || 'No contact details'}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Button type="button" className="shrink-0" onClick={() => setNewCustomerOpen(true)}>
                    <Plus size={14} /> New
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-[12px] font-medium text-[#62789A]">House name</span>
                  <input
                    value={houseName}
                    onChange={(e) => setHouseName(e.target.value)}
                    placeholder="House / building name"
                    className="h-9 w-full rounded-md border border-[#D8E4F2] bg-white px-3 text-[13px] text-[#031C45] outline-none placeholder:text-[#94A3B8] focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15"
                  />
                </div>
                <div>
                  <span className="mb-1.5 block text-[12px] font-medium text-[#62789A]">Place</span>
                  <input
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    placeholder="Place / locality"
                    className="h-9 w-full rounded-md border border-[#D8E4F2] bg-white px-3 text-[13px] text-[#031C45] outline-none placeholder:text-[#94A3B8] focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 content-start sm:grid-cols-1">
              <Field label="GSTIN (optional)">
                <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="Enter GSTIN" />
              </Field>
            </div>
          </div>
        </section> : null}

        {/* Items */}
        <section className="rounded-[12px] border border-[#D8E4F2] bg-white shadow-[0_2px_10px_rgba(6,41,92,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8E4F2] px-4 py-3">
            <h2 className="text-[14px] font-semibold text-[#031C45]">Items</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                />
                <input
                  ref={productSearchRef}
                  value={productQuery}
                  onChange={(e) => {
                    setProductQuery(e.target.value)
                    setActiveRowKey(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && productResults[0]) {
                      e.preventDefault()
                      addProductFromSearch(productResults[0])
                    }
                  }}
                  placeholder="Search by name, code or HSN"
                  className="h-9 w-[240px] rounded-md border border-[#D8E4F2] bg-white py-1.5 pl-9 pr-3 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15"
                />
                {productQuery && !activeRowKey && productResults.length > 0 ? (
                  <div className="absolute right-0 top-[calc(100%+4px)] z-20 w-[320px] max-h-52 overflow-auto rounded-md border border-[#D8E4F2] bg-white shadow-lg">
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-[#F5F9FF]"
                        onClick={() => addProductFromSearch(p)}
                      >
                        <span>
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-2 text-[11px] text-[#62789A]">{p.sku || p.hsn}</span>
                        </span>
                        <span className="tabular-nums text-[#62789A]">{formatMoney(p.selling_rate)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <Button type="button" onClick={addBlankRow}>
                <Plus size={14} /> Add Item
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className={`w-full text-left text-[13px] ${isB2B ? 'min-w-[1180px]' : 'min-w-[980px]'}`}>
              <thead>
                <tr className="bg-[#F8FAFC] text-[11.5px] font-medium uppercase tracking-wide text-[#62789A]">
                  <th className="px-3 py-2.5 w-10">#</th>
                  <th className="px-3 py-2.5 min-w-[180px]">Product / Description</th>
                  <th className="px-3 py-2.5 min-w-[120px]">Unit</th>
                  <th className="px-3 py-2.5 w-24">HSN{isB2B ? ' *' : ''}</th>
                  <th className="px-3 py-2.5 w-20">Qty{isB2B ? ' *' : ''}</th>
                  <th className="px-3 py-2.5 w-28">Rate (₹){isB2B ? ' *' : ''}</th>
                  <th className="px-3 py-2.5 w-28">Discount (₹)</th>
                  <th className="px-3 py-2.5 w-24">GST %{isB2B ? ' *' : ''}</th>
                  {isB2B ? <th className="px-3 py-2.5 w-28 text-right">Taxable (₹)</th> : null}
                  <th className="px-3 py-2.5 w-36 text-right">{isB2B ? 'Line total (₹)' : 'Amount (₹)'}</th>
                  <th className="px-3 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const amount = lineAmount(item)
                  const base = Math.max(0, item.qty * item.rate - item.discount)
                  const taxable = round2(base)
                  const cessAmount = round2((base * item.cessRate) / 100)
                  const lineTotal = round2(base * (1 + item.taxRate / 100) + cessAmount + item.otherCharges)
                  const lineError = (field: string) =>
                    fieldErrors[`${field}:${item.key}`] ? 'border-[#DC2626]' : 'border-[#D8E4F2]'
                  return (
                    <Fragment key={item.key}>
                    <tr className="border-t border-[#E8EEF5]">
                      <td className="px-3 py-2 text-[#62789A]">{idx + 1}</td>
                      <td className="relative px-3 py-2">
                        <input
                          value={item.productName}
                          onChange={(e) => {
                            updateItem(item.key, { productName: e.target.value, productId: undefined })
                            setActiveRowKey(item.key)
                            setProductQuery(e.target.value)
                            productAnchor.current = e.currentTarget
                            placeProductMenu(e.currentTarget)
                          }}
                          onFocus={(e) => {
                            setActiveRowKey(item.key)
                            productAnchor.current = e.currentTarget
                            placeProductMenu(e.currentTarget)
                            if (item.productName) setProductQuery(item.productName)
                          }}
                          placeholder="Type or search product..."
                          className="h-8 w-full rounded border border-[#D8E4F2] px-2 text-[13px] outline-none focus:border-[#0878F9]"
                        />
                        {isB2B ? (
                          <button
                            type="button"
                            className="mt-1 text-[11px] font-medium text-[#0878F9]"
                            onClick={() => setItemMore((prev) => ({ ...prev, [item.key]: !prev[item.key] }))}
                          >
                            {itemMore[item.key] ? 'Hide extra fields' : 'Batch, MRP, cess…'}
                          </button>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={productUnit(item.specification)}
                          onChange={(e) => updateItem(item.key, { specification: e.target.value })}
                          className={`h-8 w-full rounded border bg-white px-2 text-[13px] outline-none focus:border-[#0878F9] ${lineError('unit')}`}
                        >
                          {PRODUCT_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                          {item.specification && !PRODUCT_UNITS.includes(item.specification) ? (
                            <option value={item.specification}>{item.specification}</option>
                          ) : null}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={item.hsn}
                          onChange={(e) => updateItem(item.key, { hsn: e.target.value })}
                          className={`h-8 w-full rounded border px-2 text-[13px] outline-none focus:border-[#0878F9] ${lineError('hsn')}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.qty}
                          onChange={(e) => updateItem(item.key, { qty: Number(e.target.value) })}
                          className={`h-8 w-full rounded border px-2 text-[13px] tabular-nums outline-none focus:border-[#0878F9] ${lineError('qty')}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.rate}
                          onChange={(e) => updateItem(item.key, { rate: Number(e.target.value) })}
                          className={`h-8 w-full rounded border px-2 text-[13px] tabular-nums outline-none focus:border-[#0878F9] ${lineError('rate')}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.discount}
                          onChange={(e) => updateItem(item.key, { discount: Number(e.target.value) })}
                          className="h-8 w-full rounded border border-[#D8E4F2] px-2 text-[13px] tabular-nums outline-none focus:border-[#0878F9]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={item.taxRate}
                          onChange={(e) => updateItem(item.key, { taxRate: Number(e.target.value) })}
                          className="h-8 w-full rounded border border-[#D8E4F2] px-1 text-[13px] outline-none focus:border-[#0878F9]"
                        >
                          {GST_OPTIONS.map((g) => (
                            <option key={g} value={g}>
                              {g}%
                            </option>
                          ))}
                        </select>
                      </td>
                      {isB2B ? (
                        <td className="px-3 py-2 text-right text-[13px] tabular-nums text-[#62789A]">{formatMoney(taxable)}</td>
                      ) : null}
                      <td className="px-3 py-2">
                        {isB2B ? (
                          <div className="h-8 rounded border border-[#E8EEF5] bg-[#F8FAFC] px-2 text-right text-[13px] font-medium leading-8 tabular-nums text-[#031C45]">
                            {formatMoney(lineTotal)}
                          </div>
                        ) : (
                          <input
                            inputMode="decimal"
                            placeholder="0.00"
                            value={amountDrafts[item.key] ?? (amount ? String(amount) : '')}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => {
                              const raw = sanitizeAmountInput(e.target.value)
                              setAmountDrafts((prev) => ({ ...prev, [item.key]: raw }))
                              const nextAmount = raw === '' || raw === '.' ? 0 : Number(raw)
                              updateItem(item.key, {
                                rate: rateFromAmount(nextAmount, item.qty, item.discount, item.taxRate),
                              })
                            }}
                            onBlur={() => {
                              setAmountDrafts((prev) => {
                                if (!(item.key in prev)) return prev
                                const next = { ...prev }
                                delete next[item.key]
                                return next
                              })
                            }}
                            className="h-8 w-full rounded border border-[#D8E4F2] px-2 text-right text-[13px] font-medium tabular-nums text-[#031C45] outline-none focus:border-[#0878F9]"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-[#94A3B8] hover:text-danger"
                          onClick={() =>
                            setItems((prev) =>
                              prev.length <= 1 ? [emptyLine()] : prev.filter((i) => i.key !== item.key),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                    {isB2B && itemMore[item.key] ? (
                      <tr className="border-t border-[#E8EEF5] bg-[#F8FAFC]">
                        <td colSpan={11} className="px-3 py-2">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                            <MiniField label="Discount %">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={item.discountPercent || ''}
                                onChange={(e) => updateItem(item.key, { discountPercent: Number(e.target.value) || 0 })}
                                className="h-8 w-full rounded border border-[#D8E4F2] bg-white px-2 text-[13px]"
                              />
                            </MiniField>
                            <MiniField label="Batch Number">
                              <input
                                value={item.batch}
                                onChange={(e) => updateItem(item.key, { batch: e.target.value })}
                                className="h-8 w-full rounded border border-[#D8E4F2] bg-white px-2 text-[13px]"
                              />
                            </MiniField>
                            <MiniField label="Serial Number">
                              <input
                                value={item.serial}
                                onChange={(e) => updateItem(item.key, { serial: e.target.value })}
                                className="h-8 w-full rounded border border-[#D8E4F2] bg-white px-2 text-[13px]"
                              />
                            </MiniField>
                            <MiniField label="MRP (₹)">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={item.mrp || ''}
                                onChange={(e) => updateItem(item.key, { mrp: Number(e.target.value) || 0 })}
                                className="h-8 w-full rounded border border-[#D8E4F2] bg-white px-2 text-[13px]"
                              />
                            </MiniField>
                            <MiniField label="Description">
                              <input
                                value={item.description}
                                onChange={(e) => updateItem(item.key, { description: e.target.value })}
                                className="h-8 w-full rounded border border-[#D8E4F2] bg-white px-2 text-[13px]"
                              />
                            </MiniField>
                            <MiniField label="Cess %">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={item.cessRate || ''}
                                onChange={(e) => updateItem(item.key, { cessRate: Number(e.target.value) || 0 })}
                                className="h-8 w-full rounded border border-[#D8E4F2] bg-white px-2 text-[13px]"
                              />
                            </MiniField>
                            <MiniField label="Cess amount">
                              <div className="h-8 rounded border border-[#E8EEF5] bg-white px-2 text-[13px] leading-8 tabular-nums">
                                {formatMoney(cessAmount)}
                              </div>
                            </MiniField>
                            <MiniField label="Other charges (₹)">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={item.otherCharges || ''}
                                onChange={(e) => updateItem(item.key, { otherCharges: Number(e.target.value) || 0 })}
                                className="h-8 w-full rounded border border-[#D8E4F2] bg-white px-2 text-[13px]"
                              />
                            </MiniField>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Totals */}
        <section className="rounded-[12px] border border-[#D8E4F2] bg-white px-4 py-3 shadow-[0_2px_10px_rgba(6,41,92,0.03)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            <InlineTotal label="Sub Total" value={formatMoney(totals.subtotal)} />
            <InlineTotal label="Discount" value={formatMoney(totals.discount)} />
            <InlineTotal label="Taxable" value={formatMoney(totals.taxable)} />
            {totals.interState ? (
              <InlineTotal label="IGST" value={formatMoney(totals.igst)} />
            ) : (
              <>
                <InlineTotal label={`CGST (${totals.avgHalf}%)`} value={formatMoney(totals.cgst)} />
                <InlineTotal label={`SGST (${totals.avgHalf}%)`} value={formatMoney(totals.sgst)} />
              </>
            )}
            {isB2B || totals.cessTotal > 0 ? <InlineTotal label="Cess" value={formatMoney(totals.cessTotal)} /> : null}
            {isB2B || totals.otherTotal > 0 ? (
              <InlineTotal label="Other charges" value={formatMoney(totals.otherTotal)} />
            ) : null}
            <div className="ml-auto flex items-center gap-2 rounded-md bg-[#EAF4FF] px-3 py-1.5">
              <span className="font-semibold text-[#031C45]">Grand Total</span>
              <span className="text-[14px] font-bold tabular-nums text-[#031C45]">
                {formatMoney(totals.grandTotal)}
              </span>
            </div>
          </div>
        </section>

        {/* Payment + actions */}
        <section className="rounded-[12px] border border-[#D8E4F2] bg-white p-4 shadow-[0_2px_10px_rgba(6,41,92,0.03)]">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap gap-3">
              {isB2B ? (
                <label className="block">
                  <span className="mb-1 block text-[12px] font-medium text-[#62789A]">
                    Payment Status <span className="text-[#DC2626]">*</span>
                  </span>
                  <Select
                    className="w-[140px]"
                    value={b2b.paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                  </Select>
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#62789A]">
                  Payment Method{isB2B && b2b.paymentStatus !== 'unpaid' ? <span className="text-[#DC2626]"> *</span> : null}
                </span>
                <Select
                  className="w-[160px]"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Credit'].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#62789A]">
                  Amount Paid (₹)
                  {isB2B && b2b.paymentStatus !== 'unpaid' ? <span className="text-[#DC2626]"> *</span> : null}
                </span>
                <Input
                  className="w-[140px]"
                  type="number"
                  min={0}
                  step="any"
                  value={paidAmount}
                  onChange={(e) => {
                    const next = Number(e.target.value) || 0
                    setPaidTouched(true)
                    setPaidAmount(next)
                    if (!isB2B) return
                    setB2b((prev) => ({
                      ...prev,
                      paymentStatus: next <= 0 ? 'unpaid' : next >= totals.grandTotal ? 'paid' : 'partial',
                      paymentDate: next > 0 ? prev.paymentDate || invoiceDate : prev.paymentDate,
                    }))
                  }}
                />
                {fieldErrors.paidAmount ? <span className="mt-1 block text-[12px] text-[#DC2626]">{fieldErrors.paidAmount}</span> : null}
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Balance (₹)</span>
                <Input className="w-[140px] bg-slate-50" readOnly value={balance} />
              </label>
              {isB2B && b2b.paymentStatus !== 'unpaid' ? (
                <>
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-[#62789A]">
                      Payment Date <span className="text-[#DC2626]">*</span>
                    </span>
                    <Input
                      className="w-[160px]"
                      type="date"
                      value={b2b.paymentDate}
                      onChange={(e) => setB2b((prev) => ({ ...prev, paymentDate: e.target.value }))}
                    />
                    {fieldErrors.paymentDate ? (
                      <span className="mt-1 block text-[12px] text-[#DC2626]">{fieldErrors.paymentDate}</span>
                    ) : null}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Transaction / Reference No.</span>
                    <Input
                      className="w-[180px]"
                      value={b2b.transactionRef}
                      onChange={(e) => setB2b((prev) => ({ ...prev, transactionRef: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Bank / UPI Details</span>
                    <Input
                      className="w-[220px]"
                      value={b2b.bankDetails}
                      onChange={(e) => setB2b((prev) => ({ ...prev, bankDetails: e.target.value }))}
                      placeholder="Optional"
                    />
                  </label>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => void save('print')}>
                <Printer size={14} /> Print
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => void save('pdf')}>
                <FileText size={14} /> Save as PDF
              </Button>
              <Button type="button" variant="outline" disabled={saving} onClick={() => void save('draft')}>
                Save Draft
              </Button>
              <Button type="button" disabled={saving} onClick={() => void save('generate')}>
                <FileText size={14} /> {invoiceId ? 'Save changes' : 'Generate Invoice'}
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={newCustomerOpen}
        title="Add Customer"
        onClose={() => setNewCustomerOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setNewCustomerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void saveNewCustomer()}>Save Customer</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Name">
            <Input
              value={newCustomer.name}
              onChange={(e) => setNewCustomer((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </Field>
          <Field label="Phone">
            <Input
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
          <Field label="Email">
            <Input
              value={newCustomer.email}
              onChange={(e) => setNewCustomer((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label="GSTIN">
            <Input
              value={newCustomer.gstin}
              onChange={(e) => setNewCustomer((f) => ({ ...f, gstin: e.target.value }))}
            />
          </Field>
          <Field label="House name">
            <Input
              value={newCustomer.houseName}
              onChange={(e) => setNewCustomer((f) => ({ ...f, houseName: e.target.value }))}
              placeholder="House / building name"
            />
          </Field>
          <Field label="Place">
            <Input
              value={newCustomer.place}
              onChange={(e) => setNewCustomer((f) => ({ ...f, place: e.target.value }))}
              placeholder="Place / locality"
            />
          </Field>
        </div>
      </Modal>
      {productMenu && activeRowKey && productResults.length > 0
        ? createPortal(
            <div
              className="fixed z-[80] max-h-56 overflow-auto rounded-md border border-[#D8E4F2] bg-white shadow-lg"
              style={{ top: productMenu.top, left: productMenu.left, width: productMenu.width }}
            >
              {productResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12.5px] hover:bg-[#F5F9FF]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyProduct(activeRowKey, p)}
                >
                  <span>
                    {p.name}
                    <span className="ml-2 text-[11px] text-[#62789A]">{productUnit(p.unit)}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[#62789A]">{formatMoney(p.selling_rate)}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[#62789A]">{label}</span>
      {children}
    </label>
  )
}

function InlineTotal({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-[#62789A]">{label}</span>
      <span className="font-medium tabular-nums text-[#031C45]">{value}</span>
    </div>
  )
}
