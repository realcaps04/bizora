import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Spinner, Textarea } from '@/components/ui'
import { useAppStore } from '@/stores/app'
import { callApi, formatMoney, statusTone } from '@/utils'
import type { Customer } from '@/types'

const emptyCustomer = { name: '', phone: '', email: '', gstin: '', address: '' }

function CustomerEditor({
  open,
  customerId,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean
  customerId: string | null
  initial: typeof emptyCustomer
  onClose: () => void
  onSaved: () => void
}) {
  const { showToast } = useAppStore()
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const initialRef = useRef(initial)
  initialRef.current = initial

  useEffect(() => {
    if (open) setForm(initialRef.current)
  }, [open, customerId])

  async function save() {
    setSaving(true)
    try {
      if (customerId) {
        await callApi(() => window.bizora.updateCustomer({ id: customerId, ...form }))
        showToast('Customer updated', 'success')
      } else {
        await callApi(() => window.bizora.createCustomer(form))
        showToast('Customer added', 'success')
      }
      onSaved()
      onClose()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to save customer', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={customerId ? 'Edit Customer' : 'Add Customer'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : 'Save Customer'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer Name" className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="GSTIN">
          <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

function customerForm(customer?: Pick<Customer, 'name' | 'phone' | 'email' | 'gstin' | 'address'>) {
  return {
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    gstin: customer?.gstin || '',
    address: customer?.address || '',
  }
}

export function CustomersPage() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(params.get('new') === '1')
  const [editing, setEditing] = useState<Customer | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await callApi(() => window.bizora.listCustomers({ search, pageSize: 100 }))
      setRows((data as { rows: Customer[] }).rows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [search])

  function closeEditor() {
    setOpen(false)
    setEditing(null)
    setParams({})
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Manage your customer directory"
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            Add Customer
          </Button>
        }
      />
      <div className="mb-3">
        <Input className="max-w-sm" placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No customers yet" description="Add your first customer to start billing." action={<Button onClick={() => setOpen(true)}>Add Customer</Button>} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Customer Name</th>
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">GSTIN</th>
                <th className="px-4 py-2.5 font-medium text-right">Total Purchases</th>
                <th className="px-4 py-2.5 font-medium text-right">Outstanding</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-slate-50/80">
                  <td className="px-4 py-2.5 font-medium">
                    <Link className="text-brand hover:underline" to={`/customers/${c.id}`}>
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{c.phone || '—'}</td>
                  <td className="px-4 py-2.5">{c.email || '—'}</td>
                  <td className="px-4 py-2.5">{c.gstin || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(c.total_purchases)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(c.outstanding)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={statusTone(c.status) as never}>{c.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      aria-label={`Edit ${c.name}`}
                      title="Edit"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#62789A] hover:bg-[#F7FAFD] hover:text-[#0878F9]"
                      onClick={() => {
                        setEditing(c)
                        setOpen(true)
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CustomerEditor
        open={open}
        customerId={editing?.id || null}
        initial={customerForm(editing || undefined)}
        onClose={closeEditor}
        onSaved={() => void load()}
      />
    </div>
  )
}

export function CustomerDetailPage({ id }: { id: string }) {
  const [data, setData] = useState<{
    customer: Customer
    invoices: { id: string; invoice_number: string; invoice_date: string; grand_total: number; payment_status: string }[]
    stats: { total_sales: number; paid: number; outstanding: number }
  } | null>(null)
  const [editing, setEditing] = useState(false)

  function load() {
    void callApi(() => window.bizora.getCustomer(id)).then((d) => setData(d as never))
  }

  useEffect(() => {
    load()
  }, [id])

  if (!data) return <Spinner />
  return (
    <div>
      <PageHeader
        title={data.customer.name}
        subtitle={data.customer.phone || data.customer.email || 'Customer profile'}
        actions={<Button onClick={() => setEditing(true)}>Edit</Button>}
      />
      <CustomerEditor
        open={editing}
        customerId={data.customer.id}
        initial={customerForm(data.customer)}
        onClose={() => setEditing(false)}
        onSaved={load}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Total Sales', formatMoney(data.stats.total_sales)],
          ['Paid', formatMoney(data.stats.paid)],
          ['Outstanding', formatMoney(data.stats.outstanding)],
          ['Status', data.customer.status],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-white px-4 py-3">
            <div className="text-xs text-ink-muted">{label}</div>
            <div className="mt-1 text-lg font-semibold capitalize">{value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-white">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Transaction History</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Invoice</th>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="px-4 py-2 text-left font-medium">Payment</th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-border">
                <td className="px-4 py-2">
                  <Link to={`/invoices/${inv.id}`} className="text-brand hover:underline">
                    {inv.invoice_number}
                  </Link>
                </td>
                <td className="px-4 py-2">{inv.invoice_date}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatMoney(inv.grand_total)}</td>
                <td className="px-4 py-2">{inv.payment_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
