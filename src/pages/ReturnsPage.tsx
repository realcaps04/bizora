import { useEffect, useMemo, useState } from 'react'
import { Store, Truck, Undo2 } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Modal, Spinner } from '@/components/ui'
import { useAppStore } from '@/stores/app'
import { callApi, formatDate, formatMoney } from '@/utils'

type Kind = 'sale' | 'purchase'

interface DocRow {
  id: string
  number: string
  party: string
  date: string
  total: number
  closed: boolean
}

interface SourceItem {
  id: string
  productName: string
  qty: number
  amount: number
  returnedQty: number
  remainingQty: number
}

interface SourceDoc {
  id: string
  number: string
  party: string
  date: string
  items: SourceItem[]
}

interface ReturnRow {
  id: string
  return_number: string
  kind: Kind
  source_id: string
  source_number: string
  party_name: string
  return_date: string
  grand_total: number
  notes?: string | null
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

export function ReturnsPage() {
  const { showToast, user } = useAppStore()
  const [kind, setKind] = useState<Kind>('sale')
  const [search, setSearch] = useState('')
  const [docs, setDocs] = useState<DocRow[]>([])
  const [history, setHistory] = useState<ReturnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<SourceDoc | null>(null)
  const [qty, setQty] = useState<Record<string, string>>({})
  const [returnDate, setReturnDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const canPurchase = Boolean(user?.role === 'owner' || user?.permissions?.includes('purchases.manage'))

  const returnedBySource = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of history) {
      map.set(row.source_id, round2((map.get(row.source_id) || 0) + Number(row.grand_total || 0)))
    }
    return map
  }, [history])

  async function load(nextKind = kind, query = search) {
    setLoading(true)
    try {
      const [listed, recorded] = await Promise.all([
        nextKind === 'sale'
          ? callApi(() => window.bizora.listInvoices({ search: query, pageSize: 100, status: 'confirmed' }))
          : callApi(() => window.bizora.listPurchases({ search: query, pageSize: 100 })),
        callApi(() => window.bizora.listReturns(nextKind)),
      ])
      const invoiceRows = ((listed as { rows?: Record<string, unknown>[] }).rows || []).filter(
        (row) => nextKind === 'purchase' || row.status !== 'cancelled',
      )
      setDocs(
        invoiceRows.map((row) =>
          nextKind === 'sale'
            ? {
                id: String(row.id),
                number: String(row.invoice_number || ''),
                party: String(row.customer_name || 'Customer'),
                date: String(row.invoice_date || ''),
                total: Number(row.grand_total) || 0,
                closed: false,
              }
            : {
                id: String(row.id),
                number: String(row.purchase_number || ''),
                party: String(row.supplier_name || 'Supplier'),
                date: String(row.purchase_date || ''),
                total: Number(row.grand_total) || 0,
                closed: false,
              },
        ),
      )
      setHistory(((recorded as { rows?: ReturnRow[] }).rows || []) as ReturnRow[])
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to load returns', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(kind, '')
    // Reload when the return type changes. Search is applied from the field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  async function openReturn(id: string) {
    try {
      const data = (await callApi(() => window.bizora.getReturnSource(kind, id))) as SourceDoc
      setSource(data)
      setQty({})
      setNotes('')
      setReturnDate(new Date().toISOString().slice(0, 10))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to open this document', 'error')
    }
  }

  function setLineQty(id: string, value: string, max: number) {
    if (value === '') {
      setQty((prev) => ({ ...prev, [id]: '' }))
      return
    }
    const next = Math.min(max, Math.max(0, Number(value) || 0))
    setQty((prev) => ({ ...prev, [id]: String(next) }))
  }

  const returnTotal = source
    ? round2(
        source.items.reduce((sum, item) => {
          const count = Number(qty[item.id]) || 0
          const unit = item.qty > 0 ? item.amount / item.qty : 0
          return sum + unit * count
        }, 0),
      )
    : 0

  async function saveReturn() {
    if (!source) return
    const items = source.items
      .map((item) => ({ sourceItemId: item.id, qty: Number(qty[item.id]) || 0 }))
      .filter((item) => item.qty > 0)
    if (!items.length) {
      showToast('Enter a quantity for at least one product', 'error')
      return
    }
    setSaving(true)
    try {
      await callApi(() =>
        window.bizora.createReturn({
          kind,
          sourceId: source.id,
          returnDate,
          notes,
          items,
        }),
      )
      showToast(kind === 'sale' ? 'Sales return recorded' : 'Purchase return recorded', 'success')
      setSource(null)
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to record this return', 'error')
    } finally {
      setSaving(false)
    }
  }

  const partyLabel = kind === 'sale' ? 'Customer' : 'Supplier'
  const docLabel = kind === 'sale' ? 'Invoice' : 'Purchase'

  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#EAF4FF] text-[#0878F9]">
          <Undo2 size={20} />
        </div>
        <div>
          <h1 className="text-[18px] font-bold tracking-tight text-[#031C45]">Returns</h1>
          <p className="mt-0.5 text-[13px] text-[#62789A]">
            Record products coming back from customers, and products you send back to suppliers.
          </p>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setKind('sale')
            setSearch('')
          }}
          className={`rounded-[12px] border px-4 py-3 text-left shadow-[0_2px_10px_rgba(6,41,92,0.03)] ${
            kind === 'sale' ? 'border-[#0878F9] bg-[#EAF4FF]' : 'border-[#D8E4F2] bg-white'
          }`}
        >
          <div className="flex items-center gap-2 text-[14px] font-semibold text-[#031C45]">
            <Store size={16} /> Sales returns
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#62789A]">
            Products sold from your shop. A return puts them back into stock.
          </p>
        </button>
        <button
          type="button"
          onClick={() => {
            setKind('purchase')
            setSearch('')
          }}
          className={`rounded-[12px] border px-4 py-3 text-left shadow-[0_2px_10px_rgba(6,41,92,0.03)] ${
            kind === 'purchase' ? 'border-[#0878F9] bg-[#EAF4FF]' : 'border-[#D8E4F2] bg-white'
          }`}
        >
          <div className="flex items-center gap-2 text-[14px] font-semibold text-[#031C45]">
            <Truck size={16} /> Purchase returns
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#62789A]">
            Products bought from companies. A return sends them back and reduces stock.
          </p>
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder={kind === 'sale' ? 'Search invoices…' : 'Search purchases…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load(kind, search)
          }}
        />
        <Button variant="outline" onClick={() => void load(kind, search)}>
          Search
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : docs.length === 0 ? (
        <EmptyState
          title={kind === 'sale' ? 'No invoices to return' : 'No purchases to return'}
          description={
            kind === 'sale'
              ? 'Generated sales invoices will appear here.'
              : 'Purchases from companies will appear here.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-[#D8E4F2] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F8FAFC] text-xs text-[#62789A]">
              <tr>
                <th className="px-4 py-2.5 font-medium">{docLabel}</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">{partyLabel}</th>
                <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                <th className="px-4 py-2.5 font-medium text-right">Returned</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const returned = returnedBySource.get(doc.id) || 0
                const done = doc.total > 0 && returned >= doc.total - 0.05
                return (
                  <tr key={doc.id} className="border-t border-[#E8EEF5]">
                    <td className="px-4 py-2.5 font-medium text-[#031C45]">{doc.number}</td>
                    <td className="px-4 py-2.5">{formatDate(doc.date)}</td>
                    <td className="px-4 py-2.5">{doc.party}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(doc.total)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {returned > 0 ? (
                        <Badge tone={done ? 'success' : 'warning'}>{formatMoney(returned)}</Badge>
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={done || (kind === 'purchase' && !canPurchase)}
                        onClick={() => void openReturn(doc.id)}
                      >
                        {done ? 'Returned' : 'Return'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-5">
        <h2 className="mb-2 text-[14px] font-semibold text-[#031C45]">
          {kind === 'sale' ? 'Recorded sales returns' : 'Recorded purchase returns'}
        </h2>
        {history.length === 0 ? (
          <p className="text-[13px] text-[#62789A]">No returns recorded yet.</p>
        ) : (
          <div className="overflow-hidden rounded-[12px] border border-[#D8E4F2] bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F8FAFC] text-xs text-[#62789A]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Return no.</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Against</th>
                  <th className="px-4 py-2.5 font-medium">{partyLabel}</th>
                  <th className="px-4 py-2.5 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-t border-[#E8EEF5]">
                    <td className="px-4 py-2.5 font-medium text-[#031C45]">{row.return_number}</td>
                    <td className="px-4 py-2.5">{formatDate(row.return_date)}</td>
                    <td className="px-4 py-2.5">{row.source_number}</td>
                    <td className="px-4 py-2.5">{row.party_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(row.grand_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={Boolean(source)}
        wide
        title={source ? `Return ${source.number}` : 'Return'}
        onClose={() => {
          if (!saving) setSource(null)
        }}
        footer={
          <>
            <Button variant="outline" disabled={saving} onClick={() => setSource(null)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void saveReturn()}>
              {saving ? 'Saving…' : 'Record return'}
            </Button>
          </>
        }
      >
        {source ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <div className="text-[12px] text-[#62789A]">{partyLabel}</div>
                <div className="text-[13px] font-medium text-[#031C45]">{source.party}</div>
              </div>
              <label className="block">
                <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Return date</span>
                <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </label>
              <label className="block sm:col-span-1">
                <span className="mb-1 block text-[12px] font-medium text-[#62789A]">Note</span>
                <Input value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
            <div className="overflow-hidden rounded-md border border-[#D8E4F2]">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[#F8FAFC] text-[11.5px] text-[#62789A]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium text-right">Sold</th>
                    <th className="px-3 py-2 font-medium text-right">Already returned</th>
                    <th className="px-3 py-2 font-medium text-right">Return qty</th>
                  </tr>
                </thead>
                <tbody>
                  {source.items.map((item) => (
                    <tr key={item.id} className="border-t border-[#E8EEF5]">
                      <td className="px-3 py-2 text-[#031C45]">{item.productName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.returnedQty}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          className="ml-auto w-24"
                          type="number"
                          min={0}
                          max={item.remainingQty}
                          step="any"
                          disabled={item.remainingQty <= 0}
                          value={qty[item.id] ?? ''}
                          placeholder={item.remainingQty > 0 ? String(item.remainingQty) : '0'}
                          onChange={(e) => setLineQty(item.id, e.target.value, item.remainingQty)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <button
                type="button"
                className="font-medium text-[#0878F9]"
                onClick={() => {
                  const next: Record<string, string> = {}
                  for (const item of source.items) {
                    if (item.remainingQty > 0) next[item.id] = String(item.remainingQty)
                  }
                  setQty(next)
                }}
              >
                Return all remaining
              </button>
              <div className="font-semibold text-[#031C45]">Return total {formatMoney(returnTotal)}</div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
