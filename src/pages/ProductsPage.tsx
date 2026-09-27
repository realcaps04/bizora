import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { useAppStore } from '@/stores/app'
import { callApi, formatMoney, statusTone } from '@/utils'
import type { Product } from '@/types'

export function ProductsPage() {
  const { showToast } = useAppStore()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [lowStock, setLowStock] = useState(false)
  const [open, setOpen] = useState(params.get('new') === '1')
  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    hsn: '',
    category: '',
    purchaseRate: 0,
    sellingRate: 0,
    taxRate: 18,
    openingStock: 0,
    minStock: 0,
  })

  async function load() {
    setLoading(true)
    try {
      const data = await callApi(() => window.bizora.listProducts({ search, lowStock, pageSize: 100 }))
      setRows((data as { rows: Product[] }).rows)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [search, lowStock])

  async function save() {
    try {
      await callApi(() => window.bizora.createProduct(form))
      showToast('Product added', 'success')
      setOpen(false)
      setParams({})
      await load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to save product', 'error')
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Inventory and pricing"
        actions={<Button onClick={() => setOpen(true)}>Add Product</Button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input className="max-w-sm" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={lowStock} onChange={(e) => setLowStock(e.target.checked)} />
          Low stock only
        </label>
      </div>
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No products yet" description="Add products to start creating invoices." action={<Button onClick={() => setOpen(true)}>Add Product</Button>} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-ink-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium text-right">Selling Price</th>
                <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                <th className="px-4 py-2.5 font-medium text-right">Tax</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-slate-50/80">
                  <td className="px-4 py-2.5 font-medium">{p.name}</td>
                  <td className="px-4 py-2.5">{p.sku || '—'}</td>
                  <td className="px-4 py-2.5">{p.category || '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(p.selling_rate)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className={p.current_stock <= p.min_stock ? 'text-danger font-medium' : ''}>{p.current_stock}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">{p.tax_rate}%</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={statusTone(p.status) as never}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        title="Add Product"
        wide
        onClose={() => {
          setOpen(false)
          setParams({})
        }}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={!form.name.trim()}>
              Save Product
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Product Name" className="sm:col-span-3">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="SKU">
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </Field>
          <Field label="Barcode">
            <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </Field>
          <Field label="HSN">
            <Input value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value })} />
          </Field>
          <Field label="Category">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </Field>
          <Field label="Purchase Rate">
            <Input type="number" value={form.purchaseRate} onChange={(e) => setForm({ ...form, purchaseRate: Number(e.target.value) })} />
          </Field>
          <Field label="Selling Rate">
            <Input type="number" value={form.sellingRate} onChange={(e) => setForm({ ...form, sellingRate: Number(e.target.value) })} />
          </Field>
          <Field label="Tax Rate %">
            <Select value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })}>
              {[0, 5, 12, 18, 28].map((t) => (
                <option key={t} value={t}>
                  {t}%
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Opening Stock">
            <Input type="number" value={form.openingStock} onChange={(e) => setForm({ ...form, openingStock: Number(e.target.value) })} />
          </Field>
          <Field label="Minimum Stock">
            <Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
