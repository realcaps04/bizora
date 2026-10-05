import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { useAppStore } from '@/stores/app'
import { callApi, formatDate, formatMoney, statusTone } from '@/utils'
import {
  downloadExpenseListExcel,
  downloadExpenseListPdf,
  downloadOneExpenseExcel,
  downloadOneExpensePdf,
  safeFileName,
  type ExpenseExportRow,
} from '@/utils/invoiceExport'

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

const EXPENSE_CATEGORIES = ['Rent', 'Electricity', 'Salary', 'Transport', 'Maintenance', 'Office', 'Other']
const EXPENSE_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer']

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function emptyExpenseForm() {
  return {
    id: '',
    category: 'Rent',
    description: '',
    amount: 0,
    expenseDate: todayIso(),
    paymentMethod: 'Cash',
  }
}

function asExpense(row: Record<string, unknown>): ExpenseExportRow & { id: string } {
  return {
    id: String(row.id),
    category: String(row.category || ''),
    description: row.description ? String(row.description) : '',
    amount: Number(row.amount) || 0,
    expense_date: String(row.expense_date || ''),
    payment_method: row.payment_method ? String(row.payment_method) : '',
    created_by_name: row.created_by_name ? String(row.created_by_name) : '',
  }
}

export function ExpensesPage() {
  const { showToast } = useAppStore()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [form, setForm] = useState(emptyExpenseForm)

  const filters = {
    search: search.trim() || undefined,
    category: category || undefined,
    paymentMethod: paymentMethod || undefined,
    from: from || undefined,
    to: to || undefined,
  }
  const filtering = Boolean(search.trim() || category || paymentMethod || from || to)

  async function fetchMatching() {
    const all: Record<string, unknown>[] = []
    let page = 1
    let total = Number.POSITIVE_INFINITY
    while (all.length < total) {
      const data = (await callApi(() => window.bizora.listExpenses({ ...filters, page, pageSize: 100 }))) as {
        rows: Record<string, unknown>[]
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

  async function load() {
    setLoading(true)
    try {
      setRows(await fetchMatching())
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to load expenses', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // Reload when the search text or filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, paymentMethod, from, to])

  function openNew() {
    setForm(emptyExpenseForm())
    setOpen(true)
  }

  function openEdit(row: Record<string, unknown>) {
    setForm({
      id: String(row.id),
      category: String(row.category || 'Other'),
      description: String(row.description || ''),
      amount: Number(row.amount) || 0,
      expenseDate: String(row.expense_date || todayIso()).slice(0, 10),
      paymentMethod: String(row.payment_method || 'Cash'),
    })
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const payload = {
        category: form.category,
        description: form.description,
        amount: form.amount,
        expenseDate: form.expenseDate,
        paymentMethod: form.paymentMethod,
      }
      if (form.id) {
        await callApi(() => window.bizora.updateExpense({ id: form.id, ...payload }))
        showToast('Expense updated', 'success')
      } else {
        await callApi(() => window.bizora.createExpense(payload))
        showToast('Expense recorded', 'success')
      }
      setOpen(false)
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to save expense', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function downloadList(format: 'pdf' | 'excel') {
    setExporting(format)
    try {
      const matched = (await fetchMatching()).map(asExpense)
      if (!matched.length) {
        showToast('No expenses to download', 'error')
        return
      }
      const stamp = from || to ? `${from || 'start'}-to-${to || 'today'}` : 'all'
      if (format === 'pdf') downloadExpenseListPdf(matched, `expenses-${stamp}.pdf`, 'Expenses')
      else downloadExpenseListExcel(matched, `expenses-${stamp}.xls`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to download expenses', 'error')
    } finally {
      setExporting('')
    }
  }

  function downloadOne(row: Record<string, unknown>, format: 'pdf' | 'excel') {
    const expense = asExpense(row)
    const file = `expense-${safeFileName(expense.category)}-${expense.expense_date}`
    if (format === 'pdf') downloadOneExpensePdf(expense, `${file}.pdf`)
    else downloadOneExpenseExcel(expense, `${file}.xls`)
  }

  return (
    <div>
      <PageHeader title="Expenses" actions={<Button onClick={openNew}>Add Expense</Button>} />
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search description, category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select className="w-40" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <Select className="w-40" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
          <option value="">All methods</option>
          {EXPENSE_METHODS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </Select>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-muted">From</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-muted">To</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5">
        <div className="mr-1 text-[12px] font-medium text-ink-muted">Download</div>
        <Button size="sm" variant="outline" disabled={Boolean(exporting)} onClick={() => void downloadList('pdf')}>
          {exporting === 'pdf' ? 'Preparing…' : 'PDF'}
        </Button>
        <Button size="sm" variant="outline" disabled={Boolean(exporting)} onClick={() => void downloadList('excel')}>
          {exporting === 'excel' ? 'Preparing…' : 'Excel'}
        </Button>
        <span className="text-[12px] text-ink-muted">Downloads the expenses that match the search and filters.</span>
      </div>
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title={filtering ? 'No expenses match' : 'No expenses recorded'} />
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
                <th className="px-4 py-2.5 font-medium">Actions</th>
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
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        Edit
                      </Button>
                      <Select
                        className="h-8 w-[7.5rem] text-xs"
                        value=""
                        onChange={(e) => {
                          const format = e.target.value as 'pdf' | 'excel' | ''
                          if (format) downloadOne(r, format)
                          e.target.value = ''
                        }}
                      >
                        <option value="">Download</option>
                        <option value="pdf">PDF</option>
                        <option value="excel">Excel</option>
                      </Select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={open}
        title={form.id ? 'Edit Expense' : 'Add Expense'}
        onClose={() => {
          if (!saving) setOpen(false)
        }}
        footer={
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : form.id ? 'Save changes' : 'Save'}
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
              {form.category && !EXPENSE_CATEGORIES.includes(form.category) ? <option>{form.category}</option> : null}
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
              {EXPENSE_METHODS.map((m) => (
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
