export type Sale = {
  id: number
  code: string
  cashier_id: string
  customer_id: number | null
  fulfillment: 'ambil' | 'antar'
  pay_method: string
  pay_status: string
  total: number
  created_at: string
  kasir_name?: string
  customer_name?: string
}

export type SaleItem = {
  id: number
  product_id: number
  unit_id: number
  product_name: string
  unit_name: string
  factor_to_base: number
  qty: number
  unit_price: number
  subtotal: number
}

export type ReturnableItem = {
  sale_item_id: number
  product_id: number
  product_name: string
  unit_name: string
  unit_price: number
  factor_to_base: number
  qty: number
  already_returned: number
  max_qty: number
}

export type Filter    = 'today' | 'week' | 'all'
export type PayFilter = 'all' | 'lunas' | 'belum'
