import type { Invoice } from '@/types'
import { formatDate, formatMoney } from '@/utils'

type Cell = string | number
type Align = 'left' | 'right'

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFileName(value: string) {
  const cleaned = value.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return cleaned || 'invoices'
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pdfText(value: string) {
  return value
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}

function clip(value: string, width: number, size: number) {
  const max = Math.max(3, Math.floor(width / (size * 0.52)))
  const text = pdfText(value)
  return text.length > max ? `${text.slice(0, max - 1)}.` : text
}

function downloadExcelFile(filename: string, sheets: { name: string; rows: Cell[][] }[]) {
  const worksheets = sheets
    .map((sheet) => {
      const name = xmlEscape(sheet.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet')
      const rows = sheet.rows
        .map((row) => {
          const cells = row
            .map((cell) => {
              if (typeof cell === 'number' && Number.isFinite(cell)) {
                return `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`
              }
              return `<Cell><Data ss:Type="String">${xmlEscape(String(cell ?? ''))}</Data></Cell>`
            })
            .join('')
          return `<Row>${cells}</Row>`
        })
        .join('')
      return `<Worksheet ss:Name="${name}"><Table>${rows}</Table></Worksheet>`
    })
    .join('')
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${worksheets}
</Workbook>`
  downloadBlob(filename.endsWith('.xls') ? filename : `${filename}.xls`, new Blob([xml], { type: 'application/vnd.ms-excel' }))
}

function buildPdf(pages: string[], landscape = false): Blob {
  const width = landscape ? 842 : 595
  const height = landscape ? 595 : 842
  const pageIds: number[] = []
  const pageObjects: { id: number; contentId: number; content: string }[] = []
  let nextId = 4
  for (const content of pages) {
    const id = nextId
    const contentId = nextId + 1
    nextId += 2
    pageIds.push(id)
    pageObjects.push({ id, contentId, content })
  }
  const objects: string[] = []
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  for (const page of pageObjects) {
    objects[page.id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page.contentId} 0 R >>`
    const stream = `${page.content}\n`
    objects[page.contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}endstream`
  }
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (let i = 1; i < objects.length; i += 1) {
    if (!objects[i]) continue
    offsets[i] = body.length
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = body.length
  const size = objects.length
  let xrefBody = `xref\n0 ${size}\n0000000000 65535 f \n`
  for (let i = 1; i < size; i += 1) {
    xrefBody += `${String(offsets[i] || 0).padStart(10, '0')} 00000 n \n`
  }
  body += `${xrefBody}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([body], { type: 'application/pdf' })
}

function drawTable(
  title: string,
  columns: { header: string; width: number; align?: Align }[],
  rows: string[][],
  landscape: boolean,
) {
  const pageWidth = landscape ? 842 : 595
  const pageHeight = landscape ? 595 : 842
  const left = 32
  const size = 8
  const rowHeight = 16
  const pages: string[] = []
  let commands: string[] = []
  let y = pageHeight - 36

  function startPage() {
    if (commands.length) pages.push(commands.join('\n'))
    commands = []
    y = pageHeight - 36
    commands.push('BT', `/F1 13 Tf`, `${left} ${y} Td`, `(${pdfText(title)}) Tj`, 'ET')
    y -= 22
    drawHeader()
  }

  function drawHeader() {
    let x = left
    commands.push('0.93 0.95 0.97 rg')
    commands.push(`${left - 2} ${y - 4} ${pageWidth - left * 2} 14 re f`)
    commands.push('0 0 0 rg')
    columns.forEach((column) => {
      commands.push('BT', `/F1 ${size} Tf`, `${x} ${y} Td`, `(${pdfText(column.header)}) Tj`, 'ET')
      x += column.width
    })
    y -= rowHeight
  }

  startPage()
  for (const row of rows) {
    if (y < 40) startPage()
    let x = left
    columns.forEach((column, index) => {
      const text = clip(row[index] || '', column.width - 4, size)
      const offset = column.align === 'right' ? Math.max(0, column.width - 8 - text.length * size * 0.5) : 0
      commands.push('BT', `/F1 ${size} Tf`, `${x + offset} ${y} Td`, `(${text}) Tj`, 'ET')
      x += column.width
    })
    y -= rowHeight
  }
  if (!rows.length) {
    commands.push('BT', `/F1 10 Tf`, `${left} ${y} Td`, '(No invoices) Tj', 'ET')
  }
  pages.push(commands.join('\n'))
  return buildPdf(pages, landscape)
}

const LIST_HEADERS = [
  'Invoice No.',
  'Date',
  'Customer',
  'Items',
  'Payment',
  'Grand total',
  'Paid',
  'Balance',
  'Status',
  'Supply type',
  'Created by',
]

function listCells(invoice: Invoice): Cell[] {
  const paid = Number(invoice.paid_amount) || 0
  const total = Number(invoice.grand_total) || 0
  return [
    invoice.invoice_number,
    formatDate(invoice.invoice_date),
    invoice.customer_name || '',
    invoice.item_count ?? '',
    invoice.payment_method || '',
    total,
    paid,
    Math.max(0, Math.round((total - paid) * 100) / 100),
    invoice.payment_status || '',
    invoice.supply_type || 'Business to Customer',
    invoice.created_by_name || '',
  ]
}

function listStrings(invoice: Invoice): string[] {
  return listCells(invoice).map((cell, index) => (index === 5 || index === 6 || index === 7 ? formatMoney(Number(cell)) : String(cell ?? '')))
}

export function downloadInvoiceListExcel(invoices: Invoice[], filename: string) {
  downloadExcelFile(filename, [{ name: 'Invoices', rows: [LIST_HEADERS, ...invoices.map(listCells)] }])
}

export function downloadInvoiceListPdf(invoices: Invoice[], filename: string, title: string) {
  const columns = [
    { header: 'Invoice', width: 78 },
    { header: 'Date', width: 68 },
    { header: 'Customer', width: 150 },
    { header: 'Items', width: 40 },
    { header: 'Payment', width: 70 },
    { header: 'Amount', width: 78 },
    { header: 'Paid', width: 70 },
    { header: 'Status', width: 58 },
    { header: 'Created by', width: 90 },
  ]
  const rows = invoices.map((invoice) => {
    const values = listStrings(invoice)
    return [values[0], values[1], values[2], values[3], values[4], values[5], values[6], values[8], values[10]]
  })
  const blob = drawTable(title, columns, rows, true)
  downloadBlob(filename.endsWith('.pdf') ? filename : `${filename}.pdf`, blob)
}

function detailRows(invoice: Invoice & Record<string, unknown>, items: Record<string, unknown>[]) {
  const paid = Number(invoice.paid_amount) || 0
  const total = Number(invoice.grand_total) || 0
  const header: Cell[][] = [
    ['Invoice No.', invoice.invoice_number],
    ['Date', formatDate(invoice.invoice_date)],
    ['Customer', String(invoice.customer_name || '')],
    ['Payment method', String(invoice.payment_method || '')],
    ['Payment status', String(invoice.payment_status || '')],
    ['Supply type', String(invoice.supply_type || 'Business to Customer')],
    ['Subtotal', Number(invoice.subtotal) || 0],
    ['Discount', Number(invoice.discount_amount) || 0],
    ['Taxable', Number(invoice.taxable_amount) || 0],
    ['CGST', Number(invoice.cgst) || 0],
    ['SGST', Number(invoice.sgst) || 0],
    ['IGST', Number(invoice.igst) || 0],
    ['Grand total', total],
    ['Paid', paid],
    ['Balance', Math.max(0, Math.round((total - paid) * 100) / 100)],
    ['Created by', String(invoice.created_by_name || '')],
    [],
    ['Product', 'HSN', 'Qty', 'Rate', 'Discount', 'GST %', 'Amount'],
  ]
  const lines: Cell[][] = items.map((item) => [
    String(item.product_name || ''),
    item.hsn ? String(item.hsn) : '',
    Number(item.qty) || 0,
    Number(item.rate) || 0,
    Number(item.discount) || 0,
    Number(item.tax_rate) || 0,
    Number(item.amount) || 0,
  ])
  return [...header, ...lines]
}

export function downloadOneInvoiceExcel(invoice: Invoice & Record<string, unknown>, items: Record<string, unknown>[], filename: string) {
  downloadExcelFile(filename, [{ name: 'Invoice', rows: detailRows(invoice, items) }])
}

export function downloadOneInvoicePdf(invoice: Invoice & Record<string, unknown>, items: Record<string, unknown>[], filename: string) {
  const pairs = detailRows(invoice, items).slice(0, 16)
  const pages: string[] = []
  const commands: string[] = []
  let y = 800
  commands.push('BT', '/F1 14 Tf', `40 ${y} Td`, `(${pdfText(String(invoice.invoice_number || 'Invoice'))}) Tj`, 'ET')
  y -= 24
  for (const row of pairs) {
    if (row.length < 2) continue
    const label = pdfText(String(row[0]))
    const raw = typeof row[1] === 'number' && /total|paid|discount|taxable|cgst|sgst|igst|subtotal|balance/i.test(String(row[0]))
      ? formatMoney(row[1])
      : String(row[1] ?? '')
    commands.push('BT', '/F1 10 Tf', `40 ${y} Td`, `(${label}: ${pdfText(raw)}) Tj`, 'ET')
    y -= 16
  }
  y -= 8
  const columns = [
    { header: 'Product', width: 190 },
    { header: 'HSN', width: 55 },
    { header: 'Qty', width: 40 },
    { header: 'Rate', width: 70 },
    { header: 'Discount', width: 70 },
    { header: 'GST', width: 40 },
    { header: 'Amount', width: 75 },
  ]
  let x = 40
  columns.forEach((column) => {
    commands.push('BT', '/F1 9 Tf', `${x} ${y} Td`, `(${pdfText(column.header)}) Tj`, 'ET')
    x += column.width
  })
  y -= 16
  for (const item of items) {
    if (y < 40) break
    const values = [
      String(item.product_name || ''),
      item.hsn ? String(item.hsn) : '',
      String(item.qty ?? ''),
      formatMoney(Number(item.rate) || 0),
      formatMoney(Number(item.discount) || 0),
      `${Number(item.tax_rate) || 0}%`,
      formatMoney(Number(item.amount) || 0),
    ]
    x = 40
    values.forEach((value, index) => {
      commands.push('BT', '/F1 8 Tf', `${x} ${y} Td`, `(${clip(value, columns[index].width - 4, 8)}) Tj`, 'ET')
      x += columns[index].width
    })
    y -= 14
  }
  pages.push(commands.join('\n'))
  downloadBlob(filename.endsWith('.pdf') ? filename : `${filename}.pdf`, buildPdf(pages, false))
}
