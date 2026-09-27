import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, PageHeader, Spinner } from '@/components/ui'
import { DocumentPrint } from '@/components/DocumentPrint'
import { useAppStore } from '@/stores/app'
import { callApi, formatDate } from '@/utils'

export function QuotationDetailPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { showToast } = useAppStore()
  const [data, setData] = useState<{
    quotation: Record<string, unknown>
    items: Record<string, unknown>[]
    company: Record<string, unknown>
    customer?: Record<string, unknown> | null
  } | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})

  useEffect(() => {
    void (async () => {
      try {
        const [d, s] = await Promise.all([
          callApi(() => window.bizora.getQuotation(id)),
          callApi(() => window.bizora.getSettings()).catch(() => ({})),
        ])
        setData(d as never)
        setSettings((s as Record<string, string>) || {})
        if (params.get('print') === '1') setTimeout(() => window.print(), 400)
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Unable to load quotation', 'error')
      }
    })()
  }, [id, params, showToast])

  async function convert() {
    try {
      const result = await callApi(() => window.bizora.convertQuotation(id))
      showToast('Converted to invoice', 'success')
      const invoiceId = (result as { invoice: { id: string } }).invoice.id
      navigate(`/invoices/${invoiceId}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to convert', 'error')
    }
  }

  if (!data) return <Spinner />
  const { quotation, items, company, customer } = data
  const taxAmount = Number(quotation.tax_amount || 0)
  const discount = Number(quotation.discount_amount || 0)
  const subtotal = Number(quotation.subtotal || 0)
  const taxable = Math.max(0, subtotal - discount)
  const cgst = Math.round((taxAmount / 2) * 100) / 100
  const sgst = Math.round((taxAmount / 2) * 100) / 100
  const notesRaw = String(quotation.notes || '')
  const noteOnly = (() => {
    const m = notesRaw.match(/Notes:\s*([\s\S]*?)(?:\n\n|$)/i)
    if (m) return m[1].trim()
    if (notesRaw.includes('Terms & Conditions:')) return ''
    return notesRaw.trim()
  })()
  const termsFromNotes = (() => {
    const m = notesRaw.match(/Terms & Conditions:\s*([\s\S]*?)(?:\n\nInternal remarks:|$)/i)
    if (!m) return undefined
    return m[1]
      .split('\n')
      .map((l) => l.replace(/^\d+\.\s*/, '').trim())
      .filter(Boolean)
  })()

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between">
        <PageHeader
          title={String(quotation.quotation_number)}
          subtitle={formatDate(String(quotation.quotation_date))}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/quotations')}>
            Back
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            Print / PDF
          </Button>
          {quotation.status !== 'converted' ? (
            <Button onClick={() => void convert()}>Convert to Invoice</Button>
          ) : null}
        </div>
      </div>

      <DocumentPrint
        kind="quotation"
        company={company}
        customer={{
          name: String(customer?.name || quotation.customer_name || 'Customer'),
          address: customer?.address ? String(customer.address) : undefined,
          phone: customer?.phone ? String(customer.phone) : undefined,
          gstin: customer?.gstin ? String(customer.gstin) : undefined,
        }}
        documentNumber={String(quotation.quotation_number)}
        documentDate={String(quotation.quotation_date)}
        dueOrValidDate={quotation.valid_until ? String(quotation.valid_until) : null}
        paymentMode={undefined}
        status={String(quotation.status || '')}
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
        subtotal={subtotal}
        discount={discount}
        taxable={taxable}
        cgst={cgst}
        sgst={sgst}
        igst={0}
        grandTotal={Number(quotation.grand_total)}
        notes={noteOnly || 'Thank you for your business'}
        terms={termsFromNotes}
        bank={{
          accountName: settings.bank_account_name,
          accountNumber: settings.bank_account_number,
          ifsc: settings.bank_ifsc,
          bankName: settings.bank_name,
        }}
      />
    </div>
  )
}
