import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Plus, Trash2, Upload } from 'lucide-react'
import { COMPANY_CATEGORIES } from '@/data/companyCategories'
import { useAppStore } from '@/stores/app'
import { callApi } from '@/utils'

type TaxType = 'gst' | 'non_gst'

interface BulkRow {
  key: string
  name: string
  sku: string
  taxType: TaxType
  gstRate: string
  purchaseRate: string
  sellingRate: string
  openingStock: string
  category: string
  hsn: string
  barcode: string
}

const GST_RATES = ['0', '5', '12', '18', '28']

function emptyRow(): BulkRow {
  return {
    key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: '',
    sku: '',
    taxType: 'gst',
    gstRate: '18',
    purchaseRate: '',
    sellingRate: '',
    openingStock: '0',
    category: '',
    hsn: '',
    barcode: '',
  }
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function rowsFromCsv(text: string): BulkRow[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (!lines.length) return []
  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'))
  const index = (names: string[]) => headers.findIndex((header) => names.includes(header))
  const nameAt = index(['name', 'product', 'product_name'])
  if (nameAt < 0) return []
  const at = (names: string[]) => index(names)
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line)
    const pick = (names: string[]) => {
      const position = at(names)
      return position >= 0 ? cells[position] || '' : ''
    }
    const taxRaw = pick(['tax_type', 'taxtype', 'gst_type']).toLowerCase()
    const rate = pick(['gst_rate', 'gst', 'tax_rate', 'tax'])
    const taxType: TaxType = taxRaw.includes('non') || rate === '0' ? 'non_gst' : 'gst'
    return {
      ...emptyRow(),
      name: pick(['name', 'product', 'product_name']),
      sku: pick(['sku', 'code', 'product_code']),
      taxType,
      gstRate: taxType === 'non_gst' ? '0' : rate || '18',
      purchaseRate: pick(['purchase_rate', 'purchase', 'cost']),
      sellingRate: pick(['selling_rate', 'sale_rate', 'sale', 'price']),
      openingStock: pick(['opening_stock', 'stock', 'qty']) || '0',
      category: pick(['category']),
      hsn: pick(['hsn', 'hsn_code']),
      barcode: pick(['barcode']),
    }
  }).filter((row) => row.name)
}

const SAMPLE = `name,sku,tax_type,gst_rate,purchase_rate,selling_rate,opening_stock,category,hsn,barcode
Cement bag,PD-001,gst,18,320,380,50,Building,2523,8901001
Notebook,PD-002,non_gst,0,20,35,100,Stationery,,8901002
`

const cell =
  'h-9 w-full rounded-md border border-[#D8E4F2] bg-white px-2 text-[12px] text-[#031C45] outline-none focus:border-[#0878F9]'

interface StarterCatalog {
  id: string
  name: string
  description: string
  ready: boolean
  productCount: number | null
}

