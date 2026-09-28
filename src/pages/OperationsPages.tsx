import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { useAppStore } from '@/stores/app'
import { callApi, formatDate, formatMoney, statusTone } from '@/utils'

export function QuotationsPage() {
  const navigate = useNavigate()
  const { showToast } = useAppStore()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const data = await callApi(() => window.bizora.listQuotations({ pageSize: 100 }))
      setRows((data as { rows: Record<string, unknown>[] }).rows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function convert(id: string) {
    try {
      const result = await callApi(() => window.bizora.convertQuotation(id))
      showToast('Converted to invoice', 'success')
      const invoiceId = (result as { invoice: { id: string } }).invoice.id
      navigate(`/invoices/${invoiceId}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to convert', 'error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Quotations"
        actions={<Button onClick={() => navigate('/quotations/new')}>New Quotation</Button>}
      />
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No quotations"
          action={<Button onClick={() => navigate('/quotations/new')}>New Quotation</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Quotation</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr
                  key={String(q.id)}
                  className="cursor-pointer border-t border-border hover:bg-slate-50"
                  onClick={() => navigate(`/quotations/${String(q.id)}`)}
                >
                  <td className="px-4 py-2.5 font-medium text-brand">{String(q.quotation_number)}</td>
                  <td className="px-4 py-2.5">{String(q.customer_name)}</td>
                  <td className="px-4 py-2.5">{formatDate(String(q.quotation_date))}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(Number(q.grand_total))}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={statusTone(String(q.status)) as never}>{String(q.status)}</Badge>
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    {q.status !== 'converted' ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/quotations/${String(q.id)}/edit`)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void convert(String(q.id))}>
                          Convert to Invoice
                        </Button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function PurchasesPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const data = await callApi(() => window.bizora.listPurchases({ pageSize: 100 }))
        setRows((data as { rows: Record<string, unknown>[] }).rows)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle="Purchase history"
        actions={<Button onClick={() => navigate('/purchases/new')}>New Purchase</Button>}
      />
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No purchases yet"
          action={<Button onClick={() => navigate('/purchases/new')}>New Purchase</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Purchase #</th>
                <th className="px-4 py-2.5 font-medium">Supplier</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium">{String(r.purchase_number)}</td>
                  <td className="px-4 py-2.5">{String(r.supplier_name)}</td>
                  <td className="px-4 py-2.5">{formatDate(String(r.purchase_date))}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(Number(r.grand_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ExpensesPage() {
  const { showToast } = useAppStore()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    category: 'Rent',
    description: '',
    amount: 0,
    expenseDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
  })

  async function load() {
    const data = await callApi(() => window.bizora.listExpenses({ pageSize: 100 }))
    setRows((data as { rows: Record<string, unknown>[] }).rows)
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    try {
      await callApi(() => window.bizora.createExpense(form))
      showToast('Expense recorded', 'success')
      setOpen(false)
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to save expense', 'error')
    }
  }

  return (
    <div>
      <PageHeader title="Expenses" actions={<Button onClick={() => setOpen(true)}>Add Expense</Button>} />
      {rows.length === 0 ? (
        <EmptyState title="No expenses recorded" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="px-4 py-2.5 font-medium">Method</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium">Created By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-t border-border">
                  <td className="px-4 py-2.5">{formatDate(String(r.expense_date))}</td>
                  <td className="px-4 py-2.5">{String(r.category)}</td>
                  <td className="px-4 py-2.5">{String(r.description || '—')}</td>
                  <td className="px-4 py-2.5">{String(r.payment_method || '—')}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(Number(r.amount))}</td>
                  <td className="px-4 py-2.5">{String(r.created_by_name || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} title="Add Expense" onClose={() => setOpen(false)} footer={<Button onClick={() => void save()}>Save</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {['Rent', 'Electricity', 'Salary', 'Transport', 'Maintenance', 'Office', 'Other'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Amount">
            <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          </Field>
          <Field label="Date">
            <Input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
          </Field>
          <Field label="Payment Method">
            <Select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {['Cash', 'UPI', 'Card', 'Bank Transfer'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

export function PaymentsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  useEffect(() => {
    void callApi(() => window.bizora.listPayments({ pageSize: 100 })).then((d) =>
      setRows((d as { rows: Record<string, unknown>[] }).rows),
    )
  }, [])
  return (
    <div>
      <PageHeader title="Payments" subtitle="Payment receipts and collections" />
      {rows.length === 0 ? (
        <EmptyState title="No payments recorded" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Payment ID</th>
                <th className="px-4 py-2.5 font-medium">Invoice</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Method</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium">Created By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-t border-border">
                  <td className="px-4 py-2.5 font-mono text-xs">{String(r.id).slice(0, 8)}</td>
                  <td className="px-4 py-2.5">
                    {r.invoice_id ? (
                      <Link className="text-brand hover:underline" to={`/invoices/${String(r.invoice_id)}`}>
                        {String(r.invoice_number || 'View')}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-2.5">{String(r.customer_name || '—')}</td>
                  <td className="px-4 py-2.5">{formatDate(String(r.payment_date))}</td>
                  <td className="px-4 py-2.5">{String(r.method)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(Number(r.amount))}</td>
                  <td className="px-4 py-2.5">{String(r.created_by_name || '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
