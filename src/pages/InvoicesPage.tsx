import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Ban, X } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui'
import { DocumentPrint, termsFromSetting } from '@/components/DocumentPrint'
import { parseB2b, parseLineExtra } from '@/data/b2b'
import { useAppStore } from '@/stores/app'
import { callApi, formatDate, formatMoney, statusTone } from '@/utils'
import {
  downloadInvoiceListExcel,
  downloadInvoiceListPdf,
  downloadOneInvoiceExcel,
  downloadOneInvoicePdf,
  safeFileName,
} from '@/utils/invoiceExport'
import type { Customer, Invoice } from '@/types'

export function SalesPage() {
  const [rows, setRows] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const data = await callApi(() =>
          window.bizora.listInvoices({ search, paymentStatus: paymentStatus || undefined, pageSize: 100 }),
        )
        setRows((data as { rows: Invoice[] }).rows)
      } finally {
        setLoading(false)
      }
    })()
  }, [search, paymentStatus])

  return (
    <div>
      <PageHeader title="Sales" subtitle="All confirmed sales invoices" actions={<Link className="inline-flex" to="/sales/new"><Button>New Sale</Button></Link>} />
      <div className="mb-3 flex flex-wrap gap-3">
        <Input className="max-w-xs" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select className="w-44" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
          <option value="">All payments</option>
          <option value="paid">Paid</option>
          <option value="partial">Partially Paid</option>
          <option value="unpaid">Unpaid</option>
        </Select>
      </div>
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No sales yet" action={<Link to="/sales/new"><Button>Create Sale</Button></Link>} />
      ) : (
        <InvoiceTable rows={rows} />
      )}
    </div>
  )
}

async function fetchAllInvoices() {
  const all: Invoice[] = []
  let page = 1
  let total = Number.POSITIVE_INFINITY
  while (all.length < total) {
    const data = (await callApi(() => window.bizora.listInvoices({ page, pageSize: 100 }))) as {
      rows: Invoice[]
      total: number
    }
    total = Number(data.total) || 0
    const batch = data.rows || []
    all.push(...batch)
    if (!batch.length) break
    page += 1
  }
  return all
}

