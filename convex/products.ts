import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

function assertSecret(secret: string) {
  const expected = process.env.ACCOUNT_SYNC_SECRET
  if (!expected || secret !== expected) {
    throw new Error('Unauthorized account sync')
  }
}

export const upsert = mutationGeneric({
  args: {
    secret: v.string(),
    localId: v.string(),
    companyLocalId: v.string(),
    name: v.string(),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    category: v.optional(v.string()),
    companyCategory: v.optional(v.string()),
    brand: v.optional(v.string()),
    hsn: v.optional(v.string()),
    taxType: v.union(v.literal('gst'), v.literal('non_gst')),
    gstRate: v.number(),
    purchaseRate: v.number(),
    sellingRate: v.number(),
    mrp: v.number(),
    openingStock: v.number(),
    currentStock: v.number(),
    minStock: v.number(),
    reorderLevel: v.number(),
    location: v.optional(v.string()),
    description: v.optional(v.string()),
    supplier: v.optional(v.string()),
    productType: v.optional(v.string()),
    status: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
    stockOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const existing = await ctx.db
      .query('products')
      .withIndex('by_localId', (q) => q.eq('localId', args.localId))
      .unique()
    if (args.stockOnly) {
      if (!existing) return null
      await ctx.db.patch(existing._id, {
        currentStock: args.currentStock,
        updatedAt: args.updatedAt,
      })
      return existing._id
    }
    const doc = {
      localId: args.localId,
      companyLocalId: args.companyLocalId,
      name: args.name.trim(),
      sku: args.sku,
      barcode: args.barcode,
      category: args.category,
      companyCategory: args.companyCategory,
      brand: args.brand,
      hsn: args.hsn,
      taxType: args.taxType,
      gstRate: args.taxType === 'non_gst' ? 0 : args.gstRate,
      purchaseRate: args.purchaseRate,
      sellingRate: args.sellingRate,
      mrp: args.mrp,
      openingStock: args.openingStock,
      currentStock: args.currentStock,
      minStock: args.minStock,
      reorderLevel: args.reorderLevel,
      location: args.location,
      description: args.description,
      supplier: args.supplier,
      productType: args.productType,
      status: args.status,
      createdAt: existing?.createdAt || args.createdAt,
      updatedAt: args.updatedAt,
    }
    if (existing) {
      await ctx.db.patch(existing._id, doc)
      return existing._id
    }
    return await ctx.db.insert('products', doc)
  },
})

/** Shared catalog. Any company account can read products by business category. */
export const listShared = queryGeneric({
  args: {
    secret: v.string(),
    companyCategory: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const rows = await ctx.db.query('products').collect()
    const categories = new Set<string>()
    for (const row of rows) {
      const label = String(row.companyCategory || row.category || '').trim()
      if (label) categories.add(label)
    }
    const wanted = (args.companyCategory || '').trim().toLowerCase()
    const seen = new Set<string>()
    const products = []
    const ordered = [...rows].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    for (const row of ordered) {
      const label = String(row.companyCategory || row.category || '').trim().toLowerCase()
      if (!wanted || label !== wanted) continue
      const key = `${String(row.name).trim().toLowerCase()}|${String(row.sku || '').trim().toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      products.push({
        name: row.name,
        sku: row.sku || '',
        barcode: row.barcode || '',
        category: row.category || '',
        brand: row.brand || '',
        hsn: row.hsn || '',
        taxType: row.taxType,
        gstRate: row.gstRate,
        purchaseRate: row.purchaseRate,
        sellingRate: row.sellingRate,
        mrp: row.mrp,
        minStock: row.minStock,
        reorderLevel: row.reorderLevel,
        description: row.description || '',
        supplier: row.supplier || '',
        productType: row.productType || '',
      })
    }
    return {
      categories: [...categories].sort((a, b) => a.localeCompare(b)),
      products,
    }
  },
})
