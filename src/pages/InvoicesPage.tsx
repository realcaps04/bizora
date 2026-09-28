import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Ban, X } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, PageHeader, Select, Spinner } from '@/components/ui'
import { DocumentPrint } from '@/components/DocumentPrint'
import { useAppStore } from '@/stores/app'
import { callApi, formatDate, formatMoney, statusTone } from '@/utils'
import type { Invoice } from '@/types'

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

export function InvoicesPage() {
  const [tab, setTab] = useState('all')
  const [rows, setRows] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

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
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState title="No invoices found" /> : <InvoiceTable rows={rows} />}
    </div>
  )
}

function InvoiceTable({ rows }: { rows: Invoice[] }) {
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
                {inv.status === 'cancelled' ? (
                  '—'
                ) : (
                  <Link to={`/invoices/${inv.id}/edit`}>
                    <Button size="sm" variant="outline">
                      Edit
                    </Button>
                  </Link>
                )}
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
  const dueDate = (() => {
    const d = new Date(invoice.invoice_date)
    if (Number.isNaN(d.getTime())) return invoice.invoice_date
    d.setDate(d.getDate() + 15)
    return d.toISOString().slice(0, 10)
  })()

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
          address: customer?.address ? String(customer.address) : undefined,
          phone: customer?.phone ? String(customer.phone) : undefined,
          gstin: customer?.gstin ? String(customer.gstin) : undefined,
        }}
        documentNumber={invoice.invoice_number}
        documentDate={invoice.invoice_date}
        dueOrValidDate={dueDate}
        paymentMode={invoice.payment_method}
        status={invoice.payment_status}
        placeOfSupply={settings.place_of_supply || 'Kerala (32)'}
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
