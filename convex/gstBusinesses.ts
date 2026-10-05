import { mutationGeneric, queryGeneric } from 'convex/server'
import { v } from 'convex/values'

function assertSecret(secret: string) {
  const expected = process.env.ACCOUNT_SYNC_SECRET
  if (!expected || secret !== expected) {
    throw new Error('Unauthorized account sync')
  }
}

const businessDoc = {
  name: v.string(),
  gstin: v.string(),
  registrationType: v.string(),
  address: v.string(),
}

/** Known GST registrations offered in B2B business-name entry. */
const SEED = [
  {
    name: 'MATHA OIL MILLS AND CATTLE FEEDS, THOPRAMKUDY',
    gstin: '32ACTPT5530H1ZB',
    registrationType: 'Regular',
    address: 'VII-383, Thopramkudy, Kerala – 685609',
  },
  {
    name: 'OLIVE GREEN SPICES',
    gstin: '32CHVPR9352Q1Z4',
    registrationType: 'Regular',
    address: 'Punnamattathil, 7/104B UA, Amala Junction, Thopramkudy, Vathikudy',
  },
  {
    name: 'NEW MATHA OIL MILLS & CATTLE FEEDS',
    gstin: '32APRPT0904L1ZL',
    registrationType: 'Regular',
    address: 'XIV/UA 508, Thopramkudy, Vathikudy, Kerala – 685515',
  },
  {
    name: 'CASTER TRADERS AND MANUFACTURERS PRIVATE LIMITED',
    gstin: '32AAKCC0415C1ZG',
    registrationType: 'Regular',
    address: '7/100, Muthanattu Building, Thopramkudy–Melechinnar Road, Thopramkudy – 685609',
  },
  {
    name: 'KSFE — Thopramkudy branch',
    gstin: '32AABCT3817A1Z0',
    registrationType: 'Regular',
    address: 'Kunnel Building, Rajamudy Road, Thopramkudy P.O., Idukki – 685609',
  },
]

/** Insert or update the shared GST directory. */
export const seed = mutationGeneric({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    for (const business of SEED) {
      const existing = await ctx.db
        .query('gstBusinesses')
        .withIndex('by_gstin', (q) => q.eq('gstin', business.gstin))
        .unique()
      if (existing) await ctx.db.patch(existing._id, business)
      else await ctx.db.insert('gstBusinesses', business)
    }
    return SEED.length
  },
})

/** Replace the directory from an explicit list. Existing GSTINs are updated. */
export const upsert = mutationGeneric({
  args: {
    secret: v.string(),
    businesses: v.array(v.object(businessDoc)),
  },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    for (const business of args.businesses) {
      const gstin = business.gstin.trim().toUpperCase()
      const row = { ...business, gstin }
      const existing = await ctx.db
        .query('gstBusinesses')
        .withIndex('by_gstin', (q) => q.eq('gstin', gstin))
        .unique()
      if (existing) await ctx.db.patch(existing._id, row)
      else await ctx.db.insert('gstBusinesses', row)
    }
    return args.businesses.length
  },
})

/** GST businesses any install can offer in a B2B sale. */
export const list = queryGeneric({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    assertSecret(args.secret)
    const rows = await ctx.db.query('gstBusinesses').collect()
    return rows
      .map((row) => ({
        name: row.name,
        gstin: row.gstin,
        registrationType: row.registrationType,
        address: row.address,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  },
})
