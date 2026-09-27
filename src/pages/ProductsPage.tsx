import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Pencil, SlidersHorizontal, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui'
import { COMPANY_CATEGORIES } from '@/data/companyCategories'
import { useAppStore } from '@/stores/app'
import { callApi, formatMoney, statusTone } from '@/utils'
import type { Product } from '@/types'

export function ProductsPage() {
  const navigate = useNavigate()
  const { showToast } = useAppStore()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const emptyFilters = {
    search: '',
    category: '',
    companyCategory: '',
    brand: '',
    supplier: '',
    productType: '',
    location: '',
    status: '',
    tax: '',
    stock: '',
    sellingMin: '',
    sellingMax: '',
    purchaseMin: '',
    purchaseMax: '',
  }
  const [filters, setFilters] = useState(emptyFilters)
  const [options, setOptions] = useState({
    categories: [] as string[],
    companyCategories: [] as string[],
    brands: [] as string[],
    suppliers: [] as string[],
    productTypes: [] as string[],
    locations: [] as string[],
  })
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const pageCheck = useRef<HTMLInputElement>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [chooser, setChooser] = useState(params.get('add') === '1' || params.get('new') === '1')
  const [mode, setMode] = useState<'pick' | 'import'>('pick')
  const [category, setCategory] = useState(COMPANY_CATEGORIES[0].id)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (params.get('add') === '1' || params.get('new') === '1') setChooser(true)
  }, [params])

  function closeChooser() {
    setChooser(false)
    setMode('pick')
    if (params.get('add') || params.get('new')) setParams({})
  }

  async function load() {
    setLoading(true)
    try {
      const data = await callApi(() =>
        window.bizora.listProducts({
          ...filters,
          page,
          pageSize: 100,
        }),
      )
      const result = data as {
        rows: Product[]
        total?: number
        categories?: string[]
        companyCategories?: string[]
        brands?: string[]
        suppliers?: string[]
        productTypes?: string[]
        locations?: string[]
      }
      setRows(result.rows)
      setTotal(result.total ?? result.rows.length)
      setOptions({
        categories: result.categories || [],
        companyCategories: result.companyCategories || [],
        brands: result.brands || [],
        suppliers: result.suppliers || [],
        productTypes: result.productTypes || [],
        locations: result.locations || [],
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [filters])

  const pageIds = rows.map((product) => product.id)
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const someOnPage = pageIds.some((id) => selected.has(id))

  useEffect(() => {
    if (pageCheck.current) pageCheck.current.indeterminate = someOnPage && !allOnPage
  }, [someOnPage, allOnPage])

  useEffect(() => {
    void load()
  }, [filters, page])

  const filtering = Object.values(filters).some(Boolean)

  function setFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current)
      if (allOnPage) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }

  async function selectAllMatches() {
    const data = await callApi(() => window.bizora.listProducts({ ...filters, idsOnly: true }))
    const ids = (data as { ids?: string[] }).ids || []
    setSelected(new Set(ids))
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await callApi(() => window.bizora.deleteProduct(pendingDelete.id))
      showToast(`${pendingDelete.name} removed from this company`, 'success')
      setPendingDelete(null)
      void load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to remove product', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function confirmBulkDelete() {
    const ids = [...selected]
    if (!ids.length) return
    setDeleting(true)
    try {
      const result = await callApi(() => window.bizora.deleteProducts(ids))
      const count = (result as { count?: number }).count ?? ids.length
      showToast(`${count} products removed from this company`, 'success')
      setSelected(new Set())
      setBulkOpen(false)
      void load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to remove products', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Inventory and pricing"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal size={15} />
              Filters
              {filtering ? (
                <span className="rounded-full bg-[#0878F9] px-1.5 text-[11px] font-semibold text-white">
                  {Object.values(filters).filter(Boolean).length}
                </span>
              ) : null}
            </Button>
            <Link to="/products/bulk">
              <Button variant="outline">Bulk add</Button>
            </Link>
            <Button onClick={() => setChooser(true)}>Add Product</Button>
          </div>
        }
      />
      <Modal
        open={filtersOpen}
        title="Filters"
        wide
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setFilters(emptyFilters)} disabled={!filtering}>
              Clear all
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Done</Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <FilterField label="Search">
            <Input
              placeholder="Name, code, barcode, HSN…"
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
            />
          </FilterField>
          <FilterField label="Company type">
            <Select value={filters.companyCategory} onChange={(e) => setFilter('companyCategory', e.target.value)}>
              <option value="">All company types</option>
              {options.companyCategories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Category">
            <Select value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
              <option value="">All categories</option>
              {options.categories.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Brand">
            <Select value={filters.brand} onChange={(e) => setFilter('brand', e.target.value)}>
              <option value="">All brands</option>
              {options.brands.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Supplier">
            <Select value={filters.supplier} onChange={(e) => setFilter('supplier', e.target.value)}>
              <option value="">All suppliers</option>
              {options.suppliers.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Product type">
            <Select value={filters.productType} onChange={(e) => setFilter('productType', e.target.value)}>
              <option value="">All types</option>
              {options.productTypes.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Location">
            <Select value={filters.location} onChange={(e) => setFilter('location', e.target.value)}>
              <option value="">All locations</option>
              {options.locations.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Status">
            <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </FilterField>
          <FilterField label="Tax">
            <Select value={filters.tax} onChange={(e) => setFilter('tax', e.target.value)}>
              <option value="">All tax</option>
              <option value="gst">GST</option>
              <option value="non_gst">Non-GST</option>
              <option value="0">0%</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </Select>
          </FilterField>
          <FilterField label="Stock">
            <Select value={filters.stock} onChange={(e) => setFilter('stock', e.target.value)}>
              <option value="">All stock</option>
              <option value="in">In stock</option>
              <option value="out">Out of stock</option>
              <option value="low">Low stock</option>
              <option value="reorder">At reorder level</option>
            </Select>
          </FilterField>
          <FilterField label="Sale price from">
            <Input inputMode="decimal" placeholder="Min" value={filters.sellingMin} onChange={(e) => setFilter('sellingMin', e.target.value)} />
          </FilterField>
          <FilterField label="Sale price to">
            <Input inputMode="decimal" placeholder="Max" value={filters.sellingMax} onChange={(e) => setFilter('sellingMax', e.target.value)} />
          </FilterField>
          <FilterField label="Purchase from">
            <Input inputMode="decimal" placeholder="Min" value={filters.purchaseMin} onChange={(e) => setFilter('purchaseMin', e.target.value)} />
          </FilterField>
          <FilterField label="Purchase to">
            <Input inputMode="decimal" placeholder="Max" value={filters.purchaseMax} onChange={(e) => setFilter('purchaseMax', e.target.value)} />
          </FilterField>
        </div>
      </Modal>
      {selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-[#D8E4F2] bg-[#F7FAFD] px-3 py-2 text-sm">
          <span className="font-medium text-[#031C45]">{selected.size.toLocaleString()} selected</span>
          {allOnPage && selected.size < total ? (
            <button type="button" className="font-medium text-[#0878F9]" onClick={() => void selectAllMatches()}>
              Select all {total.toLocaleString()} matching products
            </button>
          ) : null}
          <button type="button" className="text-ink-muted" onClick={() => setSelected(new Set())}>
            Clear
          </button>
          <Button variant="danger" className="ml-auto" onClick={() => setBulkOpen(true)}>
            Remove from this company
          </Button>
        </div>
      ) : null}
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filtering ? 'No products match these filters' : 'No products yet'}
          description={filtering ? 'Try another category, tax, or search.' : 'Add products to start creating invoices.'}
          action={filtering ? undefined : <Button onClick={() => setChooser(true)}>Add Product</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-ink-muted">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input
                    ref={pageCheck}
                    type="checkbox"
                    className="h-4 w-4 accent-[#0878F9]"
                    checked={allOnPage}
                    onChange={togglePage}
                    aria-label="Select all products on this page"
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium">SKU</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium text-right">Selling Price</th>
                <th className="px-4 py-2.5 font-medium text-right">Stock</th>
                <th className="px-4 py-2.5 font-medium text-right">Tax</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-slate-50/80">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#0878F9]"
                      checked={selected.has(p.id)}
                      onChange={() => toggleRow(p.id)}
                      aria-label={`Select ${p.name}`}
                    />
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    <button type="button" className="text-left hover:text-[#0878F9]" onClick={() => navigate(`/products/${p.id}/edit`)}>
                      {p.name}
                    </button>
                  </td>
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
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        aria-label={`Edit ${p.name}`}
                        title="Edit"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-[#62789A] hover:bg-[#F7FAFD] hover:text-[#0878F9]"
                        onClick={() => navigate(`/products/${p.id}/edit`)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${p.name}`}
                        title="Delete"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-[#62789A] hover:bg-[#FFF1F2] hover:text-[#E11D48]"
                        onClick={() => setPendingDelete(p)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > rows.length ? (
        <div className="mt-3 flex items-center justify-between text-sm text-ink-muted">
          <span>
            Showing {(page - 1) * 100 + 1}–{Math.min(page * 100, total)} of {total.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Previous
            </Button>
            <Button variant="outline" disabled={page * 100 >= total} onClick={() => setPage((current) => current + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Modal
        open={bulkOpen}
        title="Remove selected products"
        onClose={() => {
          if (!deleting) setBulkOpen(false)
        }}
        footer={
          <>
            <Button variant="outline" disabled={deleting} onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleting} onClick={() => void confirmBulkDelete()}>
              {deleting ? 'Removing…' : `Remove ${selected.size.toLocaleString()} from this company`}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-muted">
          These products will be removed from this company only. Other companies can still use them from the shared catalog.
        </p>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        title="Remove product"
        onClose={() => {
          if (!deleting) setPendingDelete(null)
        }}
        footer={
          <>
            <Button variant="outline" disabled={deleting} onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? 'Removing…' : 'Remove from this company'}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-ink-muted">
          {pendingDelete?.name} will be removed from this company only. Other companies can still use it from the shared catalog.
        </p>
      </Modal>

      <Modal
        open={chooser}
        title="Add product"
        onClose={closeChooser}
        footer={
          mode === 'import' ? (
            <>
              <Button variant="outline" onClick={() => setMode('pick')}>
                Back
              </Button>
              <Button
                disabled={importing || !category}
                onClick={() => {
                  setImporting(true)
                  void callApi(() => window.bizora.importStarterCatalog(category))
                    .then((result) => {
                      const count = (result as { count?: number }).count ?? 0
                      const label = COMPANY_CATEGORIES.find((item) => item.id === category)?.name || category
                      showToast(`${count} products imported from ${label}`, 'success')
                      closeChooser()
                      void load()
                    })
                    .catch((err) => showToast(err instanceof Error ? err.message : 'Unable to import products', 'error'))
                    .finally(() => setImporting(false))
                }}
              >
                {importing ? 'Importing…' : 'Import products'}
              </Button>
            </>
          ) : null
        }
      >
        {mode === 'pick' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('import')}
              className="rounded-[12px] border border-[#D8E4F2] bg-[#F7FAFD] p-4 text-left hover:border-[#0878F9]"
            >
              <div className="text-[14px] font-semibold text-[#031C45]">Import by company category</div>
              <p className="mt-1 text-[12px] leading-relaxed text-[#62789A]">
                Choose a company type and copy the matching products into this company.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                closeChooser()
                navigate('/products/new')
              }}
              className="rounded-[12px] border border-[#D8E4F2] bg-white p-4 text-left hover:border-[#0878F9]"
            >
              <div className="text-[14px] font-semibold text-[#031C45]">Enter manually</div>
              <p className="mt-1 text-[12px] leading-relaxed text-[#62789A]">
                Type one product yourself. It is saved for this company and added to the shared catalog.
              </p>
            </button>
          </div>
        ) : (
          <div>
            <p className="text-[13px] leading-relaxed text-[#62789A]">
              Any company can use products saved under this category. Stock starts at zero so you can set your own quantity.
            </p>
            <label className="mb-1 mt-4 block text-[12px] font-medium text-[#62789A]">Company category</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {COMPANY_CATEGORIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Modal>
    </div>
  )
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-ink-muted">
      {label}
      {children}
    </label>
  )
}
