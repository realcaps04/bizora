/** Same registrations stored in the Convex `gstBusinesses` table. Shown even when that call cannot run. */
export interface GstBusinessRecord {
  name: string
  gstin: string
  registrationType: string
  address: string
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
      } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else current += char
  }
  cells.push(current.trim())
  return cells
}

/** CSV columns: name (required), gstin (required), registration_type, address. */
export function parseGstBusinessCsv(text: string): GstBusinessRecord[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/\s+/g, '_'))
  const at = (names: string[]) => headers.findIndex((header) => names.includes(header))
  if (at(['name', 'business', 'business_name']) < 0) return []
  const rows: GstBusinessRecord[] = []
  const seen = new Set<string>()
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line)
    const pick = (names: string[]) => {
      const position = at(names)
      return position >= 0 ? cells[position] || '' : ''
    }
    const name = pick(['name', 'business', 'business_name']).trim()
    const gstin = pick(['gstin', 'gst_in', 'gst']).trim().toUpperCase()
    if (!name || !gstin || seen.has(gstin)) continue
    seen.add(gstin)
    rows.push({
      name,
      gstin,
      registrationType: pick(['registration_type', 'registration', 'type']).trim() || 'Regular',
      address: pick(['address', 'address_area', 'area']).trim(),
    })
  }
  return rows
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
