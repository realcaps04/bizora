import { queryAll, queryOne, run, withTransaction } from '../database'
import { generateId } from '../security/crypto'
import { AppError, requireAuth, requirePermission } from '../security/session'
import { writeAudit } from './auth'
import { syncProductById } from './accountCloud'

function now(): string {
  return new Date().toISOString()
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

type Kind = 'sale' | 'purchase'

interface SourceItem {
  id: string
  productId: string | null
  productName: string
  qty: number
  amount: number
}

interface SourceDoc {
  id: string
  number: string
  party: string
  date: string
  status: string
  items: SourceItem[]
}

function returnedQty(companyId: string, kind: Kind, sourceId: string) {
  const rows = queryAll<{ source_item_id: string; qty: number }>(
    `SELECT ri.source_item_id, SUM(ri.qty) as qty
     FROM return_items ri
     JOIN returns r ON r.id = ri.return_id
     WHERE r.company_id = ? AND r.kind = ? AND r.source_id = ?
     GROUP BY ri.source_item_id`,
    [companyId, kind, sourceId],
  )
  return new Map(rows.map((row) => [row.source_item_id, Number(row.qty) || 0]))
}

function loadSource(companyId: string, kind: Kind, sourceId: string): SourceDoc {
  if (kind === 'sale') {
    const invoice = queryOne<Record<string, unknown>>(
      'SELECT * FROM invoices WHERE id = ? AND company_id = ?',
      [sourceId, companyId],
    )
    if (!invoice) throw new AppError('Invoice not found.', 'NOT_FOUND')
    if (invoice.status === 'cancelled') throw new AppError('Cancelled invoices cannot be returned.', 'VALIDATION')
    const items = queryAll<Record<string, unknown>>(
      'SELECT * FROM invoice_items WHERE invoice_id = ? AND company_id = ? ORDER BY sort_order',
      [sourceId, companyId],
    )
    return {
      id: sourceId,
      number: String(invoice.invoice_number || ''),
      party: String(invoice.customer_name || 'Customer'),
      date: String(invoice.invoice_date || ''),
      status: String(invoice.status || ''),
      items: items.map((item) => ({
        id: String(item.id),
        productId: item.product_id ? String(item.product_id) : null,
        productName: String(item.product_name || ''),
        qty: Number(item.qty) || 0,
        amount: Number(item.amount) || 0,
      })),
    }
  }

  const purchase = queryOne<Record<string, unknown>>(
    'SELECT * FROM purchases WHERE id = ? AND company_id = ?',
    [sourceId, companyId],
  )
  if (!purchase) throw new AppError('Purchase not found.', 'NOT_FOUND')
  const items = queryAll<Record<string, unknown>>(
    'SELECT * FROM purchase_items WHERE purchase_id = ? AND company_id = ?',
    [sourceId, companyId],
  )
  return {
    id: sourceId,
    number: String(purchase.purchase_number || ''),
    party: String(purchase.supplier_name || 'Supplier'),
    date: String(purchase.purchase_date || ''),
    status: 'confirmed',
    items: items.map((item) => ({
      id: String(item.id),
      productId: item.product_id ? String(item.product_id) : null,
      productName: String(item.product_name || ''),
      qty: Number(item.qty) || 0,
      amount: Number(item.amount) || 0,
    })),
  }
}

export function listReturns(kind?: Kind) {
  const user = requireAuth()
  const params: unknown[] = [user.companyId]
  let where = 'company_id = ?'
  if (kind === 'sale' || kind === 'purchase') {
    where += ' AND kind = ?'
    params.push(kind)
  }
  const rows = queryAll(`SELECT * FROM returns WHERE ${where} ORDER BY return_date DESC, created_at DESC`, params)
  const items = rows.length
    ? queryAll(
        `SELECT * FROM return_items WHERE company_id = ? AND return_id IN (${rows.map(() => '?').join(', ')})`,
        [user.companyId, ...rows.map((row) => (row as { id: string }).id)],
      )
    : []
  return { rows, items }
}

export function getReturnSource(kind: Kind, sourceId: string) {
  const user = requireAuth()
  if (kind !== 'sale' && kind !== 'purchase') throw new AppError('Choose a sales or purchase return.', 'VALIDATION')
  const source = loadSource(user.companyId, kind, sourceId)
  const returned = returnedQty(user.companyId, kind, sourceId)
  return {
    ...source,
    kind,
    items: source.items.map((item) => {
      const already = round2(returned.get(item.id) || 0)
      return {
        ...item,
        returnedQty: already,
        remainingQty: round2(Math.max(0, item.qty - already)),
      }
    }),
  }
}

export function createReturn(input: {
  kind: Kind
  sourceId: string
  returnDate?: string
  notes?: string
  items: { sourceItemId: string; qty: number }[]
}) {
  const kind = input.kind
  if (kind !== 'sale' && kind !== 'purchase') throw new AppError('Choose a sales or purchase return.', 'VALIDATION')
  const user = requirePermission(kind === 'sale' ? 'invoices.create' : 'purchases.manage')
  const requested = (input.items || [])
    .map((item) => ({ sourceItemId: String(item.sourceItemId || ''), qty: Number(item.qty) || 0 }))
    .filter((item) => item.sourceItemId && item.qty > 0)
  if (!requested.length) throw new AppError('Enter a quantity for at least one product.', 'VALIDATION')

  const source = loadSource(user.companyId, kind, input.sourceId)
  const returned = returnedQty(user.companyId, kind, source.id)
  const byId = new Map(source.items.map((item) => [item.id, item]))
  const lines = requested.map((item) => {
    const sourceItem = byId.get(item.sourceItemId)
    if (!sourceItem) throw new AppError('One of the products is not on this document.', 'VALIDATION')
    const already = returned.get(sourceItem.id) || 0
    const remaining = round2(sourceItem.qty - already)
    if (item.qty - remaining > 0.0001) {
      throw new AppError(`${sourceItem.productName} only has ${remaining} left to return.`, 'VALIDATION')
    }
    const unit = sourceItem.qty > 0 ? sourceItem.amount / sourceItem.qty : 0
    return {
      ...sourceItem,
      qty: round2(item.qty),
      rate: round2(unit),
      amount: round2(unit * item.qty),
    }
  })

  const ts = now()
  const returnDate = input.returnDate || ts.slice(0, 10)
  const id = generateId()
  const prefix = kind === 'sale' ? 'SR' : 'PR'
  const count =
    queryOne<{ c: number }>('SELECT COUNT(*) as c FROM returns WHERE company_id = ? AND kind = ?', [
      user.companyId,
      kind,
    ])?.c ?? 0
  const returnNumber = `${prefix}-${String(count + 1).padStart(4, '0')}`
  const grandTotal = round2(lines.reduce((sum, line) => sum + line.amount, 0))
  const productIds = new Set<string>()

  withTransaction(() => {
    run(
      `INSERT INTO returns (
        id, company_id, return_number, kind, source_id, source_number, party_name, return_date, notes, grand_total, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        user.companyId,
        returnNumber,
        kind,
        source.id,
        source.number,
        source.party,
        returnDate,
        input.notes?.trim() || null,
        grandTotal,
        user.id,
        ts,
      ],
    )

    for (const line of lines) {
      run(
        `INSERT INTO return_items (
          id, company_id, return_id, source_item_id, product_id, product_name, qty, rate, amount
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          user.companyId,
          id,
          line.id,
          line.productId,
          line.productName,
          line.qty,
          line.rate,
          line.amount,
        ],
      )
      if (!line.productId) continue
      const product = queryOne<{ current_stock: number }>('SELECT current_stock FROM products WHERE id = ? AND company_id = ?', [
        line.productId,
        user.companyId,
      ])
      if (!product) throw new AppError(`Product not found: ${line.productName}`, 'NOT_FOUND')
      if (kind === 'purchase' && Number(product.current_stock) + 0.0001 < line.qty) {
        throw new AppError(`${line.productName} does not have enough stock to return.`, 'VALIDATION')
      }
      const stockChange = kind === 'sale' ? line.qty : -line.qty
      run('UPDATE products SET current_stock = current_stock + ?, updated_at = ? WHERE id = ? AND company_id = ?', [
        stockChange,
        ts,
        line.productId,
        user.companyId,
      ])
      run(
        `INSERT INTO stock_movements (
          id, company_id, product_id, movement_type, qty, reference_type, reference_id, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, 'return', ?, ?, ?, ?)`,
        [
          generateId(),
          user.companyId,
          line.productId,
          kind === 'sale' ? 'sale_return' : 'purchase_return',
          stockChange,
          id,
          `${returnNumber} against ${source.number}`,
          user.id,
          ts,
        ],
      )
      productIds.add(line.productId)
    }

    writeAudit(
      user.companyId,
      user,
      'return.created',
      'returns',
      id,
      `${returnNumber} for ${source.number}`,
    )
  })

  for (const productId of productIds) syncProductById(productId)
  return queryOne('SELECT * FROM returns WHERE id = ? AND company_id = ?', [id, user.companyId])
}
