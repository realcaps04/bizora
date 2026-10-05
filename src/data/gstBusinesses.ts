/** Same registrations stored in the Convex `gstBusinesses` table. Shown even when that call cannot run. */
export interface GstBusinessRecord {
  name: string
  gstin: string
  registrationType: string
  address: string
}

export const GST_BUSINESSES: GstBusinessRecord[] = [
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
    address: '7/100, Muthanattu Building, Thopramkudy–Melechinnar Road, Thopramkudy – 685609',
    registrationType: 'Regular',
  },
  {
    name: 'KSFE — Thopramkudy branch',
    gstin: '32AABCT3817A1Z0',
    registrationType: 'Regular',
    address: 'Kunnel Building, Rajamudy Road, Thopramkudy P.O., Idukki – 685609',
  },
]
