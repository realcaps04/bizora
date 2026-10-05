import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Calendar, FileText, Plus, Printer, Search, Settings, Trash2, Truck } from 'lucide-react'
import { Button, Field, Input, Modal, Select } from '@/components/ui'
import { GST_BUSINESSES, type GstBusinessRecord } from '@/data/gstBusinesses'
import { useAppStore } from '@/stores/app'
import { callApi, formatMoney, joinAddress, parseAddress } from '@/utils'
import type { Product } from '@/types'

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
  amountOverride?: number
}

interface SupplierOption {
  name: string
  houseName?: string
  place?: string
  address?: string
  gstin?: string
}

const GST_OPTIONS = [0, 5, 12, 18, 28]

const SUPPLIERS_KEY = 'bizora.suppliers'

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function lineAmount(item: Pick<LineItem, 'qty' | 'rate' | 'discount' | 'taxRate' | 'amountOverride'>) {
  if (item.amountOverride != null && Number.isFinite(item.amountOverride)) return round2(Math.max(0, item.amountOverride))
  return round2(Math.max(0, item.qty * item.rate - item.discount) * (1 + item.taxRate / 100))
}

function formatAmountInput(n: number) {
  const rounded = round2(n)
  return String(rounded)
}

function rateFromAmount(amount: number, qty: number, discount: number, taxRate: number) {
  const q = qty > 0 ? qty : 1
  const factor = 1 + taxRate / 100
  if (factor <= 0) return 0
  return round2(Math.max(0, (amount / factor + discount) / q))
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

function loadSavedSuppliers(): SupplierOption[] {
  try {
    const raw = localStorage.getItem(SUPPLIERS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SupplierOption[]
  } catch {
    return []
  }
}

function saveSupplier(supplier: SupplierOption) {
  const list = loadSavedSuppliers()
  const next = [supplier, ...list.filter((s) => s.name.toLowerCase() !== supplier.name.toLowerCase())].slice(0, 50)
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(next))
}

export function NewPurchasePage() {
  const navigate = useNavigate()
  const { showToast } = useAppStore()
  const productSearchRef = useRef<HTMLInputElement>(null)
  const productAnchor = useRef<HTMLElement | null>(null)
  const [productMenu, setProductMenu] = useState<{ top: number; left: number; width: number } | null>(null)
  const [amountDraft, setAmountDraft] = useState<Record<string, string>>({})

  function placeProductMenu(el?: HTMLElement | null) {
    const node = el ?? productAnchor.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const width = Math.min(640, window.innerWidth - 16)
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
    const menuHeight = 224
    const spaceBelow = window.innerHeight - rect.bottom
    const top = spaceBelow < 160 && rect.top > spaceBelow ? Math.max(8, rect.top - 4 - menuHeight) : rect.bottom + 4
    setProductMenu({ top, left, width })
  }

  const [purchaseNumber, setPurchaseNumber] = useState('…')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [suppliers, setSuppliers] = useState<SupplierOption[]>(() => loadSavedSuppliers())
  const [gstBusinesses, setGstBusinesses] = useState<GstBusinessRecord[]>(GST_BUSINESSES)
  const [newNameOpen, setNewNameOpen] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [houseName, setHouseName] = useState('')
  const [place, setPlace] = useState('')
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('')
  const [gstin, setGstin] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [paidAmount, setPaidAmount] = useState(0)
  const [paidTouched, setPaidTouched] = useState(false)
  const [items, setItems] = useState<LineItem[]>(() => Array.from({ length: 2 }, () => emptyLine()))
  const [productQuery, setProductQuery] = useState('')
  const [productSearchOpen, setProductSearchOpen] = useState(false)
  const [productResults, setProductResults] = useState<Product[]>([])
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [newSupplierOpen, setNewSupplierOpen] = useState(false)
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    gstin: '',
    houseName: '',
    place: '',
  })

  function matchGstBusinesses(query: string) {
    const q = query.trim().toLowerCase()
    const rows = q
      ? gstBusinesses.filter(
          (business) =>
            business.name.toLowerCase().includes(q) ||
            business.gstin.toLowerCase().includes(q) ||
            business.address.toLowerCase().includes(q),
        )
      : gstBusinesses
    return rows.slice(0, 8)
  }

  const filteredGstBusinesses = useMemo(
    () => matchGstBusinesses(supplierName),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gstBusinesses, supplierName],
  )
  const newSupplierMatches = useMemo(
    () => matchGstBusinesses(newSupplier.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gstBusinesses, newSupplier.name],
  )

  const filteredSuppliers = useMemo(() => {
    const q = supplierName.trim().toLowerCase()
    if (!q) return suppliers.slice(0, 8)
    return suppliers.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 8)
  }, [suppliers, supplierName])

  useEffect(() => {
    void (async () => {
      const [num, purchases] = await Promise.all([
        callApi(() => window.bizora.nextPurchaseNumber()),
        callApi(() => window.bizora.listPurchases({ pageSize: 100 })),
      ])
      setPurchaseNumber(num as string)
      const rows = ((purchases as { rows: { supplier_name?: string }[] }).rows) || []
      const fromHistory = rows
        .map((r) => r.supplier_name)
        .filter(Boolean)
        .map((name) => ({ name: String(name) }))
      const merged = [...loadSavedSuppliers()]
      for (const s of fromHistory) {
        if (!merged.some((m) => m.name.toLowerCase() === s.name.toLowerCase())) merged.push(s)
      }
      setSuppliers(merged)
      try {
        const directory = (await callApi(() => window.bizora.listGstBusinesses())) as GstBusinessRecord[]
        if (directory.length) setGstBusinesses(directory)
      } catch {
        /* The copy shipped with the app stays available. */
      }
    })()
  }, [])

  useEffect(() => {
    const showDefaults = Boolean(activeRowKey || productSearchOpen)
    if (!productQuery.trim() && !showDefaults) {
      setProductResults([])
      return
    }
    const t = setTimeout(() => {
      void callApi(() => window.bizora.searchProducts(productQuery)).then((rows) =>
        setProductResults(rows as Product[]),
      )
    }, productQuery.trim() ? 150 : 0)
    return () => clearTimeout(t)
  }, [productQuery, activeRowKey, productSearchOpen])

  useEffect(() => {
    const headerOpen = Boolean(productSearchOpen && !activeRowKey && productResults.length)
    const rowOpen = Boolean(activeRowKey && productResults.length)
    if (!headerOpen && !rowOpen) {
      setProductMenu(null)
      return
    }
    placeProductMenu(rowOpen ? productAnchor.current : productSearchRef.current)
    const onMove = () => placeProductMenu(rowOpen ? productAnchor.current : productSearchRef.current)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [activeRowKey, productResults, productQuery, productSearchOpen])

  const filledItems = useMemo(
    () => items.filter((i) => i.productName.trim() && i.productId && i.qty > 0),
    [items],
  )

  const totals = useMemo(() => {
    const subtotal = round2(filledItems.reduce((s, i) => s + i.qty * i.rate, 0))
    const discount = round2(filledItems.reduce((s, i) => s + i.discount, 0))
    const afterLines = filledItems.map((i) => {
      if (i.amountOverride != null && Number.isFinite(i.amountOverride)) {
        const gross = round2(Math.max(0, i.amountOverride))
        const factor = 1 + i.taxRate / 100
        const base = factor > 0 ? gross / factor : gross
        return { base, tax: gross - base, taxRate: i.taxRate }
      }
      const base = Math.max(0, i.qty * i.rate - i.discount)
      const tax = (base * i.taxRate) / 100
      return { base, tax, taxRate: i.taxRate }
    })
    const taxable = round2(afterLines.reduce((s, i) => s + i.base, 0))
    const taxTotal = round2(afterLines.reduce((s, i) => s + i.tax, 0))
    const cgst = round2(taxTotal / 2)
    const sgst = round2(taxTotal / 2)
    const igst = 0
    const grandTotal = Math.round(taxable + taxTotal)
    const avgHalf = afterLines[0]?.taxRate ? afterLines[0].taxRate / 2 : 9
    return { subtotal, discount, taxable, cgst, sgst, igst, grandTotal, interState: false, avgHalf }
  }, [filledItems])

  useEffect(() => {
    if (!paidTouched) setPaidAmount(totals.grandTotal)
  }, [totals.grandTotal, paidTouched])

  const balance = round2(Math.max(0, totals.grandTotal - paidAmount))

  function selectGstBusiness(business: GstBusinessRecord) {
    const parsed = parseAddress(business.address)
    selectSupplier({
      name: business.name,
      gstin: business.gstin,
      houseName: parsed.houseName,
      place: parsed.place,
      address: business.address,
    })
  }

  function fillNewSupplierFromGst(business: GstBusinessRecord) {
    const parsed = parseAddress(business.address)
    setNewSupplier((current) => ({
      ...current,
      name: business.name,
      gstin: business.gstin,
      houseName: parsed.houseName,
      place: parsed.place,
    }))
    setNewNameOpen(false)
  }

  function selectSupplier(s: SupplierOption) {
    setSupplierName(s.name)
    const parsed = parseAddress(s.address || joinAddress(s.houseName || '', s.place || ''))
    setHouseName(parsed.houseName || s.houseName || '')
    setPlace(parsed.place || s.place || '')
    setGstin(s.gstin || '')
    setSupplierOpen(false)
  }

  function updateItem(key: string, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.key !== key) return i
        const next = { ...i, ...patch }
        const editsSource =
          !('amountOverride' in patch) &&
          ('qty' in patch || 'rate' in patch || 'discount' in patch || 'taxRate' in patch)
        if (editsSource) delete next.amountOverride
        return next
      }),
    )
  }

  function applyProduct(key: string, p: Product) {
    updateItem(key, {
      productId: p.id,
      productName: p.name,
      hsn: p.hsn || '',
      rate: Number(p.purchase_rate) || 0,
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
                rate: Number(p.purchase_rate) || 0,
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
          rate: Number(p.purchase_rate) || 0,
          discount: 0,
          taxRate: Number(p.tax_rate) || 18,
        },
      ]
    })
    setProductQuery('')
    setProductResults([])
  }

  function saveNewSupplier() {
    if (!newSupplier.name.trim()) {
      showToast('Enter supplier name', 'error')
      return
    }
    const s: SupplierOption = {
      name: newSupplier.name.trim(),
      houseName: newSupplier.houseName,
      place: newSupplier.place,
      address: joinAddress(newSupplier.houseName, newSupplier.place),
      gstin: newSupplier.gstin,
    }
    saveSupplier(s)
    setSuppliers(loadSavedSuppliers())
    selectSupplier(s)
    setNewSupplierOpen(false)
    setNewSupplier({ name: '', phone: '', gstin: '', houseName: '', place: '' })
    showToast('Supplier added', 'success')
  }

  async function save(mode: 'save' | 'draft' | 'print' | 'pdf') {
    if (!supplierName.trim()) {
      showToast('Enter supplier name', 'error')
      return
    }
    if (!filledItems.length) {
      showToast('Add at least one product from catalogue', 'error')
      return
    }
    setSaving(true)
    try {
      const address = joinAddress(houseName, place)
      saveSupplier({ name: supplierName.trim(), houseName, place, address, gstin })
      const notes = JSON.stringify({
        supplierInvoiceNo,
        address,
        houseName,
        place,
        gstin,
        state: 'Kerala',
        placeOfSupply: 'Kerala',
        paymentMethod,
        paidAmount: mode === 'draft' ? 0 : paidAmount,
        draft: mode === 'draft',
      })
      await callApi(() =>
        window.bizora.createPurchase({
          supplierName: supplierName.trim(),
          purchaseDate,
          purchaseNumber,
          notes,
          items: filledItems.map((i) => ({
            productId: i.productId!,
            productName: i.specification.trim()
              ? `${i.productName} (${i.specification.trim()})`
              : i.productName,
            qty: i.qty,
            rate: i.rate,
            discount: i.discount,
            taxRate: i.taxRate,
            amount: lineAmount(i),
          })),
        }),
      )
      showToast(mode === 'draft' ? 'Draft purchase saved' : 'Purchase saved', 'success')
      if (mode === 'print' || mode === 'pdf') {
        window.print()
      }
      navigate('/purchases')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to save purchase', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="-m-5 flex min-h-[calc(100%+2.5rem)] flex-col bg-[#F5F7FA]">
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#EAF4FF] text-[#0878F9]">
              <Truck size={20} strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-[18px] font-bold tracking-tight text-[#031C45]">Purchase Entry</h1>
              <p className="mt-0.5 text-[13px] text-[#62789A]">Record a new purchase.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Purchase No.</span>
              <div className="relative">
                <input
                  readOnly
                  value={purchaseNumber}
                  className="h-9 w-[180px] rounded-md border border-[#D8E4F2] bg-white py-1.5 pl-3 pr-9 text-[13px] font-medium text-[#031C45] outline-none"
                />
                <button
                  type="button"
                  title="Settings"
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
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="h-9 w-[160px] rounded-md border border-[#D8E4F2] bg-white py-1.5 pl-8 pr-2 text-[13px] text-[#031C45] outline-none focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15"
                />
              </div>
            </label>
          </div>
        </div>

        <section className="rounded-[12px] border border-[#D8E4F2] bg-white p-4 shadow-[0_2px_10px_rgba(6,41,92,0.03)]">
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              <div>
                <span className="mb-1.5 block text-[12px] font-medium text-[#62789A]">Supplier</span>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      size={14}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
                    />
                    <input
                      value={supplierName}
                      onChange={(e) => {
                        setSupplierName(e.target.value)
                        setSupplierOpen(true)
                      }}
                      onFocus={() => setSupplierOpen(true)}
                      onBlur={() => setTimeout(() => setSupplierOpen(false), 150)}
                      placeholder="Search supplier by name"
                      className="h-9 w-full rounded-md border border-[#D8E4F2] bg-white py-1.5 pl-9 pr-3 text-[13px] text-[#031C45] outline-none placeholder:text-[#94A3B8] focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15"
                    />
                    {supplierOpen && (filteredGstBusinesses.length > 0 || filteredSuppliers.length > 0) ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-64 overflow-auto rounded-md border border-[#D8E4F2] bg-white shadow-lg">
                        {filteredGstBusinesses.length > 0 ? (
                          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#62789A]">
                            B2B businesses
                          </div>
                        ) : null}
                        {filteredGstBusinesses.map((business) => (
                          <button
                            key={business.gstin}
                            type="button"
                            className="flex w-full flex-col px-3 py-2 text-left hover:bg-[#F5F9FF]"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectGstBusiness(business)}
                          >
                            <span className="text-[13px] font-medium text-[#031C45]">{business.name}</span>
                            <span className="text-[11.5px] text-[#62789A]">
                              {business.gstin}
                              {business.address ? ` · ${business.address}` : ''}
                            </span>
                          </button>
                        ))}
                        {filteredSuppliers.length > 0 ? (
                          <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#62789A]">
                            Saved suppliers
                          </div>
                        ) : null}
                        {filteredSuppliers.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            className="flex w-full flex-col px-3 py-2 text-left hover:bg-[#F5F9FF]"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectSupplier(s)}
                          >
                            <span className="text-[13px] font-medium text-[#031C45]">{s.name}</span>
                            {s.gstin ? <span className="text-[11.5px] text-[#62789A]">{s.gstin}</span> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Button type="button" className="shrink-0" onClick={() => setNewSupplierOpen(true)}>
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
              <Field label="Supplier Invoice No.">
                <Input
                  value={supplierInvoiceNo}
                  onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                  placeholder="Supplier bill / invoice number"
                />
              </Field>
            </div>

            <div className="grid gap-3 content-start">
              <Field label="GSTIN">
                <Input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="Enter GSTIN" />
              </Field>
            </div>
          </div>
        </section>

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
                    productAnchor.current = e.currentTarget
                    setProductQuery(e.target.value)
                    setActiveRowKey(null)
                    setProductSearchOpen(true)
                    placeProductMenu(e.currentTarget)
                  }}
                  onFocus={(e) => {
                    productAnchor.current = e.currentTarget
                    setActiveRowKey(null)
                    setProductSearchOpen(true)
                    placeProductMenu(e.currentTarget)
                  }}
                  onBlur={() => setTimeout(() => setProductSearchOpen(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && productResults[0]) {
                      e.preventDefault()
                      addProductFromSearch(productResults[0])
                    }
                  }}
                  placeholder="Search product"
                  className="h-9 w-[280px] rounded-md border border-[#D8E4F2] bg-white py-1.5 pl-9 pr-3 text-[13px] outline-none placeholder:text-[#94A3B8] focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15"
                />
              </div>
              <Button type="button" onClick={() => setItems((prev) => [...prev, emptyLine()])}>
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
                  <th className="px-3 py-2.5 w-28">Purchase Rate (₹)</th>
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
                      <td className="px-3 py-2">
                        <input
                          value={item.productName}
                          onChange={(e) => {
                            productAnchor.current = e.currentTarget
                            updateItem(item.key, { productName: e.target.value, productId: undefined })
                            setActiveRowKey(item.key)
                            setProductQuery(e.target.value)
                            placeProductMenu(e.currentTarget)
                          }}
                          onFocus={(e) => {
                            productAnchor.current = e.currentTarget
                            setProductSearchOpen(false)
                            setActiveRowKey(item.key)
                            setProductQuery(item.productName)
                            placeProductMenu(e.currentTarget)
                          }}
                          placeholder="Type or search product..."
                          className="h-8 w-full rounded border border-[#D8E4F2] px-2 text-[13px] outline-none focus:border-[#0878F9]"
                        />
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
                          type="text"
                          inputMode="decimal"
                          value={amountDraft[item.key] ?? formatAmountInput(amount)}
                          onChange={(e) => {
                            const raw = e.target.value.trim()
                            if (raw !== '' && !/^\d*\.?\d{0,2}$/.test(raw)) return
                            setAmountDraft((prev) => ({ ...prev, [item.key]: raw }))
                            const nextAmount = raw === '' || raw === '.' ? 0 : Number(raw)
                            if (!Number.isFinite(nextAmount)) return
                            updateItem(item.key, {
                              amountOverride: nextAmount,
                              rate: rateFromAmount(nextAmount, item.qty, item.discount, item.taxRate),
                            })
                          }}
                          onBlur={() =>
                            setAmountDraft((prev) => {
                              const next = { ...prev }
                              delete next[item.key]
                              return next
                            })
                          }
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
              <Button type="button" disabled={saving} onClick={() => void save('save')}>
                <Truck size={14} /> Save Purchase
              </Button>
            </div>
          </div>
        </section>
      </div>

      <Modal
        open={newSupplierOpen}
        title="Add Supplier"
        onClose={() => setNewSupplierOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setNewSupplierOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveNewSupplier}>Save Supplier</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Name">
            <Input
              value={newSupplier.name}
              onChange={(e) => {
                setNewSupplier((f) => ({ ...f, name: e.target.value }))
                setNewNameOpen(true)
              }}
              onFocus={() => setNewNameOpen(true)}
              placeholder="Search a B2B business or type a name"
              autoFocus
            />
            {newNameOpen && newSupplierMatches.length > 0 ? (
              <div className="mt-1 max-h-40 overflow-auto rounded-md border border-[#D8E4F2] bg-white">
                {newSupplierMatches.map((business) => (
                  <button
                    key={business.gstin}
                    type="button"
                    className="flex w-full flex-col px-3 py-2 text-left hover:bg-[#F5F9FF]"
                    onClick={() => fillNewSupplierFromGst(business)}
                  >
                    <span className="text-[13px] font-medium text-[#031C45]">{business.name}</span>
                    <span className="text-[11.5px] text-[#62789A]">
                      {business.gstin}
                      {business.address ? ` · ${business.address}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </Field>
          <Field label="Phone">
            <Input
              value={newSupplier.phone}
              onChange={(e) => setNewSupplier((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
          <Field label="GSTIN">
            <Input
              value={newSupplier.gstin}
              onChange={(e) => setNewSupplier((f) => ({ ...f, gstin: e.target.value }))}
            />
          </Field>
          <Field label="House name">
            <Input
              value={newSupplier.houseName}
              onChange={(e) => setNewSupplier((f) => ({ ...f, houseName: e.target.value }))}
              placeholder="House / building name"
            />
          </Field>
          <Field label="Place">
            <Input
              value={newSupplier.place}
              onChange={(e) => setNewSupplier((f) => ({ ...f, place: e.target.value }))}
              placeholder="Place / locality"
            />
          </Field>
        </div>
      </Modal>
      {productMenu && productResults.length > 0
        ? createPortal(
            <div
              className="fixed z-[80] max-h-56 overflow-auto rounded-md border border-[#D8E4F2] bg-white shadow-lg"
              style={{ top: productMenu.top, left: productMenu.left, width: productMenu.width }}
            >
              {productResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-[12.5px] hover:bg-[#F5F9FF]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => (activeRowKey ? applyProduct(activeRowKey, p) : addProductFromSearch(p))}
                >
                  <span className="min-w-0 whitespace-normal">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-[#62789A]">{formatMoney(p.purchase_rate)}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
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
