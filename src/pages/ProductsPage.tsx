import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, EmptyState, Input, PageHeader, Spinner } from '@/components/ui'
import { callApi, formatMoney, statusTone } from '@/utils'
import type { Product } from '@/types'

export function ProductsPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [rows, setRows] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [lowStock, setLowStock] = useState(false)

  useEffect(() => {
    if (params.get('new') === '1') navigate('/products/new', { replace: true })
  }, [params, navigate])

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

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Inventory and pricing"
        actions={
          <Link to="/products/new">
            <Button>Add Product</Button>
          </Link>
        }
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
        <EmptyState
          title="No products yet"
          description="Add products to start creating invoices."
          action={
            <Link to="/products/new">
              <Button>Add Product</Button>
            </Link>
          }
        />
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
    </div>
  )
}
