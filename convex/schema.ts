import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Account directory only.
 * Invoices, products, customers, purchases, and other company data stay on the device.
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
})
