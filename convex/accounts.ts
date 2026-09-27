import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

function assertSecret(secret: string) {
  const expected = process.env.ACCOUNT_SYNC_SECRET
  if (!expected || secret !== expected) {
    throw new Error('Unauthorized account sync')
  }
}

export const upsertCompany = mutationGeneric({
  args: {
    secret: v.string(),
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
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const existing = await ctx.db
      .query('companies')
      .withIndex('by_localId', (q) => q.eq('localId', args.localId))
      .unique()
    const doc = {
      localId: args.localId,
      name: args.name,
      ownerName: args.ownerName,
      email: args.email,
      mobile: args.mobile,
      address: args.address,
      gstin: args.gstin,
      businessType: args.businessType,
      createdAt: existing?.createdAt || args.createdAt,
      updatedAt: args.updatedAt,
    }
    if (existing) {
      await ctx.db.patch(existing._id, doc)
      return existing._id
    }
    return await ctx.db.insert('companies', doc)
  },
})

export const upsertAccount = mutationGeneric({
  args: {
    secret: v.string(),
    localId: v.string(),
    companyLocalId: v.string(),
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.string(),
    mobile: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
    lastLoginAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const email = args.email.trim().toLowerCase()
    const byEmail = await ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (byEmail && byEmail.localId !== args.localId) {
      if (byEmail.directoryIssued === true) {
        throw new Error('An account with this email already exists.')
      }
      await ctx.db.delete(byEmail._id)
    }
    const existing = await ctx.db
      .query('accounts')
      .withIndex('by_localId', (q) => q.eq('localId', args.localId))
      .unique()
    const doc = {
      localId: args.localId,
      companyLocalId: args.companyLocalId,
      name: args.name,
      email,
      passwordHash: args.passwordHash,
      role: args.role,
      mobile: args.mobile,
      isActive: args.isActive,
      directoryIssued: existing?.directoryIssued === true,
      createdAt: existing?.createdAt || args.createdAt,
      updatedAt: args.updatedAt,
      lastLoginAt: args.lastLoginAt ?? existing?.lastLoginAt,
    }
    if (existing) {
      await ctx.db.patch(existing._id, doc)
      return existing._id
    }
    return await ctx.db.insert('accounts', doc)
  },
})

/** Mark an account created by company registration or Add Staff. Sync cannot set this. */
export const issueAccount = mutationGeneric({
  args: {
    secret: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const email = args.email.trim().toLowerCase()
    const row = await ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (!row) throw new Error('Account not found.')
    await ctx.db.patch(row._id, { directoryIssued: true, updatedAt: new Date().toISOString() })
  },
})

export const beginPasswordReset = mutationGeneric({
  args: {
    secret: v.string(),
    email: v.string(),
    codeHash: v.string(),
    expiresAt: v.string(),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const email = args.email.trim().toLowerCase()
    const row = await ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (!row || !row.isActive || row.directoryIssued !== true) {
      throw new Error('No registered account uses this email.')
    }
    await ctx.db.patch(row._id, {
      resetCodeHash: args.codeHash,
      resetExpiresAt: args.expiresAt,
      updatedAt: new Date().toISOString(),
    })
    return { name: row.name }
  },
})

export const clearPasswordReset = mutationGeneric({
  args: {
    secret: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const email = args.email.trim().toLowerCase()
    const row = await ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (!row) return
    await ctx.db.patch(row._id, {
      resetCodeHash: '',
      resetExpiresAt: '',
      updatedAt: new Date().toISOString(),
    })
  },
})

export const completePasswordReset = mutationGeneric({
  args: {
    secret: v.string(),
    email: v.string(),
    codeHash: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const email = args.email.trim().toLowerCase()
    const row = await ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (!row || !row.isActive || row.directoryIssued !== true || !row.resetCodeHash || !row.resetExpiresAt) {
      throw new Error('This reset code is not valid.')
    }
    if (row.resetExpiresAt < new Date().toISOString() || row.resetCodeHash !== args.codeHash) {
      throw new Error('This reset code is not valid.')
    }
    if (!args.passwordHash.startsWith('$argon2')) {
      throw new Error('Password could not be saved.')
    }
    await ctx.db.patch(row._id, {
      passwordHash: args.passwordHash,
      resetCodeHash: '',
      resetExpiresAt: '',
      updatedAt: new Date().toISOString(),
    })
  },
})

/** Stamp last sign-in. Does not create an account. */
export const recordLogin = mutationGeneric({
  args: {
    secret: v.string(),
    email: v.string(),
    at: v.string(),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const email = args.email.trim().toLowerCase()
    const row = await ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (!row || !row.isActive || row.directoryIssued !== true) throw new Error('Account not found.')
    await ctx.db.patch(row._id, { lastLoginAt: args.at, updatedAt: args.at })
  },
})

/** Login lookup. Returns the stored password hash so the desktop app can verify it. */
export const findByEmail = queryGeneric({
  args: {
    secret: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const email = args.email.trim().toLowerCase()
    const row = await ctx.db
      .query('accounts')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (!row) return null
    return {
      localId: row.localId,
      companyLocalId: row.companyLocalId,
      name: row.name,
      email: row.email,
      passwordHash: row.passwordHash,
      role: row.role,
      isActive: row.isActive,
      directoryIssued: row.directoryIssued === true,
    }
  },
})