export function BulkProductsPage() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const { showToast } = useAppStore()
  const [view, setView] = useState<'catalogs' | 'manual'>('catalogs')
  const [catalogs, setCatalogs] = useState<StarterCatalog[]>([])
  const [businessType, setBusinessType] = useState('')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [selected, setSelected] = useState<StarterCatalog | null>(null)
  const [preview, setPreview] = useState<Array<{ name: string; sku: string; category: string; purchaseRate: number; sellingRate: number; taxRate: number }>>([])
  const [previewTotal, setPreviewTotal] = useState(0)
  const [previewPage, setPreviewPage] = useState(1)
  const [previewSearch, setPreviewSearch] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)
  const [rows, setRows] = useState<BulkRow[]>(() => [emptyRow(), emptyRow(), emptyRow()])
  const [companyCategory, setCompanyCategory] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void Promise.all([
      callApi(() => window.bizora.listStarterCatalogs()),
      callApi(() => window.bizora.getCompany()).catch(() => null),
    ]).then(([data, company]) => {
      const list = (data as StarterCatalog[]) || []
      const type = String((company as { business_type?: string } | null)?.business_type || '')
      setCatalogs(list)
      setBusinessType(type)
      const match = list.find((catalog) => catalog.ready && catalog.name === type)
      if (match) setSelected(match)
    }).catch(() => setCatalogs([]))
  }, [])

  useEffect(() => {
    if (!selected) return
    setPreviewLoading(true)
    void callApi(() => window.bizora.previewStarterCatalog(selected.id, { search: previewSearch, page: previewPage, pageSize: 40 }))
      .then((data) => {
        const result = data as { products?: typeof preview; total?: number }
        setPreview(result.products || [])
        setPreviewTotal(result.total ?? 0)
      })
      .catch((err) => showToast(err instanceof Error ? err.message : 'Unable to load products', 'error'))
      .finally(() => setPreviewLoading(false))
  }, [selected, previewPage, previewSearch])

  const visibleCatalogs = catalogs
    .filter((catalog) => {
      const query = catalogQuery.trim().toLowerCase()
      if (!query) return true
      return catalog.name.toLowerCase().includes(query) || catalog.description.toLowerCase().includes(query)
    })
    .sort((a, b) => Number(b.name === businessType) - Number(a.name === businessType))

  async function addCatalog(catalog: StarterCatalog) {
    setImportingId(catalog.id)
    try {
      const result = await callApi(() => window.bizora.importStarterCatalog(catalog.id))
      const count = (result as { count?: number }).count ?? 0
      showToast(`${count} products added from ${catalog.name}`, 'success')
      navigate('/products')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to add products', 'error')
    } finally {
      setImportingId(null)
    }
  }

  function update(key: string, patch: Partial<BulkRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bizora-products.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function onFile(file: File) {
    const text = await file.text()
    const imported = rowsFromCsv(text)
    if (!imported.length) {
      showToast('The file needs a name column and at least one product', 'error')
      return
    }
    setRows(imported)
    showToast(`${imported.length} products ready to save`, 'success')
  }

  async function save() {
    const items = rows
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        sku: row.sku.trim(),
        barcode: row.barcode.trim(),
        category: row.category.trim(),
        companyCategory,
        hsn: row.hsn.trim(),
        taxType: row.taxType,
        taxRate: row.taxType === 'non_gst' ? 0 : Number(row.gstRate) || 0,
        purchaseRate: Number(row.purchaseRate) || 0,
        sellingRate: Number(row.sellingRate) || 0,
        openingStock: Number(row.openingStock) || 0,
        status: 'active',
      }))
    if (!companyCategory) {
      showToast('Choose a company category', 'error')
      return
    }
    if (!items.length) {
      showToast('Enter at least one product name', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await callApi(() => window.bizora.createProducts(items))
      const count = (result as { count?: number }).count ?? items.length
      showToast(`${count} products added for this account`, 'success')
      navigate('/products')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to add products', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="-m-5 flex min-h-[calc(100%+2.5rem)] flex-col bg-[#F4F7FB]">
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[12px] text-[#62789A]">
              <Link to="/products" className="hover:text-[#0878F9]">
                Products
              </Link>
              <ChevronRight size={14} />
              <span className="font-medium text-[#031C45]">Bulk add</span>
            </div>
            <h1 className="text-[22px] font-bold tracking-tight text-[#031C45]">Bulk add products</h1>
            <p className="mt-0.5 max-w-xl text-[13px] text-[#62789A]">
              {selected
                ? `${selected.name} products you can add to this company. Stock starts at zero, and you can change prices later.`
                : view === 'catalogs'
                  ? 'Choose a company type to see its products, then add them to the company you are signed in to.'
                  : 'Products are saved for the company you are signed in to. Add them in the table, or import a CSV. Use GST or Non-GST on each row.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (view === 'manual') setView('catalogs')
                else if (selected) setSelected(null)
                else navigate('/products')
              }}
              className="inline-flex h-9 items-center rounded-[10px] border border-[#D8E4F2] bg-white px-3 text-[13px] font-medium text-[#031C45]"
            >
              {view === 'manual' || selected ? 'Back' : 'Cancel'}
            </button>
            {selected ? (
              <button
                type="button"
                disabled={importingId !== null}
                onClick={() => void addCatalog(selected)}
                className="inline-flex h-9 items-center rounded-[10px] bg-[#0878F9] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {importingId === selected.id ? 'Adding…' : 'Add all to this company'}
              </button>
            ) : view === 'manual' ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="inline-flex h-9 items-center rounded-[10px] bg-[#0878F9] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save products'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setView('manual')}
                className="inline-flex h-9 items-center rounded-[10px] bg-[#0878F9] px-4 text-[13px] font-semibold text-white"
              >
                Enter manually
              </button>
            )}
          </div>
        </div>

        {view === 'catalogs' && selected ? (
          <>
            <input
              className="h-10 max-w-md rounded-[10px] border border-[#D8E4F2] bg-white px-3 text-[13px] text-[#031C45] outline-none focus:border-[#0878F9]"
              placeholder="Search these products…"
              value={previewSearch}
              onChange={(event) => {
                setPreviewSearch(event.target.value)
                setPreviewPage(1)
              }}
            />
            <div className="overflow-auto rounded-[14px] border border-[#D8E4F2] bg-white">
              <table className="w-full min-w-[720px] text-left text-[13px]">
                <thead className="bg-[#F7FAFD] text-[11px] uppercase tracking-wide text-[#62789A]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Purchase</th>
                    <th className="px-3 py-2 text-right font-medium">Sale</th>
                    <th className="px-3 py-2 text-right font-medium">GST</th>
                  </tr>
                </thead>
                <tbody>
                  {previewLoading ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-[#62789A]">
                        Loading products…
                      </td>
                    </tr>
                  ) : preview.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-[#62789A]">
                        No products are saved for this company type yet.
                      </td>
                    </tr>
                  ) : (
                    preview.map((product) => (
                      <tr key={`${product.sku}-${product.name}`} className="border-t border-[#E6EEF6]">
                        <td className="px-3 py-2 font-medium text-[#031C45]">{product.name}</td>
                        <td className="px-3 py-2 text-[#62789A]">{product.sku || '—'}</td>
                        <td className="px-3 py-2 text-[#62789A]">{product.category || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{product.purchaseRate.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{product.sellingRate.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{product.taxRate}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {previewTotal > 40 ? (
              <div className="flex items-center justify-between text-[13px] text-[#62789A]">
                <span>
                  Showing {(previewPage - 1) * 40 + 1}–{Math.min(previewPage * 40, previewTotal)} of {previewTotal.toLocaleString()}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={previewPage <= 1}
                    onClick={() => setPreviewPage((page) => page - 1)}
                    className="inline-flex h-8 items-center rounded-[8px] border border-[#D8E4F2] bg-white px-3 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={previewPage * 40 >= previewTotal}
                    onClick={() => setPreviewPage((page) => page + 1)}
                    className="inline-flex h-8 items-center rounded-[8px] border border-[#D8E4F2] bg-white px-3 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {view === 'catalogs' && !selected ? (
          <>
            <input
              className="h-10 max-w-md rounded-[10px] border border-[#D8E4F2] bg-white px-3 text-[13px] text-[#031C45] outline-none focus:border-[#0878F9]"
              placeholder="Search company types…"
              value={catalogQuery}
              onChange={(event) => setCatalogQuery(event.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {visibleCatalogs.map((catalog) => (
                <div key={catalog.id} className="flex flex-col rounded-[14px] border border-[#D8E4F2] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[14px] font-semibold text-[#031C45]">{catalog.name}</h2>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {catalog.name === businessType ? (
                        <span className="rounded-full bg-[#E8F8EF] px-2 py-0.5 text-[11px] font-medium text-[#159947]">Your business type</span>
                      ) : null}
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          catalog.ready ? 'bg-[#E8F3FF] text-[#0878F9]' : 'bg-[#F4F7FB] text-[#62789A]'
                        }`}
                      >
                        {catalog.productCount ? `${catalog.productCount.toLocaleString()} products` : catalog.ready ? 'Saved products' : 'Coming soon'}
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 flex-1 text-[12px] leading-relaxed text-[#62789A]">{catalog.description}</p>
                  <button
                    type="button"
                    disabled={!catalog.ready}
                    onClick={() => {
                      setPreviewPage(1)
                      setPreviewSearch('')
                      setSelected(catalog)
                    }}
                    className="mt-3 inline-flex h-9 w-fit items-center rounded-[10px] bg-[#0878F9] px-3 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#D8E4F2] disabled:text-[#62789A]"
                  >
                    {catalog.ready ? 'View products' : 'Not available yet'}
                  </button>
                </div>
              ))}
            </div>
            {visibleCatalogs.length === 0 ? (
              <p className="text-[13px] text-[#62789A]">No company type matches that search.</p>
            ) : null}
          </>
        ) : null}

        {view === 'manual' ? (
          <>

        <div className="max-w-md">
          <label className="mb-1.5 block text-[12px] font-medium text-[#62789A]">
            Company category<span className="text-[#E11D48]"> *</span>
          </label>
          <select
            className="h-10 w-full rounded-[10px] border border-[#D8E4F2] bg-white px-3 text-[13px] text-[#031C45] outline-none focus:border-[#0878F9]"
            value={companyCategory}
            onChange={(event) => setCompanyCategory(event.target.value)}
          >
            <option value="">Select company category</option>
            {COMPANY_CATEGORIES.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-[#62789A]">
            A new company that registers with this type can add these products.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#D8E4F2] bg-white px-3 text-[13px] font-medium text-[#031C45]"
          >
            <Upload size={15} />
            Import CSV
          </button>
          <button type="button" onClick={downloadSample} className="text-[13px] font-medium text-[#0878F9] hover:underline">
            Download sample file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void onFile(file)
              event.target.value = ''
            }}
          />
        </div>

        <div className="overflow-auto rounded-[14px] border border-[#D8E4F2] bg-white">
          <table className="w-full min-w-[980px] text-left">
            <thead className="bg-[#F7FAFD] text-[11px] uppercase tracking-wide text-[#62789A]">
              <tr>
                <th className="px-3 py-2 font-medium">Product name</th>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Tax</th>
                <th className="px-3 py-2 font-medium">GST %</th>
                <th className="px-3 py-2 font-medium">Purchase</th>
                <th className="px-3 py-2 font-medium">Sale</th>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Category</th>
                <th className="px-3 py-2 font-medium">HSN</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-[#E6EEF6]">
                  <td className="px-2 py-1.5">
                    <input className={cell} placeholder="Name" value={row.name} onChange={(e) => update(row.key, { name: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={cell} placeholder="PD-001" value={row.sku} onChange={(e) => update(row.key, { sku: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      className={cell}
                      value={row.taxType}
                      onChange={(e) =>
                        update(row.key, {
                          taxType: e.target.value as TaxType,
                          gstRate: e.target.value === 'non_gst' ? '0' : row.gstRate === '0' ? '18' : row.gstRate,
                        })
                      }
                    >
                      <option value="gst">GST</option>
                      <option value="non_gst">Non-GST</option>
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      className={cell}
                      disabled={row.taxType === 'non_gst'}
                      value={row.taxType === 'non_gst' ? '0' : row.gstRate}
                      onChange={(e) => update(row.key, { gstRate: e.target.value })}
                    >
                      {GST_RATES.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate}%
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={cell} inputMode="decimal" placeholder="0" value={row.purchaseRate} onChange={(e) => update(row.key, { purchaseRate: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={cell} inputMode="decimal" placeholder="0" value={row.sellingRate} onChange={(e) => update(row.key, { sellingRate: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={cell} inputMode="decimal" value={row.openingStock} onChange={(e) => update(row.key, { openingStock: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={cell} placeholder="Category" value={row.category} onChange={(e) => update(row.key, { category: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className={cell} placeholder="HSN" value={row.hsn} onChange={(e) => update(row.key, { hsn: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      aria-label="Remove row"
                      className="flex h-9 w-9 items-center justify-center rounded-md text-[#62789A] hover:bg-[#F7FAFD] hover:text-[#E11D48]"
                      onClick={() => setRows((current) => (current.length === 1 ? [emptyRow()] : current.filter((item) => item.key !== row.key)))}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() => setRows((current) => [...current, emptyRow()])}
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-[#0878F9]"
        >
          <Plus size={15} />
          Add row
        </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
