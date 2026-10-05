import { useEffect } from 'react'
import { amountInWords, cn, formatDate, formatMoney } from '@/utils'
import { UpiQr, isUpiId } from '@/components/UpiQr'

export interface PrintLineItem {
  id?: string
  productName: string
  description?: string
  hsn?: string
  qty: number
  rate: number
  discount: number
  taxRate: number
  amount: number
}

export interface PrintParty {
  name: string
  address?: string
  phone?: string
  gstin?: string
}

export interface PrintBank {
  accountName?: string
  accountNumber?: string
  ifsc?: string
  bankName?: string
  upiId?: string
}

export interface DocumentPrintProps {
  kind: 'invoice' | 'quotation'
  company: Record<string, unknown>
  customer: PrintParty
  documentNumber: string
  documentDate: string
  dueOrValidDate?: string | null
  paymentMode?: string | null
  status?: string | null
  placeOfSupply?: string | null
  supplyType?: string | null
  invoiceType?: string | null
  poNumber?: string | null
  reverseCharge?: boolean
  shippingAddress?: string | null
  cess?: number
  otherCharges?: number
  items: PrintLineItem[]
  subtotal: number
  discount: number
  taxable: number
  cgst: number
  sgst: number
  igst: number
  grandTotal: number
  paidAmount?: number
  balanceDue?: number
  notes?: string | null
  terms?: string[]
  bank?: PrintBank
  paperFormat?: string | null
  className?: string
}

export const DEFAULT_INVOICE_TERMS = [
  'Goods once sold will not be taken back.',
  'Interest @ 18% p.a. will be charged on overdue payments.',
  'Subject to Kerala jurisdiction.',
]

export function termsFromSetting(value?: string | null): string[] | undefined {
  const lines = String(value || '')
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean)
  return lines.length ? lines : undefined
}

const DEFAULT_QUOTATION_TERMS = [
  'This quotation is valid until the date mentioned above.',
  'Prices are subject to change after the validity period.',
  'GST will be charged as applicable at the time of billing.',
]

function companyInitial(name: string) {
  return (name.trim().charAt(0) || 'B').toUpperCase()
}

function splitProductName(name: string): { title: string; spec?: string } {
  const m = name.match(/^(.*)\s*\((.+)\)\s*$/)
  if (m) return { title: m[1].trim(), spec: m[2].trim() }
  return { title: name }
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[#D6DEE8] last:border-b-0">
      <td className="w-[42%] bg-[#F4F7FB] px-2.5 py-1.5 text-[11px] font-medium text-[#4A5D78]">{label}</td>
      <td className="px-2.5 py-1.5 text-[11.5px] font-semibold text-[#0F2744]">{value}</td>
    </tr>
  )
}

function TotalRow({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <tr className={cn('border-b border-[#D6DEE8]', bold && 'bg-[#F4F7FB]')}>
      <td className={cn('px-2.5 py-1.5 text-[11.5px] text-[#4A5D78]', bold && 'font-bold text-[#0F2744]')}>
        {label}
      </td>
      <td
        className={cn(
          'px-2.5 py-1.5 text-right text-[11.5px] tabular-nums text-[#0F2744]',
          bold && 'font-bold',
        )}
      >
        {value}
      </td>
    </tr>
  )
}

