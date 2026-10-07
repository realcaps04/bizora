import { inventoryQty } from '../../src/data/units'
import { queryAll, queryOne, run, withTransaction } from '../database'
import { generateId } from '../security/crypto'
import { AppError, requireAuth, requirePermission } from '../security/session'
import { writeAudit } from './auth'
import { createInvoice, type InvoiceItemInput } from './invoices'
import { syncProductById } from './accountCloud'

function now(): string {
  return new Date().toISOString()
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function nextQuotationNumber(): string {
  const user = requireAuth()
  const company = queryOne<{ quotation_prefix: string; quotation_next: number }>(
    'SELECT quotation_prefix, quotation_next FROM companies WHERE id = ?',
    [user.companyId],
  )
  if (!company) throw new AppError('Company not found.', 'NOT_FOUND')
  const year = new Date().getFullYear()
  return `${company.quotation_prefix}-${year}-${String(company.quotation_next).padStart(5, '0')}`
}

export function listQuotations(opts: { search?: string; status?: string; page?: number; pageSize?: number } = {}) {
  const user = requireAuth()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  let where = 'company_id = ?'
  const params: unknown[] = [user.companyId]
  if (opts.search?.trim()) {
    where += ' AND (quotation_number LIKE ? OR customer_name LIKE ?)'
    const q = `%${opts.search.trim()}%`
    params.push(q, q)
  }
  if (opts.status) {
    where += ' AND status = ?'
    params.push(opts.status)
  }
  const total = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM quotations WHERE ${where}`, params)?.c ?? 0
  const rows = queryAll(`SELECT * FROM quotations WHERE ${where} ORDER BY quotation_date DESC LIMIT ? OFFSET ?`, [
    ...params,
    pageSize,
    offset,
  ])
  return { rows, total, page, pageSize }
}

export function getQuotation(id: string) {
  const user = requireAuth()
  const quotation = queryOne('SELECT * FROM quotations WHERE id = ? AND company_id = ?', [id, user.companyId])
  if (!quotation) throw new AppError('Quotation not found.', 'NOT_FOUND')
  const items = queryAll('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY sort_order', [id])
  const q = quotation as Record<string, unknown>
  let customer: Record<string, unknown> | null = null
  if (q.customer_id) {
    customer = queryOne('SELECT * FROM customers WHERE id = ? AND company_id = ?', [
      q.customer_id,
      user.companyId,
    ]) as Record<string, unknown> | null
  }
  const company = queryOne('SELECT * FROM companies WHERE id = ?', [user.companyId])
  return { quotation, items, customer, company }
}

export function createQuotation(input: {
  customerId?: string
  customerName?: string
  quotationDate?: string
  validUntil?: string
  items: InvoiceItemInput[]
  notes?: string
  status?: string
}) {
  const user = requirePermission('quotations.manage')
  if (!input.items?.length) throw new AppError('Add at least one item.', 'VALIDATION')

  const ts = now()
  const id = generateId()
  let customerName = input.customerName || 'Customer'
  if (input.customerId) {
    const c = queryOne<{ name: string }>('SELECT name FROM customers WHERE id = ? AND company_id = ?', [
      input.customerId,
      user.companyId,
    ])
    if (!c) throw new AppError('Customer not found.', 'NOT_FOUND')
    customerName = c.name
  }

  const calcs = input.items.map((item) => {
    const base = item.qty * item.rate
    const after = Math.max(0, base - (item.discount || 0))
    const tax = (after * (item.taxRate || 0)) / 100
    return { ...item, amount: after + tax, after, tax }
  })
  const subtotal = round2(calcs.reduce((s, i) => s + i.qty * i.rate, 0))
  const discountAmount = round2(calcs.reduce((s, i) => s + (i.discount || 0), 0))
  const taxAmount = round2(calcs.reduce((s, i) => s + i.tax, 0))
  const grandTotal = round2(calcs.reduce((s, i) => s + i.amount, 0))

  withTransaction(() => {
    const quotationNumber = nextQuotationNumber()

    run(
      `INSERT INTO quotations (
        id, company_id, quotation_number, customer_id, customer_name, quotation_date, valid_until,
        status, subtotal, discount_amount, tax_amount, grand_total, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user.companyId,
        quotationNumber,
        input.customerId ?? null,
        customerName,
        input.quotationDate || ts.slice(0, 10),
        input.validUntil ?? null,
        input.status || 'draft',
        subtotal,
        discountAmount,
        taxAmount,
        grandTotal,
        input.notes ?? null,
        user.id,
        ts,
        ts,
      ],
    )

    calcs.forEach((item, idx) => {
      run(
        `INSERT INTO quotation_items (id, company_id, quotation_id, product_id, product_name, hsn, qty, rate, discount, tax_rate, amount, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          user.companyId,
          id,
          item.productId ?? null,
          item.productName,
          item.hsn ?? null,
          item.qty,
          item.rate,
          item.discount || 0,
          item.taxRate || 0,
          item.amount,
          idx,
        ],
      )
    })

    run('UPDATE companies SET quotation_next = quotation_next + 1, updated_at = ? WHERE id = ?', [ts, user.companyId])
    writeAudit(user.companyId, user, 'quotation.created', 'quotations', id, 'Quotation created')
  })

  return getQuotation(id)
}

export function updateQuotation(
  id: string,
  patch: {
    status?: string
    notes?: string
    customerId?: string
    customerName?: string
    quotationDate?: string
    validUntil?: string | null
    items?: InvoiceItemInput[]
  },
) {
  const user = requirePermission('quotations.manage')
  const existing = queryOne<Record<string, unknown>>('SELECT * FROM quotations WHERE id = ? AND company_id = ?', [
    id,
    user.companyId,
  ])
  if (!existing) throw new AppError('Quotation not found.', 'NOT_FOUND')
  if (existing.status === 'converted') throw new AppError('Converted quotations cannot be edited.', 'VALIDATION')

  if (!patch.items) {
    run(
      `UPDATE quotations SET status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND company_id = ?`,
      [patch.status ?? null, patch.notes ?? null, now(), id, user.companyId],
    )
    writeAudit(user.companyId, user, 'quotation.updated', 'quotations', id, 'Quotation updated')
    return getQuotation(id)
  }

  if (!patch.items.length) throw new AppError('Add at least one item.', 'VALIDATION')
  const ts = now()
  let customerName = patch.customerName || String(existing.customer_name || 'Customer')
  if (patch.customerId) {
    const c = queryOne<{ name: string }>('SELECT name FROM customers WHERE id = ? AND company_id = ?', [
      patch.customerId,
      user.companyId,
    ])
    if (!c) throw new AppError('Customer not found.', 'NOT_FOUND')
    customerName = c.name
  }

  const calcs = patch.items.map((item) => {
    const base = item.qty * item.rate
    const after = Math.max(0, base - (item.discount || 0))
    const tax = (after * (item.taxRate || 0)) / 100
    return { ...item, amount: after + tax }
  })
  const subtotal = round2(calcs.reduce((s, i) => s + i.qty * i.rate, 0))
  const discountAmount = round2(calcs.reduce((s, i) => s + (i.discount || 0), 0))
  const taxAmount = round2(calcs.reduce((s, i) => s + (i.amount - Math.max(0, i.qty * i.rate - (i.discount || 0))), 0))
  const grandTotal = round2(calcs.reduce((s, i) => s + i.amount, 0))

  withTransaction(() => {
    run(
      `UPDATE quotations SET
        customer_id = ?, customer_name = ?, quotation_date = ?, valid_until = ?, status = ?,
        subtotal = ?, discount_amount = ?, tax_amount = ?, grand_total = ?, notes = ?, updated_at = ?
       WHERE id = ? AND company_id = ?`,
      [
        patch.customerId ?? null,
        customerName,
        patch.quotationDate || String(existing.quotation_date),
        patch.validUntil === undefined ? existing.valid_until ?? null : patch.validUntil,
        patch.status || existing.status || 'draft',
        subtotal,
        discountAmount,
        taxAmount,
        grandTotal,
        patch.notes ?? existing.notes ?? null,
        ts,
        id,
        user.companyId,
      ],
    )
    run('DELETE FROM quotation_items WHERE quotation_id = ? AND company_id = ?', [id, user.companyId])
    calcs.forEach((item, idx) => {
      run(
        `INSERT INTO quotation_items (id, company_id, quotation_id, product_id, product_name, hsn, qty, rate, discount, tax_rate, amount, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          user.companyId,
          id,
          item.productId ?? null,
          item.productName,
          item.hsn ?? null,
          item.qty,
          item.rate,
          item.discount || 0,
          item.taxRate || 0,
          item.amount,
          idx,
        ],
      )
    })
    writeAudit(user.companyId, user, 'quotation.updated', 'quotations', id, `Quotation ${existing.quotation_number} updated`)
  })

  return getQuotation(id)
}

