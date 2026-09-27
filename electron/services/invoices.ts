import { queryAll, queryOne, run, withTransaction } from '../database'
import { generateId } from '../security/crypto'
import { AppError, requireAuth, requirePermission } from '../security/session'
import { writeAudit } from './auth'

function now(): string {
  return new Date().toISOString()
}

export interface InvoiceItemInput {
  productId?: string
  productName: string
  hsn?: string
  qty: number
  rate: number
  discount?: number
  taxRate?: number
}

function calcItem(item: InvoiceItemInput) {
  const qty = Number(item.qty) || 0
  const rate = Number(item.rate) || 0
  const discount = Number(item.discount) || 0
  const taxRate = Number(item.taxRate) || 0
  const base = qty * rate
  const afterDiscount = Math.max(0, base - discount)
  const taxAmount = (afterDiscount * taxRate) / 100
  const amount = afterDiscount + taxAmount
  return { qty, rate, discount, taxRate, taxAmount, amount, afterDiscount }
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function nextInvoiceNumber(): string {
  const user = requireAuth()
  const company = queryOne<{ invoice_prefix: string; invoice_next: number }>(
    'SELECT invoice_prefix, invoice_next FROM companies WHERE id = ?',
    [user.companyId],
  )
  if (!company) throw new AppError('Company not found.', 'NOT_FOUND')
  const num = String(company.invoice_next).padStart(4, '0')
  return `${company.invoice_prefix}-${num}`
}

export function listInvoices(opts: {
  search?: string
  status?: string
  paymentStatus?: string
  customerId?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
} = {}) {
  const user = requireAuth()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  let where = 'i.company_id = ?'
  const params: unknown[] = [user.companyId]

  if (opts.search?.trim()) {
    where += ' AND (i.invoice_number LIKE ? OR i.customer_name LIKE ?)'
    const q = `%${opts.search.trim()}%`
    params.push(q, q)
  }
  if (opts.status) {
    where += ' AND i.status = ?'
    params.push(opts.status)
  }
  if (opts.paymentStatus) {
    where += ' AND i.payment_status = ?'
    params.push(opts.paymentStatus)
  }
  if (opts.customerId) {
    where += ' AND i.customer_id = ?'
    params.push(opts.customerId)
  }
  if (opts.from) {
    where += ' AND i.invoice_date >= ?'
    params.push(opts.from)
  }
  if (opts.to) {
    where += ' AND i.invoice_date <= ?'
    params.push(opts.to)
  }

  const total = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM invoices i WHERE ${where}`, params)?.c ?? 0
  const rows = queryAll(
    `SELECT i.*, u.name as created_by_name,
      (SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.id) as item_count
     FROM invoices i
     LEFT JOIN users u ON u.id = i.created_by
     WHERE ${where}
     ORDER BY i.invoice_date DESC, i.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )
  return { rows, total, page, pageSize }
}

export function getInvoice(id: string) {
  const user = requireAuth()
  const invoice = queryOne(
    `SELECT i.*, u.name as created_by_name
     FROM invoices i LEFT JOIN users u ON u.id = i.created_by
     WHERE i.id = ? AND i.company_id = ?`,
    [id, user.companyId],
  )
  if (!invoice) throw new AppError('Invoice not found.', 'NOT_FOUND')
  const items = queryAll('SELECT * FROM invoice_items WHERE invoice_id = ? AND company_id = ? ORDER BY sort_order', [
    id,
    user.companyId,
  ])
  const payments = queryAll('SELECT * FROM payments WHERE invoice_id = ? AND company_id = ? ORDER BY payment_date', [
    id,
    user.companyId,
  ])
  const inv = invoice as Record<string, unknown>
  let customer: Record<string, unknown> | null = null
  if (inv.customer_id) {
    customer = queryOne('SELECT * FROM customers WHERE id = ? AND company_id = ?', [
      inv.customer_id,
      user.companyId,
    ]) as Record<string, unknown> | null
  }
  const company = queryOne('SELECT * FROM companies WHERE id = ?', [user.companyId])
  return { invoice, items, payments, company, customer }
}

