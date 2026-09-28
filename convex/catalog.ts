import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

function assertSecret(secret: string) {
  const expected = process.env.ACCOUNT_SYNC_SECRET
  if (!expected || secret !== expected) {
    throw new Error('Unauthorized account sync')
  }
}

const categoryDoc = {
  key: v.string(),
  name: v.string(),
  description: v.string(),
  productCount: v.number(),
}

const itemDoc = {
  itemKey: v.string(),
  catalogKey: v.string(),
  name: v.string(),
  sku: v.string(),
  barcode: v.optional(v.string()),
  category: v.optional(v.string()),
  hsn: v.optional(v.string()),
  taxType: v.union(v.literal('gst'), v.literal('non_gst')),
  gstRate: v.number(),
  purchaseRate: v.number(),
  sellingRate: v.number(),
  openingStock: v.number(),
}

/** Save business categories. Existing keys are updated. */
export const upsertCategories = mutationGeneric({
  args: {
    secret: v.string(),
    categories: v.array(v.object(categoryDoc)),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    for (const category of args.categories) {
      const existing = await ctx.db
        .query('catalogCategories')
        .withIndex('by_key', (q) => q.eq('key', category.key))
        .unique()
      if (existing) await ctx.db.patch(existing._id, category)
      else await ctx.db.insert('catalogCategories', category)
    }
    return args.categories.length
  },
})

/** Insert shared catalog products. Caller removes the old rows for a category first. */
export const insertItems = mutationGeneric({
  args: {
    secret: v.string(),
    items: v.array(v.object(itemDoc)),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    for (const item of args.items) {
      await ctx.db.insert('catalogItems', item)
    }
    return args.items.length
  },
})

/** Delete one page of a category so a catalog can be loaded again without duplicates. */
export const deleteItems = mutationGeneric({
  args: {
    secret: v.string(),
    catalogKey: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const limit = Math.min(200, Math.max(1, args.limit ?? 100))
    const rows = await ctx.db
      .query('catalogItems')
      .withIndex('by_catalog', (q) => q.eq('catalogKey', args.catalogKey))
      .take(limit)
    for (const row of rows) await ctx.db.delete(row._id)
    return rows.length
  },
})

/** Categories any install can download. */
export const listCategories = queryGeneric({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const rows = await ctx.db.query('catalogCategories').collect()
    return rows
      .map((row) => ({
        key: row.key,
        name: row.name,
        description: row.description,
        productCount: row.productCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },
})

/** One page of shared products for a category. The local app copies these into its own database. */
export const listItems = queryGeneric({
  args: {
    secret: v.string(),
    catalogKey: v.string(),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const page = await ctx.db
      .query('catalogItems')
      .withIndex('by_catalog', (q) => q.eq('catalogKey', args.catalogKey))
      .paginate({
        numItems: Math.min(400, Math.max(1, args.limit ?? 200)),
        cursor: args.cursor ?? null,
      })
    return {
      items: page.page.map((row) => ({
        name: row.name,
        sku: row.sku,
        barcode: row.barcode || '',
        category: row.category || '',
        hsn: row.hsn || '',
        taxType: row.taxType,
        gstRate: row.gstRate,
        purchaseRate: row.purchaseRate,
        sellingRate: row.sellingRate,
        openingStock: row.openingStock,
      })),
      cursor: page.isDone ? '' : page.continueCursor,
      isDone: page.isDone,
    }
  },
})