export function convertQuotation(id: string) {
  const user = requirePermission('quotations.manage')
  const { quotation, items } = getQuotation(id)
  const q = quotation as Record<string, unknown>
  if (q.status === 'converted') throw new AppError('Quotation already converted.', 'VALIDATION')

  const invoice = createInvoice({
    customerId: (q.customer_id as string) || undefined,
    customerName: q.customer_name as string,
    items: items.map((it) => {
      const row = it as Record<string, unknown>
      return {
        productId: (row.product_id as string) || undefined,
        productName: row.product_name as string,
        hsn: (row.hsn as string) || undefined,
        qty: Number(row.qty),
        rate: Number(row.rate),
        discount: Number(row.discount) || 0,
        taxRate: Number(row.tax_rate) || 0,
      }
    }),
    notes: `Converted from ${q.quotation_number}`,
    paymentMethod: 'Credit',
    paidAmount: 0,
  })

  run(`UPDATE quotations SET status = 'converted', updated_at = ? WHERE id = ? AND company_id = ?`, [
    now(),
    id,
    user.companyId,
  ])
  writeAudit(user.companyId, user, 'quotation.converted', 'quotations', id, 'Quotation converted to invoice')
  return invoice
}

export function deleteQuotation(id: string) {
  const user = requirePermission('quotations.manage')
  const existing = queryOne<Record<string, unknown>>('SELECT * FROM quotations WHERE id = ? AND company_id = ?', [id, user.companyId])
  if (!existing) throw new AppError('Quotation not found.', 'NOT_FOUND')
  if (existing.status === 'converted') throw new AppError('Converted quotations cannot be deleted.', 'VALIDATION')
  withTransaction(() => {
    run('DELETE FROM quotation_items WHERE quotation_id = ? AND company_id = ?', [id, user.companyId])
    run('DELETE FROM quotations WHERE id = ? AND company_id = ?', [id, user.companyId])
    writeAudit(user.companyId, user, 'quotation.deleted', 'quotations', id, `Quotation ${existing.quotation_number} deleted`)
  })
}