export function createInvoice(input: {
  customerId?: string
  customerName?: string
  invoiceDate?: string
  paymentMethod?: string
  items: InvoiceItemInput[]
  discountAmount?: number
  notes?: string
  interState?: boolean
  paidAmount?: number
  status?: 'draft' | 'confirmed'
}) {
  const user = requirePermission('invoices.create')
  if (!input.items?.length) throw new AppError('Add at least one product to the invoice.', 'VALIDATION')

  const status = input.status === 'draft' ? 'draft' : 'confirmed'
  const ts = now()
  const invoiceDate = input.invoiceDate || ts.slice(0, 10)
  let customerName = input.customerName || 'Walk-in Customer'
  if (input.customerId) {
    const c = queryOne<{ name: string }>('SELECT name FROM customers WHERE id = ? AND company_id = ?', [
      input.customerId,
      user.companyId,
    ])
    if (!c) throw new AppError('Customer not found.', 'NOT_FOUND')
    customerName = c.name
  }

  const calculated = input.items.map(calcItem)
  const subtotal = round2(calculated.reduce((s, i) => s + i.qty * i.rate, 0))
  const lineDiscount = round2(calculated.reduce((s, i) => s + i.discount, 0))
  const extraDiscount = Number(input.discountAmount) || 0
  const discountAmount = round2(lineDiscount + extraDiscount)
  const taxable = round2(Math.max(0, calculated.reduce((s, i) => s + i.afterDiscount, 0) - extraDiscount))
  const totalTax = round2(calculated.reduce((s, i) => s + i.taxAmount, 0))

  let cgst = 0
  let sgst = 0
  let igst = 0
  if (input.interState) {
    igst = totalTax
  } else {
    cgst = round2(totalTax / 2)
    sgst = round2(totalTax / 2)
  }

  const beforeRound = taxable + totalTax
  const grandTotal = Math.round(beforeRound)
  const roundOff = round2(grandTotal - beforeRound)

  let paidAmount = Number(input.paidAmount)
  if (Number.isNaN(paidAmount)) {
    paidAmount = input.paymentMethod && input.paymentMethod !== 'Credit' ? grandTotal : 0
  }
  paidAmount = Math.min(grandTotal, Math.max(0, paidAmount))

  let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid'
  if (paidAmount >= grandTotal && grandTotal > 0) paymentStatus = 'paid'
  else if (paidAmount > 0) paymentStatus = 'partial'

  const invoiceId = generateId()

  withTransaction(() => {
    const company = queryOne<{ invoice_prefix: string; invoice_next: number }>(
      'SELECT invoice_prefix, invoice_next FROM companies WHERE id = ?',
      [user.companyId],
    )
    if (!company) throw new AppError('Company not found.', 'NOT_FOUND')
    const invoiceNumber = `${company.invoice_prefix}-${String(company.invoice_next).padStart(4, '0')}`

    run(
      `INSERT INTO invoices (
        id, company_id, invoice_number, customer_id, customer_name, invoice_date,
        status, payment_status, payment_method, subtotal, discount_amount, taxable_amount,
        cgst, sgst, igst, round_off, grand_total, paid_amount, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceId,
        user.companyId,
        invoiceNumber,
        input.customerId ?? null,
        customerName,
        invoiceDate,
        status,
        paymentStatus,
        input.paymentMethod ?? null,
        subtotal,
        discountAmount,
        taxable,
        cgst,
        sgst,
        igst,
        roundOff,
        grandTotal,
        paidAmount,
        input.notes ?? null,
        user.id,
        ts,
        ts,
      ],
    )

    input.items.forEach((item, idx) => {
      const calc = calculated[idx]
      run(
        `INSERT INTO invoice_items (
          id, company_id, invoice_id, product_id, product_name, hsn, qty, rate, discount, tax_rate, tax_amount, amount, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          user.companyId,
          invoiceId,
          item.productId ?? null,
          item.productName,
          item.hsn ?? null,
          calc.qty,
          calc.rate,
          calc.discount,
          calc.taxRate,
          calc.taxAmount,
          calc.amount,
          idx,
        ],
      )

      if (item.productId) {
        const product = queryOne<{ current_stock: number }>('SELECT current_stock FROM products WHERE id = ? AND company_id = ?', [
          item.productId,
          user.companyId,
        ])
        if (!product) throw new AppError(`Product not found: ${item.productName}`, 'NOT_FOUND')
        run('UPDATE products SET current_stock = current_stock - ?, updated_at = ? WHERE id = ? AND company_id = ?', [
          calc.qty,
          ts,
          item.productId,
          user.companyId,
        ])
        run(
          `INSERT INTO stock_movements (id, company_id, product_id, movement_type, qty, reference_type, reference_id, created_by, created_at)
           VALUES (?, ?, ?, 'sale', ?, 'invoice', ?, ?, ?)`,
          [generateId(), user.companyId, item.productId, -calc.qty, invoiceId, user.id, ts],
        )
      }
    })

    if (paidAmount > 0) {
      run(
        `INSERT INTO payments (id, company_id, invoice_id, customer_id, customer_name, payment_date, method, amount, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          user.companyId,
          invoiceId,
          input.customerId ?? null,
          customerName,
          invoiceDate,
          input.paymentMethod || 'Cash',
          paidAmount,
          user.id,
          ts,
        ],
      )
    }

    run('UPDATE companies SET invoice_next = invoice_next + 1, updated_at = ? WHERE id = ?', [ts, user.companyId])
    writeAudit(user.companyId, user, 'invoice.created', 'invoices', invoiceId, `Invoice created`)
  })

  return getInvoice(invoiceId)
}

export function cancelInvoice(id: string) {
  const user = requirePermission('invoices.cancel')
  const invoice = queryOne<Record<string, unknown>>('SELECT * FROM invoices WHERE id = ? AND company_id = ?', [id, user.companyId])
  if (!invoice) throw new AppError('Invoice not found.', 'NOT_FOUND')
  if (invoice.status === 'cancelled') throw new AppError('Invoice is already cancelled.', 'VALIDATION')

  const ts = now()
  withTransaction(() => {
    const items = queryAll<{ product_id: string | null; qty: number }>(
      'SELECT product_id, qty FROM invoice_items WHERE invoice_id = ? AND company_id = ?',
      [id, user.companyId],
    )
    for (const item of items) {
      if (!item.product_id) continue
      run('UPDATE products SET current_stock = current_stock + ?, updated_at = ? WHERE id = ? AND company_id = ?', [
        item.qty,
        ts,
        item.product_id,
        user.companyId,
      ])
      run(
        `INSERT INTO stock_movements (id, company_id, product_id, movement_type, qty, reference_type, reference_id, notes, created_by, created_at)
         VALUES (?, ?, ?, 'sale_cancel', ?, 'invoice', ?, 'Invoice cancelled', ?, ?)`,
        [generateId(), user.companyId, item.product_id, item.qty, id, user.id, ts],
      )
    }
    run(`UPDATE invoices SET status = 'cancelled', updated_at = ? WHERE id = ? AND company_id = ?`, [ts, id, user.companyId])
    writeAudit(user.companyId, user, 'invoice.cancelled', 'invoices', id, `Invoice ${invoice.invoice_number} cancelled`)
  })
  return getInvoice(id)
}

export function createPayment(input: {
  invoiceId: string
  amount: number
  method: string
  paymentDate?: string
  notes?: string
}) {
  const user = requirePermission('payments.manage')
  const invoice = queryOne<Record<string, unknown>>('SELECT * FROM invoices WHERE id = ? AND company_id = ?', [
    input.invoiceId,
    user.companyId,
  ])
  if (!invoice) throw new AppError('Invoice not found.', 'NOT_FOUND')
  if (invoice.status === 'cancelled') throw new AppError('Cannot record payment for a cancelled invoice.', 'VALIDATION')

  const amount = Number(input.amount)
  if (!(amount > 0)) throw new AppError('Payment amount must be greater than zero.', 'VALIDATION')

  const due = Number(invoice.grand_total) - Number(invoice.paid_amount)
  if (amount > due + 0.01) throw new AppError('Payment exceeds outstanding balance.', 'VALIDATION')

  const ts = now()
  const paymentDate = input.paymentDate || ts.slice(0, 10)
  const paymentId = generateId()
  const newPaid = round2(Number(invoice.paid_amount) + amount)
  let paymentStatus = 'partial'
  if (newPaid >= Number(invoice.grand_total)) paymentStatus = 'paid'

  withTransaction(() => {
    run(
      `INSERT INTO payments (id, company_id, invoice_id, customer_id, customer_name, payment_date, method, amount, notes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paymentId,
        user.companyId,
        input.invoiceId,
        invoice.customer_id,
        invoice.customer_name,
        paymentDate,
        input.method,
        amount,
        input.notes ?? null,
        user.id,
        ts,
      ],
    )
    run(`UPDATE invoices SET paid_amount = ?, payment_status = ?, payment_method = ?, updated_at = ? WHERE id = ? AND company_id = ?`, [
      newPaid,
      paymentStatus,
      input.method,
      ts,
      input.invoiceId,
      user.companyId,
    ])
    writeAudit(user.companyId, user, 'payment.created', 'payments', paymentId, `Payment of ${amount} recorded`)
  })

  return queryOne('SELECT * FROM payments WHERE id = ?', [paymentId])
}

export function listPayments(opts: { page?: number; pageSize?: number; search?: string } = {}) {
  const user = requireAuth()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  let where = 'p.company_id = ?'
  const params: unknown[] = [user.companyId]
  if (opts.search?.trim()) {
    where += ' AND (p.customer_name LIKE ? OR i.invoice_number LIKE ?)'
    const q = `%${opts.search.trim()}%`
    params.push(q, q)
  }
  const total = queryOne<{ c: number }>(
    `SELECT COUNT(*) as c FROM payments p LEFT JOIN invoices i ON i.id = p.invoice_id WHERE ${where}`,
    params,
  )?.c ?? 0
  const rows = queryAll(
    `SELECT p.*, i.invoice_number, u.name as created_by_name
     FROM payments p
     LEFT JOIN invoices i ON i.id = p.invoice_id
     LEFT JOIN users u ON u.id = p.created_by
     WHERE ${where}
     ORDER BY p.payment_date DESC, p.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )
  return { rows, total, page, pageSize }
}
