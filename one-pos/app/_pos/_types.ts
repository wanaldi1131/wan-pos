export type Unit = {
  id: number
  unit_name: string
  factor_to_base: number
  price: number
  price_toko: number | null
  is_default: boolean
}

export type Product = {
  id: number
  sku: string | null
  name: string
  category: string | null
  base_unit: string
  product_units: Unit[]
  section?: 'favorit' | 'terlaris'
}

export type Customer = {
  id: number
  name: string
  phone: string | null
  address: string | null
  category: 'retail' | 'toko'
}

export type CartItem = {
  key: string
  product: Product
  unit: Unit
  qty: number
  unit_price: number
  subtotal: number
}

export type PayMethod = 'tunai' | 'transfer' | 'cod' | 'kredit'

export const PAY_METHODS: { v: PayMethod; label: string }[] = [
  { v: 'tunai',    label: 'Tunai' },
  { v: 'transfer', label: 'Transfer' },
  { v: 'cod',      label: 'COD' },
  { v: 'kredit',   label: 'Kredit' },
]

export const rp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

export function resolvePrice(unit: Unit, tier: 'retail' | 'toko'): number {
  return tier === 'toko' && unit.price_toko != null ? unit.price_toko : unit.price
}