export function InvoicesPage() {
  const { showToast } = useAppStore()
  const [tab, setTab] = useState('all')
  const [rows, setRows] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [directoryNames, setDirectoryNames] = useState<string[]>([])
  const [exporting, setExporting] = useState('')

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const opts: Record<string, unknown> = { search, pageSize: 100 }
        if (tab === 'cancelled') opts.status = 'cancelled'
        else if (tab !== 'all') opts.paymentStatus = tab === 'partially' ? 'partial' : tab
        const data = await callApi(() => window.bizora.listInvoices(opts))
        setRows((data as { rows: Invoice[] }).rows)
      } finally {
        setLoading(false)
      }
    })()
  }, [tab, search])

  useEffect(() => {
    void callApi(() => window.bizora.listCustomers({ pageSize: 200 }))
      .then((data) => {
        const names = ((data as { rows?: Customer[] }).rows || [])
          .map((customer) => customer.name.trim())
          .filter(Boolean)
        setDirectoryNames(names)
      })
      .catch(() => {})
  }, [])

  const nameOptions = useMemo(() => {
    const names = new Set(directoryNames)
    for (const row of rows) {
      const name = String(row.customer_name || '').trim()
      if (name) names.add(name)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [directoryNames, rows])

  async function downloadAll(format: 'pdf' | 'excel') {
    setExporting(`all-${format}`)
    try {
      const invoices = await fetchAllInvoices()
      if (!invoices.length) {
        showToast('No invoices to download', 'error')
        return
      }
      if (format === 'pdf') downloadInvoiceListPdf(invoices, 'invoices-all.pdf', 'All invoices')
      else downloadInvoiceListExcel(invoices, 'invoices-all.xls')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to download invoices', 'error')
    } finally {
      setExporting('')
    }
  }

  async function downloadByName(format: 'pdf' | 'excel') {
    const wanted = customerName.trim().toLowerCase()
    if (!wanted) {
      showToast('Enter a customer name', 'error')
      return
    }
    setExporting(`name-${format}`)
    try {
      const invoices = await fetchAllInvoices()
      const exact = invoices.filter((invoice) => String(invoice.customer_name || '').trim().toLowerCase() === wanted)
      const matched = exact.length
        ? exact
        : invoices.filter((invoice) => String(invoice.customer_name || '').trim().toLowerCase().includes(wanted))
      if (!matched.length) {
        showToast(`No invoices for ${customerName.trim()}`, 'error')
        return
      }
      const file = `invoices-${safeFileName(customerName)}`
      if (format === 'pdf') downloadInvoiceListPdf(matched, `${file}.pdf`, `Invoices for ${customerName.trim()}`)
      else downloadInvoiceListExcel(matched, `${file}.xls`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to download invoices', 'error')
    } finally {
      setExporting('')
    }
  }

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'paid', label: 'Paid' },
    { id: 'unpaid', label: 'Unpaid' },
    { id: 'partially', label: 'Partially Paid' },
    { id: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Invoice management" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.id ? 'bg-slate-900 text-white' : 'bg-white text-ink-muted border border-border'}`}
          >
            {t.label}
          </button>
        ))}
        <Input className="ml-auto max-w-xs" placeholder="Search invoices…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-white px-3 py-2.5">
        <div className="mr-1 pb-1 text-[12px] font-medium text-ink-muted">Download</div>
        <Button size="sm" variant="outline" disabled={Boolean(exporting)} onClick={() => void downloadAll('pdf')}>
          {exporting === 'all-pdf' ? 'Preparing…' : 'All PDF'}
        </Button>
        <Button size="sm" variant="outline" disabled={Boolean(exporting)} onClick={() => void downloadAll('excel')}>
          {exporting === 'all-excel' ? 'Preparing…' : 'All Excel'}
        </Button>
        <label className="ml-auto block min-w-[200px] flex-1">
          <span className="mb-1 block text-[12px] font-medium text-ink-muted">Customer name</span>
          <Input
            list="invoice-customer-names"
            placeholder="Download by customer name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
          <datalist id="invoice-customer-names">
            {nameOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <Button size="sm" variant="outline" disabled={Boolean(exporting) || !customerName.trim()} onClick={() => void downloadByName('pdf')}>
          {exporting === 'name-pdf' ? 'Preparing…' : 'Name PDF'}
        </Button>
        <Button size="sm" variant="outline" disabled={Boolean(exporting) || !customerName.trim()} onClick={() => void downloadByName('excel')}>
          {exporting === 'name-excel' ? 'Preparing…' : 'Name Excel'}
        </Button>
      </div>
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No invoices found" /> : <InvoiceTable rows={rows} downloads />}
    </div>
  )
}