// ─── Purchases ─────────────────────────────────────────────

export function nextPurchaseNumber(): string {
  const user = requireAuth()
  const year = new Date().getFullYear()
  const count =
    queryOne<{ c: number }>('SELECT COUNT(*) as c FROM purchases WHERE company_id = ?', [user.companyId])?.c ?? 0
  return `PI-${year}-${String(count + 1).padStart(5, '0')}`
}

export function listPurchases(opts: { page?: number; pageSize?: number; search?: string } = {}) {
  const user = requireAuth()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  let where = 'company_id = ?'
  const params: unknown[] = [user.companyId]
  if (opts.search?.trim()) {
    where += ' AND (purchase_number LIKE ? OR supplier_name LIKE ?)'
    const q = `%${opts.search.trim()}%`
    params.push(q, q)
  }
  const total = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM purchases WHERE ${where}`, params)?.c ?? 0
  const rows = queryAll(`SELECT * FROM purchases WHERE ${where} ORDER BY purchase_date DESC LIMIT ? OFFSET ?`, [
    ...params,
    pageSize,
    offset,
  ])
  return { rows, total, page, pageSize }
}

export function createPurchase(input: {
  supplierName: string
  purchaseDate?: string
  purchaseNumber?: string
  items: {
    productId: string
    productName: string
    qty: number
    rate: number
    discount?: number
    taxRate?: number
    amount?: number
  }[]
  notes?: string
}) {
  const user = requirePermission('purchases.manage')
  if (!input.items?.length) throw new AppError('Add at least one product.', 'VALIDATION')

  const ts = now()
  const id = generateId()
  const calcs = input.items.map((item) => {
    const discount = Number(item.discount) || 0
    const base = Math.max(0, item.qty * item.rate - discount)
    const tax = (base * (item.taxRate || 0)) / 100
    const typed = Number(item.amount)
    const hasTyped = Number.isFinite(typed) && item.amount != null
    const amount = hasTyped ? round2(Math.max(0, typed)) : round2(base + tax)
    const factor = 1 + (item.taxRate || 0) / 100
    const taxValue = hasTyped ? round2(amount - (factor > 0 ? amount / factor : amount)) : round2(tax)
    const baseValue = hasTyped ? round2(amount - taxValue) : round2(base)
    return { ...item, discount, amount, tax: taxValue, base: baseValue }
  })
  const subtotal = round2(calcs.reduce((s, i) => s + i.qty * i.rate, 0))
  const taxAmount = round2(calcs.reduce((s, i) => s + i.tax, 0))
  const grandTotal = round2(calcs.reduce((s, i) => s + i.amount, 0))
  const purchaseNumber = input.purchaseNumber || nextPurchaseNumber()

  withTransaction(() => {
    run(
      `INSERT INTO purchases (id, company_id, purchase_number, supplier_name, purchase_date, subtotal, tax_amount, grand_total, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user.companyId,
        purchaseNumber,
        input.supplierName.trim(),
        input.purchaseDate || ts.slice(0, 10),
        subtotal,
        taxAmount,
        grandTotal,
        input.notes ?? null,
        user.id,
        ts,
      ],
    )

    for (const item of calcs) {
      const product = queryOne('SELECT id FROM products WHERE id = ? AND company_id = ?', [item.productId, user.companyId])
      if (!product) throw new AppError(`Product not found: ${item.productName}`, 'NOT_FOUND')

      run(
        `INSERT INTO purchase_items (id, company_id, purchase_id, product_id, product_name, qty, rate, tax_rate, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), user.companyId, id, item.productId, item.productName, item.qty, item.rate, item.taxRate || 0, item.amount],
      )
      const stockQty = inventoryQty(item.productName, item.qty)
      const pieceRate =
        stockQty > 0 && Math.abs(stockQty - item.qty) > 0.0001
          ? Math.round(((item.qty * item.rate) / stockQty) * 100) / 100
          : item.rate
      run('UPDATE products SET current_stock = current_stock + ?, purchase_rate = ?, updated_at = ? WHERE id = ? AND company_id = ?', [
        stockQty,
        pieceRate,
        ts,
        item.productId,
        user.companyId,
      ])
      run(
        `INSERT INTO stock_movements (id, company_id, product_id, movement_type, qty, reference_type, reference_id, created_by, created_at)
         VALUES (?, ?, ?, 'purchase', ?, 'purchase', ?, ?, ?)`,
        [generateId(), user.companyId, item.productId, stockQty, id, user.id, ts],
      )
    }
    writeAudit(user.companyId, user, 'purchase.created', 'purchases', id, `Purchase from ${input.supplierName}`)
  })

  for (const item of calcs) syncProductById(item.productId)
  return queryOne('SELECT * FROM purchases WHERE id = ?', [id])
}

// ─── Expenses ──────────────────────────────────────────────

export function listExpenses(
  opts: {
    page?: number
    pageSize?: number
    category?: string
    paymentMethod?: string
    search?: string
    from?: string
    to?: string
  } = {},
) {
  const user = requireAuth()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  let where = 'e.company_id = ?'
  const params: unknown[] = [user.companyId]
  if (opts.category) {
    where += ' AND e.category = ?'
    params.push(opts.category)
  }
  if (opts.paymentMethod) {
    where += ' AND e.payment_method = ?'
    params.push(opts.paymentMethod)
  }
  const search = (opts.search || '').trim()
  if (search) {
    where += ' AND (e.category LIKE ? OR IFNULL(e.description, \'\') LIKE ? OR IFNULL(e.payment_method, \'\') LIKE ? OR IFNULL(e.notes, \'\') LIKE ?)'
    const like = `%${search}%`
    params.push(like, like, like, like)
  }
  if (opts.from) {
    where += ' AND e.expense_date >= ?'
    params.push(opts.from)
  }
  if (opts.to) {
    where += ' AND e.expense_date <= ?'
    params.push(opts.to)
  }
  const total = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM expenses e WHERE ${where}`, params)?.c ?? 0
  const rows = queryAll(
    `SELECT e.*, u.name as created_by_name FROM expenses e
     LEFT JOIN users u ON u.id = e.created_by
     WHERE ${where} ORDER BY e.expense_date DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )
  return { rows, total, page, pageSize }
}

export function createExpense(input: {
  category: string
  description?: string
  amount: number
  expenseDate?: string
  paymentMethod?: string
  notes?: string
}) {
  const user = requirePermission('expenses.manage')
  if (!(Number(input.amount) > 0)) throw new AppError('Amount must be greater than zero.', 'VALIDATION')
  const id = generateId()
  const ts = now()
  run(
    `INSERT INTO expenses (id, company_id, category, description, amount, expense_date, payment_method, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      user.companyId,
      input.category,
      input.description ?? null,
      Number(input.amount),
      input.expenseDate || ts.slice(0, 10),
      input.paymentMethod ?? null,
      input.notes ?? null,
      user.id,
      ts,
    ],
  )
  writeAudit(user.companyId, user, 'expense.created', 'expenses', id, `${input.category} expense recorded`)
  return queryOne('SELECT * FROM expenses WHERE id = ?', [id])
}

