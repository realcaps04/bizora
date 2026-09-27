import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  FileText,
  Plus,
  Printer,
  Search,
  Settings,
  Trash2,
} from 'lucide-react'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { useAppStore } from '@/stores/app'
import { callApi, formatMoney, joinAddress, parseAddress } from '@/utils'
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
  return round2(Math.max(0, (taxable + discount) / q))
}

function emptyLine(): LineItem {
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productName: '',
    specification: '',
    hsn: '',
    qty: 1,
    rate: 0,
    discount: 0,
    taxRate: 18,
  }
}

function formatDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}-${m}-${y}`
}

export function NewSalePage() {
  const navigate = useNavigate()
  const { showToast } = useAppStore()
  const productSearchRef = useRef<HTMLInputElement>(null)

  const [invoiceNumber, setInvoiceNumber] = useState('…')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerOpen, setCustomerOpen] = useState(false)
  const [houseName, setHouseName] = useState('')
  const [place, setPlace] = useState('')
  const [gstin, setGstin] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [paidAmount, setPaidAmount] = useState(0)
  const [paidTouched, setPaidTouched] = useState(false)
  const [items, setItems] = useState<LineItem[]>(() => Array.from({ length: 2 }, () => emptyLine()))
  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null)
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
      const [num, cust] = await Promise.all([
        callApi(() => window.bizora.nextInvoiceNumber()),
        callApi(() => window.bizora.listCustomers({ pageSize: 200 })),
      ])
      setInvoiceNumber(num as string)
      setCustomers(((cust as { rows: Customer[] }).rows) || [])
    })()
  }, [])

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
      return { base, tax, taxRate: i.taxRate }
    })
    const taxable = round2(afterLines.reduce((s, i) => s + i.base, 0))
    const taxTotal = round2(afterLines.reduce((s, i) => s + i.tax, 0))
    const cgst = round2(taxTotal / 2)
    const sgst = round2(taxTotal / 2)
    const igst = 0
    const beforeRound = taxable + taxTotal
    const grandTotal = Math.round(beforeRound)
    const roundOff = round2(grandTotal - beforeRound)
    const avgHalf = afterLines[0]?.taxRate ? afterLines[0].taxRate / 2 : 9
    return { subtotal, discount, taxable, cgst, sgst, igst, roundOff, grandTotal, interState: false, avgHalf }
  }, [filledItems])

  useEffect(() => {
    if (!paidTouched) setPaidAmount(totals.grandTotal)
  }, [totals.grandTotal, paidTouched])

  const balance = round2(Math.max(0, totals.grandTotal - paidAmount))

  function selectCustomer(c: Customer) {
    setCustomerId(c.id)
    setCustomerQuery(c.name)
    const parsed = parseAddress(c.address)
    setHouseName(parsed.houseName)
    setPlace(parsed.place)
    setGstin(c.gstin || '')
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
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)))
  }

  function addBlankRow() {
    setItems((prev) => [...prev, emptyLine()])
  }

  function applyProduct(key: string, p: Product) {
    updateItem(key, {
      productId: p.id,
      productName: p.name,
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
          specification: '',
          hsn: p.hsn || '',
          qty: 1,
          rate: Number(p.selling_rate) || 0,
          discount: 0,
          taxRate: Number(p.tax_rate) || 18,
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
    setSaving(true)
    try {
      const result = await callApi(() =>
        window.bizora.createInvoice({
          customerId: customerId || undefined,
          customerName: selectedCustomer?.name || customerQuery || 'Walk-in Customer',
          invoiceDate,
          paymentMethod,
          interState: totals.interState,
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
          })),
        }),
      )
      const invoice = (result as { invoice: { id: string } }).invoice
      showToast(mode === 'draft' ? 'Draft saved' : 'Invoice generated', 'success')
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
              <h1 className="text-[18px] font-bold tracking-tight text-[#031C45]">Sales Invoice</h1>
              <p className="mt-0.5 text-[13px] text-[#62789A]">Create a new sales invoice.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
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

        {/* Customer */}
        <section className="rounded-[12px] border border-[#D8E4F2] bg-white p-4 shadow-[0_2px_10px_rgba(6,41,92,0.03)]">
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
                      onFocus={() => setCustomerOpen(true)}
                      onBlur={() => setTimeout(() => setCustomerOpen(false), 150)}
                      placeholder="Search customer by name, phone or code."
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
        </section>

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
            <table className="w-full min-w-[980px] text-left text-[13px]">
              <thead>
                <tr className="bg-[#F8FAFC] text-[11.5px] font-medium uppercase tracking-wide text-[#62789A]">
                  <th className="px-3 py-2.5 w-10">#</th>
                  <th className="px-3 py-2.5 min-w-[180px]">Product / Description</th>
                  <th className="px-3 py-2.5 min-w-[140px]">Size / Specification</th>
                  <th className="px-3 py-2.5 w-24">HSN</th>
                  <th className="px-3 py-2.5 w-20">Qty</th>
                  <th className="px-3 py-2.5 w-28">Rate (₹)</th>
                  <th className="px-3 py-2.5 w-28">Discount (₹)</th>
                  <th className="px-3 py-2.5 w-24">GST %</th>
                  <th className="px-3 py-2.5 w-28 text-right">Amount (₹)</th>
                  <th className="px-3 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const amount = lineAmount(item)
                  return (
                    <tr key={item.key} className="border-t border-[#E8EEF5]">
                      <td className="px-3 py-2 text-[#62789A]">{idx + 1}</td>
                      <td className="relative px-3 py-2">
                        <input
                          value={item.productName}
                          onChange={(e) => {
                            updateItem(item.key, { productName: e.target.value, productId: undefined })
                            setActiveRowKey(item.key)
                            setProductQuery(e.target.value)
                          }}
                          onFocus={() => {
                            setActiveRowKey(item.key)
                            if (item.productName) setProductQuery(item.productName)
                          }}
                          placeholder="Type or search product..."
                          className="h-8 w-full rounded border border-[#D8E4F2] px-2 text-[13px] outline-none focus:border-[#0878F9]"
                        />
                        {activeRowKey === item.key && productResults.length > 0 ? (
                          <div className="absolute left-3 right-3 top-[calc(100%-2px)] z-20 max-h-40 overflow-auto rounded-md border border-[#D8E4F2] bg-white shadow-lg">
                            {productResults.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] hover:bg-[#F5F9FF]"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => applyProduct(item.key, p)}
                              >
                                <span>{p.name}</span>
                                <span className="tabular-nums text-[#62789A]">{formatMoney(p.selling_rate)}</span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={item.specification}
                          onChange={(e) => updateItem(item.key, { specification: e.target.value })}
                          placeholder={'e.g. 30" x 80", White'}
                          className="h-8 w-full rounded border border-[#D8E4F2] px-2 text-[13px] outline-none focus:border-[#0878F9]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={item.hsn}
                          onChange={(e) => updateItem(item.key, { hsn: e.target.value })}
                          className="h-8 w-full rounded border border-[#D8E4F2] px-2 text-[13px] outline-none focus:border-[#0878F9]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.qty}
                          onChange={(e) => updateItem(item.key, { qty: Number(e.target.value) })}
                          className="h-8 w-full rounded border border-[#D8E4F2] px-2 text-[13px] tabular-nums outline-none focus:border-[#0878F9]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={item.rate}
                          onChange={(e) => updateItem(item.key, { rate: Number(e.target.value) })}
                          className="h-8 w-full rounded border border-[#D8E4F2] px-2 text-[13px] tabular-nums outline-none focus:border-[#0878F9]"
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
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={amount}
                          onChange={(e) => {
                            const nextAmount = Number(e.target.value) || 0
                            updateItem(item.key, {
                              rate: rateFromAmount(nextAmount, item.qty, item.discount, item.taxRate),
                            })
                          }}
                          className="h-8 w-full rounded border border-[#D8E4F2] px-2 text-right text-[13px] font-medium tabular-nums text-[#031C45] outline-none focus:border-[#0878F9]"
                        />
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
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Payment Method</span>
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
                <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Amount Paid (₹)</span>
                <Input
                  className="w-[140px]"
                  type="number"
                  min={0}
                  step="any"
                  value={paidAmount}
                  onChange={(e) => {
                    setPaidTouched(true)
                    setPaidAmount(Number(e.target.value) || 0)
                  }}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Balance (₹)</span>
                <Input className="w-[140px] bg-slate-50" readOnly value={balance} />
              </label>
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
                <FileText size={14} /> Generate Invoice
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
    </div>
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
