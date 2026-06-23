export type Driver = { id: number; name: string }

export type SuratJalanLine = { sale_item_id: number; base_qty: number }

export type SuratJalanRec = {
  id: number
  code: string
  status: 'dimuat' | 'terkirim'
  plat: string | null
  created_at: string
  driver: { name: string } | null
  surat_jalan_lines: SuratJalanLine[]
}

export type Customer = {
  id: number
  name: string
  phone: string | null
  address: string | null
}

export type SaleAntar = {
  id: number
  code: string
  total: number
  pay_method: string
  pay_status: string
  created_at: string
  delivery_address: string | null
  customer: Customer | null
  surat_jalan: SuratJalanRec[]
  sale_items: { id: number; base_qty: number }[]
}

export type SaleBelumLunas = {
  id: number
  code: string
  total: number
  pay_method: string
  pay_status: string
  fulfillment: string
  created_at: string
  customer: { name: string } | null
}

export type SaleItem = {
  id: number
  qty: number
  base_qty: number
  unit_price: number
  subtotal: number
  product: { name: string } | null
  unit: { unit_name: string } | null
}

export type KasTunaiDay = {
  date: string
  total: number
  count: number
  tunai_count: number
  tunai_total: number
  transfer_count: number
  transfer_total: number
  hutang_count: number
  hutang_total: number
  retur_tunai: number
  retur_transfer: number
}

export type KasTunaiInvoice = {
  id: number
  code: string
  total: number
  pay_method: string
  paid_at: string
  customer_name: string | null
  is_hutang: boolean
  is_retur: boolean
}

export type DailyRevenue = {
  date: string
  txn_count: number
  total: number
  retur: number
  net: number
  tunai: number
  transfer: number
  cod: number
  kredit: number
  tunai_count: number
  transfer_count: number
  cod_count: number
  kredit_count: number
  belum_count: number
}

export type KasirProfile = {
  id: string
  full_name: string
  staff_code: string | null
  email_login: string | null
  active: boolean
  created_at: string
}

export type ProductUnit = {
  id: number
  unit_name: string
  factor_to_base: number
  price: number
  price_toko: number | null
  is_default: boolean
}

export type ProductFull = {
  id: number
  name: string
  base_unit: string
  sku: string | null
  category: string | null
  active: boolean
  product_units: ProductUnit[]
}

export type UnitFormRow = {
  id?: number
  unit_name: string
  factor_to_base: string
  price: string
  price_toko: string
  is_default: boolean
}

export type Category = {
  id: number
  name: string
  product_count: number
}
