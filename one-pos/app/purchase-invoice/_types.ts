export type UnitOption = { id: number; unit_name: string }

export type ProductHit = {
  id: number
  name: string
  product_units: UnitOption[]
}

export type InvoiceItemRow = {
  rowId: string
  fromGr: boolean
  productId: number | null
  productName: string
  unitId: number | null
  unitName: string
  unitOptions: UnitOption[]
  qtyStr: string
  unitPriceStr: string
  discountStr: string
  discountType: 'percent' | 'amount'
  totalStr: string
  search: string
  hits: ProductHit[]
  dropOpen: boolean
}

export type PiLineItem = {
  id: number
  qty: number
  unit_price: number
  discount_str: string | null
  discount_type: string
  discount_amount: number
  subtotal: number
  total: number
  product: { name: string } | null
  unit: { unit_name: string } | null
}

export type PiRecord = {
  id: number
  code: string
  invoice_date: string
  due_date: string | null
  paid_at: string | null
  note: string | null
  subtotal: number
  discount_amount: number
  total: number
  supplier: { name: string } | null
  gr: { code: string } | null
  purchase_invoice_items: PiLineItem[]
}