function InvoiceTable({ rows, downloads = false }: { rows: Invoice[]; downloads?: boolean }) {
  const { showToast } = useAppStore()
  const [busyId, setBusyId] = useState('')

  async function downloadOne(invoice: Invoice, format: 'pdf' | 'excel') {
    setBusyId(`${invoice.id}:${format}`)
    try {
      const data = (await callApi(() => window.bizora.getInvoice(invoice.id))) as {
        invoice: Invoice & Record<string, unknown>
        items: Record<string, unknown>[]
      }
      const file = safeFileName(invoice.invoice_number)
      if (format === 'pdf') downloadOneInvoicePdf(data.invoice, data.items, `${file}.pdf`)
      else downloadOneInvoiceExcel(data.invoice, data.items, `${file}.xls`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to download this invoice', 'error')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs text-ink-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Invoice No.</th>
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-4 py-2.5 font-medium">Customer</th>
            <th className="px-4 py-2.5 font-medium text-right">Items</th>
            <th className="px-4 py-2.5 font-medium">Payment</th>
            <th className="px-4 py-2.5 font-medium text-right">Amount</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Created By</th>
            <th className="px-4 py-2.5 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv) => (
            <tr key={inv.id} className="border-t border-border hover:bg-slate-50/80">
              <td className="px-4 py-2.5 font-medium">
                <Link to={`/invoices/${inv.id}`} className="text-brand hover:underline">
                  {inv.invoice_number}
                </Link>
              </td>
              <td className="px-4 py-2.5">{formatDate(inv.invoice_date)}</td>
              <td className="px-4 py-2.5">{inv.customer_name}</td>
              <td className="px-4 py-2.5 text-right">{inv.item_count ?? '—'}</td>
              <td className="px-4 py-2.5">{inv.payment_method || '—'}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(inv.grand_total)}</td>
              <td className="px-4 py-2.5">
                <Badge tone={statusTone(inv.payment_status) as never}>{inv.payment_status}</Badge>
              </td>
              <td className="px-4 py-2.5">{inv.created_by_name || '—'}</td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {downloads ? (
                    <Select
                      className="h-7 w-[118px] text-xs"
                      value=""
                      disabled={busyId.startsWith(`${inv.id}:`)}
                      onChange={(e) => {
                        const format = e.target.value as 'pdf' | 'excel' | ''
                        if (format === 'pdf' || format === 'excel') void downloadOne(inv, format)
                      }}
                    >
                      <option value="">{busyId.startsWith(`${inv.id}:`) ? 'Preparing…' : 'Download'}</option>
                      <option value="pdf">PDF</option>
                      <option value="excel">Excel</option>
                    </Select>
                  ) : null}
                  {inv.status === 'cancelled' ? (
                    downloads ? null : '—'
                  ) : (
                    <Link to={`/invoices/${inv.id}/edit`}>
                      <Button size="sm" variant="outline">
                        Edit
                      </Button>
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function InvoiceDetailPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { showToast } = useAppStore()
  const [data, setData] = useState<{
    invoice: Invoice & Record<string, unknown>
    items: Record<string, unknown>[]
    company: Record<string, unknown>
    customer?: Record<string, unknown> | null
  } | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    void (async () => {
      const [d, s] = await Promise.all([
        callApi(() => window.bizora.getInvoice(id)),
        callApi(() => window.bizora.getSettings()).catch(() => ({})),
      ])
      setData(d as never)
      setSettings((s as Record<string, string>) || {})
      if (params.get('print') === '1') setTimeout(() => window.print(), 400)
    })()
  }, [id, params])

  useEffect(() => {
    if (!cancelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cancelling) setCancelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancelOpen, cancelling])

  async function cancel() {
    setCancelling(true)
    try {
      await callApi(() => window.bizora.cancelInvoice(id))
      showToast('Invoice cancelled', 'success')
      const d = await callApi(() => window.bizora.getInvoice(id))
      setData(d as never)
      setCancelOpen(false)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to cancel invoice', 'error')
    } finally {
      setCancelling(false)
    }
  }

  if (!data) return <Spinner />
  const { invoice, items, company, customer } = data
  const balance = Math.max(0, Number(invoice.grand_total) - Number(invoice.paid_amount || 0))
  const b2b = parseB2b(invoice.details)
  const dueDate = b2b.dueDate || (() => {
    const d = new Date(invoice.invoice_date)
    if (Number.isNaN(d.getTime())) return invoice.invoice_date
    d.setDate(d.getDate() + 15)
    return d.toISOString().slice(0, 10)
  })()
  const lineExtras = items.map((item) => {
    const extra = parseLineExtra(item.details)
    const taxable = Math.max(0, Number(item.qty) * Number(item.rate) - Number(item.discount || 0))
    return { cess: (taxable * extra.cessRate) / 100, other: extra.otherCharges }
  })
  const cessTotal = lineExtras.reduce((sum, row) => sum + row.cess, 0)
  const otherTotal = lineExtras.reduce((sum, row) => sum + row.other, 0)
  const billingAddress = b2b.billingAddress || (customer?.address ? String(customer.address) : '')
  const stateLine = b2b.state ? `${b2b.state}${b2b.stateCode ? ` (${b2b.stateCode})` : ''}` : ''

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <PageHeader title={invoice.invoice_number} subtitle={formatDate(invoice.invoice_date)} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            Print / PDF
          </Button>
          {invoice.status !== 'cancelled' ? (
            <Button variant="outline" onClick={() => navigate(`/invoices/${id}/edit`)}>
              Edit
            </Button>
          ) : null}
          {invoice.status !== 'cancelled' ? (
            <Button variant="danger" onClick={() => setCancelOpen(true)}>
              Cancel Invoice
            </Button>
          ) : null}
        </div>
      </div>

      <DocumentPrint
        kind="invoice"
        company={company}
        customer={{
          name: String(customer?.name || invoice.customer_name || 'Walk-in Customer'),
          address: [billingAddress, stateLine].filter(Boolean).join('\n') || undefined,
          phone: b2b.mobile || (customer?.phone ? String(customer.phone) : undefined),
          gstin: b2b.gstin || (customer?.gstin ? String(customer.gstin) : undefined),
        }}
        documentNumber={invoice.invoice_number}
        documentDate={invoice.invoice_date}
        dueOrValidDate={dueDate}
        paymentMode={invoice.payment_method}
        status={invoice.payment_status}
        placeOfSupply={b2b.placeOfSupply || settings.place_of_supply || 'Kerala (32)'}
        supplyType={invoice.supply_type || 'Business to Customer'}
        invoiceType={invoice.supply_type === 'Business to Business' ? b2b.invoiceType : undefined}
        poNumber={b2b.poNumber || undefined}
        reverseCharge={b2b.reverseCharge}
        shippingAddress={b2b.shipDifferent ? b2b.shippingAddress : undefined}
        cess={cessTotal}
        otherCharges={otherTotal}
        items={items.map((item) => ({
          id: String(item.id),
          productName: String(item.product_name),
          hsn: item.hsn ? String(item.hsn) : undefined,
          qty: Number(item.qty),
          rate: Number(item.rate),
          discount: Number(item.discount || 0),
          taxRate: Number(item.tax_rate || 0),
          amount: Number(item.amount),
        }))}
        subtotal={Number(invoice.subtotal)}
        discount={Number(invoice.discount_amount)}
        taxable={Number(invoice.taxable_amount)}
        cgst={Number(invoice.cgst)}
        sgst={Number(invoice.sgst)}
        igst={Number(invoice.igst)}
        grandTotal={Number(invoice.grand_total)}
        paidAmount={Number(invoice.paid_amount || 0)}
        balanceDue={balance}
        notes={invoice.notes}
        terms={termsFromSetting(settings.invoice_terms)}
        bank={{
          accountName: settings.bank_account_name,
          accountNumber: settings.bank_account_number,
          ifsc: settings.bank_ifsc,
          bankName: settings.bank_name,
          upiId: settings.upi_id,
        }}
      />

      {cancelOpen ? (
        <div
          className="no-print fixed inset-0 z-[70] flex items-center justify-center bg-[#031C45]/35 p-4"
          onMouseDown={() => {
            if (!cancelling) setCancelOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-labelledby="cancel-invoice-title"
            className="w-full max-w-[380px] overflow-hidden rounded-[14px] border border-[#D8E4F2] bg-white shadow-[0_18px_50px_rgba(3,28,69,0.18)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 px-5 pb-1 pt-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#FEF2F2] text-[#DC2626]">
                <Ban size={18} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id="cancel-invoice-title" className="text-[15px] font-semibold tracking-tight text-[#031C45]">
                  Cancel invoice?
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[#62789A]">
                  The invoice will remain in audit history and stock will be restored.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={cancelling}
                onClick={() => setCancelOpen(false)}
                className="rounded-md p-1 text-[#94A3B8] hover:bg-[#F5F7FA] hover:text-[#031C45] disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <Button variant="outline" disabled={cancelling} onClick={() => setCancelOpen(false)}>
                Keep invoice
              </Button>
              <Button variant="danger" disabled={cancelling} onClick={() => void cancel()}>
                {cancelling ? 'Cancelling…' : 'Cancel invoice'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function InvoiceDetailRoute() {
  return <InvoiceDetailPage />
}