export function updateExpense(
  id: string,
  input: {
    category: string
    description?: string
    amount: number
    expenseDate?: string
    paymentMethod?: string
  },
) {
  const user = requirePermission('expenses.manage')
  const existing = queryOne('SELECT id FROM expenses WHERE id = ? AND company_id = ?', [id, user.companyId])
  if (!existing) throw new AppError('Expense not found.', 'NOT_FOUND')
  if (!(Number(input.amount) > 0)) throw new AppError('Amount must be greater than zero.', 'VALIDATION')
  if (!String(input.category || '').trim()) throw new AppError('Choose a category.', 'VALIDATION')
  run(
    `UPDATE expenses
     SET category = ?, description = ?, amount = ?, expense_date = ?, payment_method = ?
     WHERE id = ? AND company_id = ?`,
    [
      input.category.trim(),
      input.description?.trim() || null,
      Number(input.amount),
      input.expenseDate || now().slice(0, 10),
      input.paymentMethod || null,
      id,
      user.companyId,
    ],
  )
  writeAudit(user.companyId, user, 'expense.updated', 'expenses', id, `${input.category} expense updated`)
  return queryOne('SELECT * FROM expenses WHERE id = ?', [id])
}

export function deleteExpense(id: string) {
  const user = requirePermission('expenses.manage')
  const existing = queryOne('SELECT id FROM expenses WHERE id = ? AND company_id = ?', [id, user.companyId])
  if (!existing) throw new AppError('Expense not found.', 'NOT_FOUND')
  run('DELETE FROM expenses WHERE id = ? AND company_id = ?', [id, user.companyId])
  writeAudit(user.companyId, user, 'expense.deleted', 'expenses', id, 'Expense deleted')
}
