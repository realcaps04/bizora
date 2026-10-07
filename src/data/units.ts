export const PRODUCT_UNITS = [
  'Pcs',
  'Nos',
  'Kg',
  'g',
  'Quintal',
  'Tonne',
  'Litre',
  'ml',
  'Metre',
  'cm',
  'mm',
  'Feet',
  'Inch',
  'Sq. Metre',
  'Sq. Ft',
  'Dozen',
  'Box',
  'Packet',
  'Bag',
  'Bottle',
  'Pair',
  'Set',
  'Roll',
  'Bundle',
  'Carton',
  'Hour',
]

const UNIT_ALIASES: Record<string, string> = {
  'sq. ft': 'Sq. Ft',
  'sq ft': 'Sq. Ft',
  'sq.ft': 'Sq. Ft',
  sqft: 'Sq. Ft',
  sft: 'Sq. Ft',
  'sq. feet': 'Sq. Ft',
  'sq feet': 'Sq. Ft',
  'square feet': 'Sq. Ft',
  'square foot': 'Sq. Ft',
  'sq. metre': 'Sq. Metre',
  'sq metre': 'Sq. Metre',
  'sq. meter': 'Sq. Metre',
  'sq meter': 'Sq. Metre',
  'sq. m': 'Sq. Metre',
  'sq m': 'Sq. Metre',
  'sq.m': 'Sq. Metre',
  sqm: 'Sq. Metre',
  'square metre': 'Sq. Metre',
  'square meter': 'Sq. Metre',
  feet: 'Feet',
  foot: 'Feet',
  ft: 'Feet',
  metre: 'Metre',
  meter: 'Metre',
  mtr: 'Metre',
  inch: 'Inch',
  inches: 'Inch',
  in: 'Inch',
  cm: 'cm',
  mm: 'mm',
  pcs: 'Pcs',
  nos: 'Nos',
}

/** How many of the family's base units (sq ft or feet) one of this unit contains. */
const MEASURES: Record<string, { family: 'area' | 'length'; perBase: number }> = {
  'Sq. Ft': { family: 'area', perBase: 1 },
  'Sq. Metre': { family: 'area', perBase: 10.76391041671 },
  'Sq. Inch': { family: 'area', perBase: 1 / 144 },
  Feet: { family: 'length', perBase: 1 },
  Metre: { family: 'length', perBase: 3.2808398950131 },
  Inch: { family: 'length', perBase: 1 / 12 },
  cm: { family: 'length', perBase: 0.032808398950131 },
  mm: { family: 'length', perBase: 0.0032808398950131 },
}

const LENGTH_TO_FEET: Record<string, number> = {
  ft: 1,
  feet: 1,
  foot: 1,
  "'": 1,
  '’': 1,
  m: 3.2808398950131,
  mtr: 3.2808398950131,
  metre: 3.2808398950131,
  metres: 3.2808398950131,
  meter: 3.2808398950131,
  meters: 3.2808398950131,
  in: 1 / 12,
  inch: 1 / 12,
  inches: 1 / 12,
  cm: 0.032808398950131,
  mm: 0.0032808398950131,
}

const DIM_UNIT = 'mm|cm|mtr|metres|metre|meters|meter|feet|foot|ft|inches|inch|in|’|\'|m'
const AREA_PATTERN = new RegExp(
  `(\\d+(?:\\.\\d+)?)\\s*(${DIM_UNIT})?\\s*[xX×]\\s*(\\d+(?:\\.\\d+)?)\\s*(${DIM_UNIT})\\b`,
  'i',
)
const LENGTH_PATTERN = /(?:^|[^xX×\d.])(\d+(?:\.\d+)?)\s*(feet|foot|ft|metres|metre|meters|meter)\b/i
const NAMED_AREA_PATTERN =
  /\b(sq\.?\s*(?:ft|feet|foot)|sqft|sft|square\s*(?:feet|foot|ft)|sq\.?\s*(?:metres|metre|meters|meter)|sq\.?\s*m|sqm)\b/i

export function productUnit(unit?: string | null) {
  const value = (unit || '').trim()
  if (!value) return 'Pcs'
  return canonicalUnit(value) || value
}

function canonicalUnit(unit: string) {
  const key = unit.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '')
  return UNIT_ALIASES[key] || ''
}

function roundQty(value: number) {
  return Math.round(value * 10000) / 10000
}

function perRate(total: number, qty: number) {
  if (!(qty > 0)) return total
  return Math.round((total / qty) * 1e6) / 1e6
}

function lengthInFeet(value: number, unit: string | undefined) {
  const key = (unit || 'ft').toLowerCase()
  return value * (LENGTH_TO_FEET[key] ?? 1)
}

interface PieceMeasure {
  unit: string
  size: number
}