export function DocumentPrint({
  kind,
  company,
  customer,
  documentNumber,
  documentDate,
  dueOrValidDate,
  paymentMode,
  status,
  placeOfSupply,
  supplyType,
  invoiceType,
  poNumber,
  reverseCharge,
  shippingAddress,
  cess = 0,
  otherCharges = 0,
  items,
  subtotal,
  discount,
  taxable,
  cgst,
  sgst,
  igst,
  grandTotal,
  paidAmount = 0,
  balanceDue = 0,
  notes,
  terms,
  bank,
  paperFormat,
  className,
}: DocumentPrintProps) {
  const companyName = String(company.name || 'Company')
  const logoPath = company.logo_path ? String(company.logo_path) : ''
  const isInvoice = kind === 'invoice'
  const title = isInvoice ? 'TAX INVOICE' : 'QUOTATION'
  const subtitle = isInvoice ? 'GST Tax Invoice' : 'Quotation'
  const totalQty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0)
  const avgHalf = (() => {
    const rates = items.map((i) => Number(i.taxRate) || 0).filter((r) => r > 0)
    if (!rates.length) return 9
    return rates[0] / 2
  })()
  const interState = igst > 0 && cgst === 0 && sgst === 0
  const termLines = terms?.length
    ? terms
    : isInvoice
      ? DEFAULT_INVOICE_TERMS
      : DEFAULT_QUOTATION_TERMS
  const noteText = (notes || '').trim() || 'Thank you for your business'
  const upiId = bank?.upiId?.trim() || ''
  const upiAmount = balanceDue > 0 ? balanceDue : grandTotal
  const hasBank =
    Boolean(bank?.accountName) ||
    Boolean(bank?.accountNumber) ||
    Boolean(bank?.ifsc) ||
    Boolean(bank?.bankName) ||
    isUpiId(upiId)
  const half = paperFormat === 'half-a4'

  useEffect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-bizora-paper', '1')
    style.textContent = half
      ? '@media print{@page{size:A5 landscape;margin:4mm 5mm;}}'
      : '@media print{@page{size:A4;margin:10mm;}}'
    document.head.appendChild(style)
    return () => style.remove()
  }, [half])

  if (half) {
    return (
      <div
        className={cn(
          'doc-print doc-print-half mx-auto w-full max-w-[794px] bg-white text-[#0F2744]',
          'border border-[#C9D4E2] print:border-0',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#C9D4E2] px-3 py-1.5">
          <div className="min-w-0">
            <div className="text-[15px] font-bold leading-tight tracking-[0.03em] text-[#0B3A7A]">{title}</div>
            <div className="text-[12px] font-bold leading-tight text-[#0F2744]">{companyName}</div>
            <div className="mt-0.5 text-[10px] leading-snug text-[#4A5D78]">
              {[company.address ? String(company.address).replace(/\s*\n\s*/g, ', ') : '', company.mobile ? `Ph ${company.mobile}` : '', company.gstin ? `GSTIN ${company.gstin}` : '']
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <table className="w-[210px] shrink-0 border-collapse text-[10px]">
            <tbody>
              <MetaRow label={isInvoice ? 'Invoice#' : 'No.'} value={documentNumber} />
              <MetaRow label="Date" value={formatDate(documentDate)} />
              <MetaRow label={isInvoice ? 'Due' : 'Valid'} value={formatDate(dueOrValidDate)} />
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 border-b border-[#C9D4E2] text-[10.5px] leading-snug">
          <div className="border-r border-[#C9D4E2] px-3 py-1.5">
            <span className="font-semibold text-[#4A5D78]">Bill to </span>
            <span className="font-bold text-[#0F2744]">{customer.name || '—'}</span>
            {customer.gstin ? <span className="text-[#4A5D78]"> · {customer.gstin}</span> : null}
            {customer.phone ? <span className="text-[#4A5D78]"> · {customer.phone}</span> : null}
            {customer.address ? (
              <div className="text-[#4A5D78]">{customer.address.replace(/\s*\n\s*/g, ', ')}</div>
            ) : null}
          </div>
          <div className="px-3 py-1.5 text-[#4A5D78]">
            <div>
              Place: <span className="font-medium text-[#0F2744]">{placeOfSupply || 'Kerala'}</span>
              {isInvoice ? (
                <span>
                  {' '}
                  · {supplyType || 'Business to Customer'}
                  {paymentMode ? ` · ${paymentMode}` : ''}
                </span>
              ) : null}
            </div>
            {invoiceType || poNumber || reverseCharge ? (
              <div>
                {[invoiceType, poNumber ? `PO ${poNumber}` : '', reverseCharge ? 'Reverse charge' : '']
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            ) : null}
            {shippingAddress ? <div>Ship to: {shippingAddress.replace(/\s*\n\s*/g, ', ')}</div> : null}
          </div>
        </div>

        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            <tr className="bg-[#EEF2F7] text-left text-[9.5px] font-semibold uppercase tracking-wide text-[#4A5D78]">
              <th className="border-b border-[#C9D4E2] px-1.5 py-1 w-6">#</th>
              <th className="border-b border-[#C9D4E2] px-1.5 py-1">Item</th>
              <th className="border-b border-[#C9D4E2] px-1.5 py-1 w-12">HSN</th>
              <th className="border-b border-[#C9D4E2] px-1.5 py-1 w-10 text-right">Qty</th>
              <th className="border-b border-[#C9D4E2] px-1.5 py-1 w-[72px] text-right">Rate</th>
              <th className="border-b border-[#C9D4E2] px-1.5 py-1 w-12 text-right">GST</th>
              <th className="border-b border-[#C9D4E2] px-1.5 py-1 w-[78px] text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const parsed = splitProductName(item.productName)
              return (
                <tr key={item.id || `${idx}-${item.productName}`} className="border-b border-[#E2E8F0]">
                  <td className="px-1.5 py-1 align-top text-[#4A5D78]">{idx + 1}</td>
                  <td className="px-1.5 py-1 align-top font-semibold text-[#0F2744]">
                    {parsed.title}
                    {item.discount > 0 ? (
                      <span className="ml-1 font-normal text-[#6B7C93]">−{formatMoney(item.discount)}</span>
                    ) : null}
                  </td>
                  <td className="px-1.5 py-1 align-top text-[#4A5D78]">{item.hsn || '—'}</td>
                  <td className="px-1.5 py-1 align-top text-right tabular-nums">{item.qty}</td>
                  <td className="px-1.5 py-1 align-top text-right tabular-nums">{formatMoney(item.rate)}</td>
                  <td className="px-1.5 py-1 align-top text-right tabular-nums">{item.taxRate}%</td>
                  <td className="px-1.5 py-1 align-top text-right font-medium tabular-nums">{formatMoney(item.amount)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="grid grid-cols-[1.2fr_0.8fr] border-b border-[#C9D4E2]">
          <div className="px-3 py-1.5 text-[10px] leading-snug text-[#4A5D78]">
            <div>
              Items / Qty: {items.length} / {totalQty.toFixed(2)}
            </div>
            <div className="mt-0.5">
              <span>In words: </span>
              <span className="font-semibold text-[#0F2744]">{amountInWords(grandTotal)}</span>
            </div>
            {hasBank ? (
              <div className="mt-1 flex items-start gap-2">
                <div>
                  {[bank?.bankName, bank?.accountName, bank?.accountNumber ? `A/c ${bank.accountNumber}` : '', bank?.ifsc, isUpiId(upiId) ? upiId : '']
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {isUpiId(upiId) ? (
                  <UpiQr upiId={upiId} payeeName={companyName} amount={upiAmount} note={documentNumber} size={52} />
                ) : null}
              </div>
            ) : null}
          </div>
          <table className="w-full border-collapse border-l border-[#C9D4E2]">
            <tbody>
              <TotalRow label="Taxable" value={formatMoney(taxable)} />
              {interState ? (
                <TotalRow label="IGST" value={formatMoney(igst)} />
              ) : (
                <TotalRow label="CGST + SGST" value={formatMoney(cgst + sgst)} />
              )}
              {cess > 0 ? <TotalRow label="Cess" value={formatMoney(cess)} /> : null}
              {otherCharges > 0 ? <TotalRow label="Other" value={formatMoney(otherCharges)} /> : null}
              {discount > 0 ? <TotalRow label="Discount" value={formatMoney(discount)} /> : null}
              <TotalRow label="Total" value={formatMoney(grandTotal)} bold />
              {isInvoice ? <TotalRow label="Balance" value={formatMoney(balanceDue)} /> : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-end justify-between gap-3 px-3 py-1.5">
          <div className="min-w-0 text-[9px] leading-snug text-[#4A5D78]">
            {termLines.slice(0, 3).join(' ')}
            {noteText && noteText !== 'Thank you for your business' ? ` ${noteText}` : ''}
          </div>
          <div className="shrink-0 text-right">
            <div className="mb-4 ml-auto w-28 border-b border-[#0F2744]" />
            <div className="text-[10px] font-bold text-[#0F2744]">Authorized Signatory</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'doc-print mx-auto w-full max-w-[794px] bg-white text-[#0F2744]',
        'border border-[#C9D4E2] print:border print:border-[#C9D4E2]',
        className,
      )}
    >
      <div className="border-b border-[#C9D4E2] px-5 py-3 text-center">
        <h1 className="text-[20px] font-bold tracking-[0.04em] text-[#0B3A7A]">{title}</h1>
      </div>

      {/* Company + meta */}
      <div className="grid grid-cols-2 border-b border-[#C9D4E2]">
        <div className="flex gap-3 border-r border-[#C9D4E2] px-4 py-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-[#E3EAF3] bg-white text-[18px] font-bold text-white">
            {logoPath ? (
              <img src={logoPath} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-[#0B3A7A]">{companyInitial(companyName)}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold leading-tight text-[#0F2744]">{companyName}</div>
            <div className="mt-0.5 text-[11px] font-medium text-[#1A6FD4]">{subtitle}</div>
            {company.address ? (
              <div className="mt-1.5 whitespace-pre-line text-[11px] leading-snug text-[#4A5D78]">
                {String(company.address)}
              </div>
            ) : null}
            <div className="mt-1 space-y-0.5 text-[11px] text-[#4A5D78]">
              {company.mobile ? <div>Phone: {String(company.mobile)}</div> : null}
              {company.email ? <div>Email: {String(company.email)}</div> : null}
              {company.gstin ? <div>GSTIN: {String(company.gstin)}</div> : null}
            </div>
          </div>
        </div>

        <div className="p-0">
          <table className="w-full border-collapse">
            <tbody>
              <MetaRow
                label={isInvoice ? 'Invoice#' : 'Quotation#'}
                value={documentNumber}
              />
              <MetaRow
                label={isInvoice ? 'Invoice Date' : 'Quotation Date'}
                value={formatDate(documentDate)}
              />
              <MetaRow
                label={isInvoice ? 'Due Date' : 'Valid Till'}
                value={formatDate(dueOrValidDate)}
              />
              {isInvoice ? (
                <MetaRow label="Payment Mode" value={paymentMode || '—'} />
              ) : (
                <MetaRow label="Reference" value={paymentMode || '—'} />
              )}
              <MetaRow label="Status" value={status ? String(status) : '—'} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer + supply */}
      <div className="grid grid-cols-2 border-b border-[#C9D4E2]">
        <div className="border-r border-[#C9D4E2]">
          <div className="bg-[#E8EEF6] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#0F2744]">
            Customer Details
          </div>
          <div className="space-y-0.5 px-3 py-2.5 text-[11.5px] leading-snug">
            <div className="font-bold text-[#0F2744]">{customer.name || '—'}</div>
            {customer.address ? (
              <div className="whitespace-pre-line text-[#4A5D78]">{customer.address}</div>
            ) : null}
            {customer.phone ? <div className="text-[#4A5D78]">Phone: {customer.phone}</div> : null}
            {customer.gstin ? <div className="text-[#4A5D78]">GSTIN: {customer.gstin}</div> : null}
            {shippingAddress ? (
              <div className="whitespace-pre-line text-[#4A5D78]">Ship to: {shippingAddress}</div>
            ) : null}
          </div>
        </div>
        <div>
          <div className="bg-[#E8EEF6] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#0F2744]">
            Supply Details
          </div>
          <div className="space-y-1 px-3 py-2.5 text-[11.5px] leading-snug text-[#4A5D78]">
            <div>
              Place of Supply:{' '}
              <span className="font-medium text-[#0F2744]">{placeOfSupply || 'Kerala'}</span>
            </div>
            {isInvoice ? (
              <div>
                Supply Type:{' '}
                <span className="font-medium text-[#0F2744]">
                  {supplyType || 'Business to Customer'}
                </span>
              </div>
            ) : null}
            {invoiceType ? (
              <div>
                Invoice Type: <span className="font-medium text-[#0F2744]">{invoiceType}</span>
              </div>
            ) : null}
            {poNumber ? (
              <div>
                PO Number: <span className="font-medium text-[#0F2744]">{poNumber}</span>
              </div>
            ) : null}
            {reverseCharge ? (
              <div>
                Reverse Charge: <span className="font-medium text-[#0F2744]">Yes</span>
              </div>
            ) : null}
            <div>
              {isInvoice ? 'Payment Due date' : 'Valid Till'}:{' '}
              <span className="font-medium text-[#0F2744]">{formatDate(dueOrValidDate)}</span>
            </div>
            {isInvoice ? (
              <div>
                Balance Due:{' '}
                <span className="font-semibold text-[#0F2744]">{formatMoney(balanceDue)}</span>
              </div>
            ) : (
              <div>
                Status:{' '}
                <span className="font-semibold capitalize text-[#0F2744]">{status || '—'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Items */}
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-[#EEF2F7] text-left text-[10.5px] font-semibold uppercase tracking-wide text-[#4A5D78]">
            <th className="border-b border-[#C9D4E2] px-2 py-2 w-8">#</th>
            <th className="border-b border-[#C9D4E2] px-2 py-2">Item</th>
            <th className="border-b border-[#C9D4E2] px-2 py-2 w-16">HSN</th>
            <th className="border-b border-[#C9D4E2] px-2 py-2 w-[88px] text-right">Rate</th>
            <th className="border-b border-[#C9D4E2] px-2 py-2 w-12 text-right">Qty</th>
            <th className="border-b border-[#C9D4E2] px-2 py-2 w-[88px] text-right">Discount</th>
            <th className="border-b border-[#C9D4E2] px-2 py-2 w-14 text-right">GST</th>
            <th className="border-b border-[#C9D4E2] px-2 py-2 w-[100px] text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => {
            const parsed = splitProductName(item.productName)
            const spec = item.description || parsed.spec
            return (
              <tr key={item.id || `${idx}-${item.productName}`} className="border-b border-[#E2E8F0]">
                <td className="px-2 py-2 align-top text-[#4A5D78]">{idx + 1}</td>
                <td className="px-2 py-2 align-top">
                  <div className="font-semibold text-[#0F2744]">{parsed.title}</div>
                  {spec ? <div className="mt-0.5 text-[10.5px] text-[#6B7C93]">{spec}</div> : null}
                </td>
                <td className="px-2 py-2 align-top text-[#4A5D78]">{item.hsn || '—'}</td>
                <td className="px-2 py-2 align-top text-right tabular-nums">{formatMoney(item.rate)}</td>
                <td className="px-2 py-2 align-top text-right tabular-nums">{item.qty}</td>
                <td className="px-2 py-2 align-top text-right tabular-nums">{formatMoney(item.discount)}</td>
                <td className="px-2 py-2 align-top text-right tabular-nums">{item.taxRate}%</td>
                <td className="px-2 py-2 align-top text-right font-medium tabular-nums">
                  {formatMoney(item.amount)}
                </td>
              </tr>
            )
          })}
          {!items.length ? (
            <tr>
              <td colSpan={8} className="px-2 py-6 text-center text-[#6B7C93]">
                No items
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/* Totals row */}
      <div className="grid grid-cols-2 border-b border-[#C9D4E2]">
        <div className="px-3 py-3 text-[11.5px] text-[#4A5D78]">
          Total Items / Qty: {items.length} / {totalQty.toFixed(2)}
        </div>
        <div className="border-l border-[#C9D4E2]">
          <table className="w-full border-collapse">
            <tbody>
              <TotalRow label="Subtotal" value={formatMoney(subtotal)} />
              <TotalRow label="Discount" value={formatMoney(discount)} />
              <TotalRow label="Taxable Amount" value={formatMoney(taxable)} />
              {interState ? (
                <TotalRow label="IGST" value={formatMoney(igst)} />
              ) : (
                <>
                  <TotalRow label={`CGST(${avgHalf}%)`} value={formatMoney(cgst)} />
                  <TotalRow label={`SGST(${avgHalf}%)`} value={formatMoney(sgst)} />
                </>
              )}
              {cess > 0 ? <TotalRow label="Cess" value={formatMoney(cess)} /> : null}
              {otherCharges > 0 ? <TotalRow label="Other Charges" value={formatMoney(otherCharges)} /> : null}
              <TotalRow label="Total" value={formatMoney(grandTotal)} bold />
              {isInvoice ? (
                <>
                  <TotalRow label="Paid Amount" value={formatMoney(paidAmount)} />
                  <TotalRow label="Balance Due" value={formatMoney(balanceDue)} />
                </>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Amount in words */}
      <div className="border-b border-[#C9D4E2] px-3 py-2 text-[11.5px]">
        <span className="text-[#4A5D78]">Total amount (in words): </span>
        <span className="font-semibold text-[#0F2744]">{amountInWords(grandTotal)}</span>
      </div>

      {/* Bank + notes */}
      <div className="grid grid-cols-2 border-b border-[#C9D4E2]">
        <div className="border-r border-[#C9D4E2] px-3 py-2.5">
          <div className="text-[11px] font-semibold text-[#0F2744]">Bank Details</div>
          {hasBank ? (
            <div className="mt-1 flex items-start gap-3">
              <div className="space-y-0.5 text-[11px] text-[#4A5D78]">
                {bank?.accountName ? <div>Account Name: {bank.accountName}</div> : null}
                {bank?.accountNumber ? <div>Account Number: {bank.accountNumber}</div> : null}
                {bank?.ifsc ? <div>IFSC Code: {bank.ifsc}</div> : null}
                {bank?.bankName ? <div>Bank Name: {bank.bankName}</div> : null}
                {isUpiId(upiId) ? <div>UPI ID: {upiId}</div> : null}
              </div>
              {isUpiId(upiId) ? (
                <div className="ml-auto shrink-0 text-center">
                  <UpiQr upiId={upiId} payeeName={companyName} amount={upiAmount} note={documentNumber} size={88} />
                  <div className="mt-0.5 text-[10px] text-[#4A5D78]">Scan to pay</div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-[#6B7C93]">Add bank details in Settings</div>
          )}
        </div>
        <div className="px-3 py-2.5">
          <div className="text-[11px] font-semibold text-[#0F2744]">Notes</div>
          <div className="mt-1 whitespace-pre-line text-[11px] text-[#4A5D78]">{noteText}</div>
        </div>
      </div>

      {/* Terms + signatory */}
      <div className="grid grid-cols-2">
        <div className="px-3 py-3">
          <div className="text-[11px] font-semibold text-[#0F2744]">Terms and conditions</div>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[10.5px] leading-snug text-[#4A5D78]">
            {termLines.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col items-end justify-end px-4 py-3 text-right">
          <div className="mb-10 w-44 border-b border-[#0F2744]" />
          <div className="text-[12px] font-bold text-[#0F2744]">Authorized Signatory</div>
          <div className="mt-0.5 text-[11px] font-medium text-[#1A6FD4]">{companyName}</div>
        </div>
      </div>
    </div>
  )
}
