import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Account directory, plus the product catalog.
 * Invoices, customers, purchases, and other company documents stay on the device.
 */
export default defineSchema({
  companies: defineTable({
    localId: v.string(),
    name: v.string(),
    ownerName: v.string(),
    email: v.string(),
    mobile: v.optional(v.string()),
    address: v.optional(v.string()),
    gstin: v.optional(v.string()),
    businessType: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index('by_localId', ['localId'])
    .index('by_email', ['email']),

  accounts: defineTable({
    localId: v.string(),
    companyLocalId: v.string(),
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.string(),
    mobile: v.optional(v.string()),
    isActive: v.boolean(),
    directoryIssued: v.optional(v.boolean()),
    resetCodeHash: v.optional(v.string()),
    resetExpiresAt: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    lastLoginAt: v.optional(v.string()),
  })
    .index('by_localId', ['localId'])
    .index('by_email', ['email'])
    .index('by_company', ['companyLocalId']),

  products: defineTable({
    localId: v.string(),
    companyLocalId: v.string(),
    name: v.string(),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    category: v.optional(v.string()),
    /** Business type this product belongs to, so any company can import that category. */
    companyCategory: v.optional(v.string()),
    brand: v.optional(v.string()),
    hsn: v.optional(v.string()),
    /** gst products carry a rate and HSN. non_gst products keep gstRate at 0. */
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
  })
    .index('by_localId', ['localId'])
    .index('by_company', ['companyLocalId'])
    .index('by_company_tax', ['companyLocalId', 'taxType'])
    .index('by_companyCategory', ['companyCategory']),
})