/** Size of one catalog piece when the name carries a measurement, such as 9X6Ft. */
function parsePiece(name: string): PieceMeasure | null {
  const area = name.match(AREA_PATTERN)
  if (area) {
    const firstUnit = (area[2] || area[4]).toLowerCase()
    const secondUnit = area[4].toLowerCase()
    const bothMetres = ['m', 'mtr', 'metre', 'metres', 'meter', 'meters'].includes(firstUnit) &&
      ['m', 'mtr', 'metre', 'metres', 'meter', 'meters'].includes(secondUnit)
    if (bothMetres) {
      return { unit: 'Sq. Metre', size: Number(area[1]) * Number(area[3]) }
    }
    const width = lengthInFeet(Number(area[1]), area[2] || area[4])
    const height = lengthInFeet(Number(area[3]), area[4])
    const size = width * height
    return size > 0 ? { unit: 'Sq. Ft', size } : null
  }
  const length = name.match(LENGTH_PATTERN)
  if (!length) return null
  const unit = length[2].toLowerCase()
  const metres = unit.startsWith('m')
  return { unit: metres ? 'Metre' : 'Feet', size: Number(length[1]) }
}

function namedMeasureUnit(name: string) {
  const match = name.match(NAMED_AREA_PATTERN)
  if (!match) return ''
  return /sq\.?\s*m|sqm|metre|meter/i.test(match[1]) && !/ft|feet|foot|sft/i.test(match[1]) ? 'Sq. Metre' : 'Sq. Ft'
}

export interface PricedMeasure {
  unit: string
  qty: number
  rate: number
}

/**
 * Turn a catalog piece price into a measured line.
 * A 9x6 ft sheet keeps the same total, with quantity in square feet and the rate per square foot.
 * Names that are already priced per square foot only change the unit.
 */
export function pricedMeasure(
  name: string,
  catalogUnit: string | null | undefined,
  pieceRate: number,
  pieces = 1,
): PricedMeasure | null {
  const count = pieces > 0 ? pieces : 1
  const catalog = productUnit(catalogUnit)
  const piece = parsePiece(name)
  if (piece && !MEASURES[catalog]) {
    return {
      unit: piece.unit,
      qty: roundQty(count * piece.size),
      rate: perRate(pieceRate, piece.size),
    }
  }
  const unit = MEASURES[catalog] ? catalog : namedMeasureUnit(name)
  if (!unit) return null
  return { unit, qty: roundQty(count), rate: pieceRate }
}

/** Keep qty × rate the same when switching between related units, including back to pieces. */
export function convertLineMeasure(
  name: string,
  qty: number,
  rate: number,
  fromUnit: string,
  toUnit: string,
): { qty: number; rate: number } | null {
  const from = productUnit(fromUnit)
  const to = productUnit(toUnit)
  if (from === to) return { qty, rate }
  const fromMeasure = MEASURES[from]
  const toMeasure = MEASURES[to]
  if (fromMeasure && toMeasure && fromMeasure.family === toMeasure.family) {
    const nextQty = qty * (fromMeasure.perBase / toMeasure.perBase)
    const value = qty * rate
    return { qty: roundQty(nextQty), rate: nextQty > 0 ? perRate(value, nextQty) : rate }
  }
  const piece = parsePiece(name)
  const pieceMeasure = piece ? MEASURES[piece.unit] : undefined
  const fromCount = from === 'Pcs' || from === 'Nos'
  const toCount = to === 'Pcs' || to === 'Nos'
  if (piece && pieceMeasure && fromCount && toMeasure && pieceMeasure.family === toMeasure.family) {
    const sizeInTo = piece.size * (pieceMeasure.perBase / toMeasure.perBase)
    const nextQty = qty * sizeInTo
    return { qty: roundQty(nextQty), rate: sizeInTo > 0 ? perRate(rate, sizeInTo) : rate }
  }
  if (piece && pieceMeasure && toCount && fromMeasure && pieceMeasure.family === fromMeasure.family) {
    const sizeInFrom = piece.size * (pieceMeasure.perBase / fromMeasure.perBase)
    if (!(sizeInFrom > 0)) return null
    return { qty: roundQty(qty / sizeInFrom), rate: Math.round(rate * sizeInFrom * 100) / 100 }
  }
  return null
}

/** Stock stays in pieces when the bill quantity is square feet or another measured unit. */
export function inventoryQty(label: string, qty: number) {
  const match = label.match(/^(.*) \(([^)]+)\)$/)
  const name = (match?.[1] || label).trim()
  const unit = productUnit(match?.[2] || '')
  const piece = parsePiece(name)
  const line = MEASURES[unit]
  const pieceMeasure = piece ? MEASURES[piece.unit] : undefined
  if (!piece || !line || !pieceMeasure || pieceMeasure.family !== line.family) return qty
  const size = piece.size * (pieceMeasure.perBase / line.perBase)
  if (!(size > 0)) return qty
  return Math.round((qty / size) * 10000) / 10000
}
