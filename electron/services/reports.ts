import { queryAll, queryOne } from '../database'
import { requireAuth, requirePermission } from '../security/session'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function monthStart(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function getDashboardStats() {
  const user = requireAuth()
  const cid = user.companyId
  const t = today()
  const ms = monthStart()

  const todaySales = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(grand_total),0) as total FROM invoices
     WHERE company_id = ? AND invoice_date = ? AND status != 'cancelled'`,
    [cid, t],
  )?.total ?? 0

  const monthSales = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(grand_total),0) as total FROM invoices
     WHERE company_id = ? AND invoice_date >= ? AND status != 'cancelled'`,
    [cid, ms],
  )?.total ?? 0

  const outstanding = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(grand_total - paid_amount),0) as total FROM invoices
     WHERE company_id = ? AND status != 'cancelled' AND payment_status != 'paid'`,
    [cid],
  )?.total ?? 0

  const customers = queryOne<{ c: number }>(
    `SELECT COUNT(*) as c FROM customers WHERE company_id = ? AND status = 'active'`,
    [cid],
  )?.c ?? 0

  const recentInvoices = queryAll(
    `SELECT id, invoice_number, customer_name, invoice_date, grand_total, payment_status, status
     FROM invoices WHERE company_id = ? ORDER BY created_at DESC LIMIT 8`,
    [cid],
  )

  const salesOverview = queryAll<{ day: string; total: number }>(
    `SELECT invoice_date as day, COALESCE(SUM(grand_total),0) as total
     FROM invoices
     WHERE company_id = ? AND status != 'cancelled'
       AND invoice_date >= date('now', '-29 days')
     GROUP BY invoice_date
     ORDER BY invoice_date`,
    [cid],
  )

  return {
    todaySales,
    monthSales,
    outstanding,
    customers,
    recentInvoices,
    salesOverview,
    greetingName: user.name,
  }
}

export function reportSales(opts: { from?: string; to?: string; groupBy?: 'customer' | 'product' | 'payment' | 'day' } = {}) {
  requirePermission('reports.view')
  const user = requireAuth()
  const from = opts.from || monthStart()
  const to = opts.to || today()
  const cid = user.companyId

  const summary = queryOne(
    `SELECT COUNT(*) as invoice_count,
      COALESCE(SUM(grand_total),0) as revenue,
      COALESCE(SUM(paid_amount),0) as collected,
      COALESCE(SUM(grand_total - paid_amount),0) as outstanding
     FROM invoices
     WHERE company_id = ? AND status != 'cancelled' AND invoice_date BETWEEN ? AND ?`,
    [cid, from, to],
  )

  let breakdown: Record<string, unknown>[] = []
  if (opts.groupBy === 'customer') {
    breakdown = queryAll(
      `SELECT customer_name as label, COUNT(*) as count, SUM(grand_total) as total
       FROM invoices WHERE company_id = ? AND status != 'cancelled' AND invoice_date BETWEEN ? AND ?
       GROUP BY customer_name ORDER BY total DESC LIMIT 50`,
      [cid, from, to],
    )
  } else if (opts.groupBy === 'payment') {
    breakdown = queryAll(
      `SELECT COALESCE(payment_method, 'Unspecified') as label, COUNT(*) as count, SUM(grand_total) as total
       FROM invoices WHERE company_id = ? AND status != 'cancelled' AND invoice_date BETWEEN ? AND ?
       GROUP BY payment_method ORDER BY total DESC`,
      [cid, from, to],
    )
  } else if (opts.groupBy === 'product') {
    breakdown = queryAll(
      `SELECT ii.product_name as label, SUM(ii.qty) as count, SUM(ii.amount) as total
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.company_id = ? AND i.status != 'cancelled' AND i.invoice_date BETWEEN ? AND ?
       GROUP BY ii.product_name ORDER BY total DESC LIMIT 50`,
      [cid, from, to],
    )
  } else {
    breakdown = queryAll(
      `SELECT invoice_date as label, COUNT(*) as count, SUM(grand_total) as total
       FROM invoices WHERE company_id = ? AND status != 'cancelled' AND invoice_date BETWEEN ? AND ?
       GROUP BY invoice_date ORDER BY invoice_date`,
      [cid, from, to],
    )
  }

  return { from, to, summary, breakdown }
}

export function reportFinancial(opts: { from?: string; to?: string } = {}) {
  requirePermission('reports.view')
  const user = requireAuth()
  const from = opts.from || monthStart()
  const to = opts.to || today()
  const cid = user.companyId

  const revenue = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(grand_total),0) as total FROM invoices
     WHERE company_id = ? AND status != 'cancelled' AND invoice_date BETWEEN ? AND ?`,
    [cid, from, to],
  )?.total ?? 0

  const outstanding = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(grand_total - paid_amount),0) as total FROM invoices
     WHERE company_id = ? AND status != 'cancelled'`,
    [cid],
  )?.total ?? 0

  const expenses = queryOne<{ total: number }>(
    `SELECT COALESCE(SUM(amount),0) as total FROM expenses
     WHERE company_id = ? AND expense_date BETWEEN ? AND ?`,
    [cid, from, to],
  )?.total ?? 0

  const expenseByCategory = queryAll(
    `SELECT category as label, SUM(amount) as total FROM expenses
     WHERE company_id = ? AND expense_date BETWEEN ? AND ?
     GROUP BY category ORDER BY total DESC`,
    [cid, from, to],
  )

  return {
    from,
    to,
    revenue,
    outstanding,
    expenses,
    profit: revenue - expenses,
    expenseByCategory,
  }
}

export function reportInventory() {
  requirePermission('reports.view')
  const user = requireAuth()
  const cid = user.companyId
  const stock = queryAll(
    `SELECT id, name, sku, category, current_stock, min_stock, selling_rate, purchase_rate, status
     FROM products WHERE company_id = ? ORDER BY name`,
    [cid],
  )
  const lowStock = queryAll(
    `SELECT id, name, sku, current_stock, min_stock FROM products
     WHERE company_id = ? AND status = 'active' AND current_stock <= min_stock
     ORDER BY current_stock`,
    [cid],
  )
  const movements = queryAll(
    `SELECT sm.*, p.name as product_name FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.company_id = ? ORDER BY sm.created_at DESC LIMIT 100`,
    [cid],
  )
  const purchaseSummary = queryOne(
    `SELECT COUNT(*) as count, COALESCE(SUM(grand_total),0) as total FROM purchases WHERE company_id = ?`,
    [cid],
  )
  return { stock, lowStock, movements, purchaseSummary }
}

export function reportTax(opts: { from?: string; to?: string } = {}) {
  requirePermission('reports.view')
  const user = requireAuth()
  const from = opts.from || monthStart()
  const to = opts.to || today()
  const cid = user.companyId

  const summary = queryOne(
    `SELECT
      COALESCE(SUM(taxable_amount),0) as taxable,
      COALESCE(SUM(cgst),0) as cgst,
      COALESCE(SUM(sgst),0) as sgst,
      COALESCE(SUM(igst),0) as igst,
      COALESCE(SUM(grand_total),0) as total
     FROM invoices
     WHERE company_id = ? AND status != 'cancelled' AND invoice_date BETWEEN ? AND ?`,
    [cid, from, to],
  )

  const rows = queryAll(
    `SELECT invoice_number, invoice_date, customer_name, taxable_amount, cgst, sgst, igst, grand_total
     FROM invoices
     WHERE company_id = ? AND status != 'cancelled' AND invoice_date BETWEEN ? AND ?
     ORDER BY invoice_date`,
    [cid, from, to],
  )

  return { from, to, summary, rows }
}

export function listAuditLogs(opts: { page?: number; pageSize?: number; module?: string } = {}) {
  requirePermission('audit.view')
  const user = requireAuth()
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize
  let where = 'company_id = ?'
  const params: unknown[] = [user.companyId]
  if (opts.module) {
    where += ' AND module = ?'
    params.push(opts.module)
  }
  const total = queryOne<{ c: number }>(`SELECT COUNT(*) as c FROM audit_logs WHERE ${where}`, params)?.c ?? 0
  const rows = queryAll(
    `SELECT * FROM audit_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  )
  return { rows, total, page, pageSize }
}
