import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Boxes, ChevronRight, FileText, IndianRupee, Package } from 'lucide-react'
import { useAppStore } from '@/stores/app'
import { callApi, cn } from '@/utils'

const GST_RATES = [0, 5, 12, 18, 28]
const CATEGORIES = ['General', 'Raw Material', 'Finished Goods', 'Spare Parts', 'Consumable', 'Service']
const PRODUCT_TYPES = ['Normal', 'Service', 'Raw Material', 'Finished Good']

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function money(n: number) {
  return round2(n).toFixed(2)
}

const fieldClass =
  'h-10 w-full rounded-[10px] border border-[#D8E4F2] bg-white px-3 text-[13px] text-[#031C45] outline-none placeholder:text-[#94A3B8] focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15'

function Label({ children, required }: { children: string; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-[12px] font-medium text-[#62789A]">
      {children}
      {required ? <span className="text-[#E11D48]"> *</span> : null}
    </label>
  )
}

function Section({
  icon,
  iconClass,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  iconClass: string
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className="rounded-[14px] border border-[#D8E4F2] bg-white p-4 shadow-[0_2px_10px_rgba(6,41,92,0.03)]">
      <div className="mb-4 flex items-start gap-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-[10px]', iconClass)}>{icon}</div>
        <div>
          <h2 className="text-[14px] font-semibold text-[#031C45]">{title}</h2>
          <p className="text-[12px] text-[#62789A]">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

export function AddProductPage() {
  const navigate = useNavigate()
  const { showToast } = useAppStore()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    sku: '',
    barcode: '',
    category: '',
    brand: '',
    hsn: '',
    purchaseRate: '0.00',
    sellingRate: '0.00',
    mrp: '0.00',
    taxRate: '',
    openingStock: '0',
    minStock: '',
    reorderLevel: '',
    location: '',
    description: '',
    supplier: '',
    productType: 'Normal',
    active: true,
  })

  const purchase = Number(form.purchaseRate) || 0
  const sale = Number(form.sellingRate) || 0
  const gst = form.taxRate === '' ? 0 : Number(form.taxRate)
  const gstAmount = useMemo(() => round2(sale * (gst / 100)), [sale, gst])
  const totalSale = useMemo(() => round2(sale + gstAmount), [sale, gstAmount])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    if (!form.name.trim() || !form.sku.trim() || !form.category.trim() || form.taxRate === '') {
      showToast('Fill the required product fields', 'error')
      return
    }
    setSaving(true)
    try {
      await callApi(() =>
        window.bizora.createProduct({
          name: form.name.trim(),
          sku: form.sku.trim(),
          barcode: form.barcode.trim(),
          category: form.category.trim(),
          brand: form.brand.trim(),
          hsn: form.hsn.trim(),
          purchaseRate: purchase,
          sellingRate: sale,
          mrp: Number(form.mrp) || 0,
          taxRate: gst,
          openingStock: Number(form.openingStock) || 0,
          minStock: Number(form.minStock) || 0,
          reorderLevel: Number(form.reorderLevel) || 0,
          location: form.location.trim(),
          description: form.description.trim(),
          supplier: form.supplier.trim(),
          productType: form.productType,
          status: form.active ? 'active' : 'inactive',
        }),
      )
      showToast('Product added', 'success')
      navigate('/products')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to save product', 'error')
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
              <span className="font-medium text-[#031C45]">Add Product</span>
            </div>
            <h1 className="text-[22px] font-bold tracking-tight text-[#031C45]">Add Product</h1>
            <p className="mt-0.5 text-[13px] text-[#62789A]">Enter product details to add it to your inventory.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/products')}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#D8E4F2] bg-white px-3 text-[13px] font-medium text-[#031C45] hover:bg-[#F7FAFD]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex h-9 items-center rounded-[10px] bg-[#0878F9] px-4 text-[13px] font-semibold text-white hover:bg-[#0668d6] disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Product'}
            </button>
          </div>
        </div>

        <Section
          icon={<Package size={18} />}
          iconClass="bg-[#EAF4FF] text-[#0878F9]"
          title="Product Details"
          subtitle="Basic information about the product"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label required>Product Name</Label>
              <input className={fieldClass} placeholder="Enter product name" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <Label required>Product Code</Label>
              <input className={fieldClass} placeholder="e.g. PD-001" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
            </div>
            <div>
              <Label>Barcode (Optional)</Label>
              <input className={fieldClass} placeholder="Enter barcode" value={form.barcode} onChange={(e) => set('barcode', e.target.value)} />
            </div>
            <div>
              <Label required>Category</Label>
              <input className={fieldClass} list="product-categories" placeholder="Select category" value={form.category} onChange={(e) => set('category', e.target.value)} />
              <datalist id="product-categories">
                {CATEGORIES.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </div>
            <div>
              <Label>Brand (Optional)</Label>
              <input className={fieldClass} placeholder="Select brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
            </div>
            <div>
              <Label>HSN Code (Optional)</Label>
              <input className={fieldClass} placeholder="Enter HSN code" value={form.hsn} onChange={(e) => set('hsn', e.target.value)} />
            </div>
          </div>
        </Section>

        <Section
          icon={<IndianRupee size={18} />}
          iconClass="bg-[#EAF4FF] text-[#0878F9]"
          title="Pricing Information"
          subtitle="Set the purchase and sale pricing for the product"
        >
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label required>Purchase Rate (₹)</Label>
              <input className={fieldClass} inputMode="decimal" value={form.purchaseRate} onChange={(e) => set('purchaseRate', e.target.value)} />
            </div>
            <div>
              <Label required>Sale Rate (₹)</Label>
              <input className={fieldClass} inputMode="decimal" value={form.sellingRate} onChange={(e) => set('sellingRate', e.target.value)} />
            </div>
            <div>
              <Label>MRP (₹) (Optional)</Label>
              <input className={fieldClass} inputMode="decimal" value={form.mrp} onChange={(e) => set('mrp', e.target.value)} />
            </div>
            <div>
              <Label required>GST (%)</Label>
              <select className={fieldClass} value={form.taxRate} onChange={(e) => set('taxRate', e.target.value)}>
                <option value="">Select GST</option>
                {GST_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 grid gap-3 rounded-[12px] bg-[#F7FAFD] p-4 sm:grid-cols-4">
            <Summary label="Purchase Rate (₹)" value={money(purchase)} />
            <Summary label="Sale Rate (₹)" value={money(sale)} />
            <Summary label="GST Amount (₹)" value={money(gstAmount)} />
            <Summary label="Total Sale Price (₹)" value={money(totalSale)} accent />
          </div>
        </Section>

        <Section
          icon={<Boxes size={18} />}
          iconClass="bg-[#E8F8EF] text-[#159947]"
          title="Stock & Inventory"
          subtitle="Set the stock details and inventory settings"
        >
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label required>Opening Stock</Label>
              <input className={fieldClass} inputMode="decimal" value={form.openingStock} onChange={(e) => set('openingStock', e.target.value)} />
            </div>
            <div>
              <Label>Minimum Stock</Label>
              <input className={fieldClass} inputMode="decimal" placeholder="0" value={form.minStock} onChange={(e) => set('minStock', e.target.value)} />
            </div>
            <div>
              <Label>Reorder Level</Label>
              <input className={fieldClass} inputMode="decimal" placeholder="0" value={form.reorderLevel} onChange={(e) => set('reorderLevel', e.target.value)} />
            </div>
            <div>
              <Label>Location (Optional)</Label>
              <input className={fieldClass} placeholder="e.g. Main Store, Godown" value={form.location} onChange={(e) => set('location', e.target.value)} />
            </div>
          </div>
        </Section>

        <Section
          icon={<FileText size={18} />}
          iconClass="bg-[#EAF4FF] text-[#0878F9]"
          title="Additional Information"
          subtitle="Add any additional details about the product"
        >
          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <Label>Description (Optional)</Label>
                <span className="text-[11px] text-[#94A3B8]">{form.description.length}/500</span>
              </div>
              <textarea
                maxLength={500}
                rows={4}
                placeholder="Enter product description..."
                className="w-full rounded-[10px] border border-[#D8E4F2] bg-white px-3 py-2 text-[13px] text-[#031C45] outline-none placeholder:text-[#94A3B8] focus:border-[#0878F9] focus:ring-2 focus:ring-[#0878F9]/15"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>
            <div className="space-y-4">
              <div>
                <Label>Supplier (Optional)</Label>
                <input className={fieldClass} placeholder="Select supplier" value={form.supplier} onChange={(e) => set('supplier', e.target.value)} />
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Label>Product Type</Label>
                  <select className={fieldClass} value={form.productType} onChange={(e) => set('productType', e.target.value)}>
                    {PRODUCT_TYPES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="pb-1">
                  <Label>Status</Label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.active}
                    onClick={() => set('active', !form.active)}
                    className="flex items-center gap-2"
                  >
                    <span
                      className={cn(
                        'relative h-6 w-11 rounded-full transition-colors',
                        form.active ? 'bg-[#0878F9]' : 'bg-[#D8E4F2]',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                          form.active ? 'left-[22px]' : 'left-0.5',
                        )}
                      />
                    </span>
                    <span className="text-[13px] font-medium text-[#031C45]">{form.active ? 'Active' : 'Inactive'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}

function Summary({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[12px] text-[#62789A]">{label}</div>
      <div className={cn('mt-1 text-[22px] font-bold tabular-nums', accent ? 'text-[#0878F9]' : 'text-[#031C45]')}>{value}</div>
    </div>
  )
}
