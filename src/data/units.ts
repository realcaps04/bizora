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

export function productUnit(unit?: string | null) {
  const value = (unit || '').trim()
  return value || 'Pcs'
}
