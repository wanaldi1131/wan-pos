'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import type { CartItem, Customer, PayMethod, Product, Unit, PriceOverride } from './_types'
import { rp, resolvePrice } from './_types'
import { ProductPickerPanel } from './_components/ProductPickerPanel'
import { CheckoutOverlay } from './_components/CheckoutOverlay'
import { SuccessOverlay } from './_components/SuccessOverlay'

export default function PosPage({ user }: { user: User }) {
  // Customer
  const [custQuery, setCustQuery]       = useState('')
  const [custResults, setCustResults]   = useState<Customer[]>([])
  const [customer, setCustomer]         = useState<Customer | null>(null)
  const [custOpen, setCustOpen]         = useState(false)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const custRef                         = useRef<HTMLDivElement>(null)

  // Cart
  const [cart, setCart]                 = useState<CartItem[]>([])
  const [fulfillment, setFulfillment]   = useState<'ambil' | 'antar'>('ambil')

  // Checkout
  const [checkingOut, setCheckingOut]   = useState(false)
  const [payMethod, setPayMethod]       = useState<PayMethod>('tunai')
  const [submitting, setSubmitting]     = useState(false)
  const [lastNota, setLastNota]         = useState<string | null>(null)
  const [checkoutErr, setCheckoutErr]   = useState<string | null>(null)

  // Price list untuk warehouse ini
  const [priceOverrides, setPriceOverrides] = useState<Record<number, PriceOverride>>({})

  const tier      = customer?.category ?? 'retail'
  const cartTotal = cart.reduce((s, i) => s + i.subtotal, 0)
  const cartCount = cart.reduce((s, i) => s + i.qty, 0)

  // ── Load price list untuk warehouse aktif ──────────────────

  useEffect(() => {
    const warehouseId = Number(process.env.NEXT_PUBLIC_WAREHOUSE_ID ?? '1')
    const sb = createClient()
    sb.from('warehouses').select('price_list_id').eq('id', warehouseId).single()
      .then(async ({ data: wh }) => {
        if (!wh?.price_list_id) return
        const { data: items } = await sb
          .from('price_list_items')
          .select('product_unit_id, price_retail, price_toko')
          .eq('price_list_id', wh.price_list_id)
        const map: Record<number, PriceOverride> = {}
        for (const item of items ?? []) {
          map[item.product_unit_id] = { price_retail: item.price_retail, price_toko: item.price_toko }
        }
        setPriceOverrides(map)
      })
  }, [])

  // ── Close customer dropdown on outside click ────────────────

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (custRef.current && !custRef.current.contains(e.target as Node)) {
        setCustOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  // ── Search customers ────────────────────────────────────────

  useEffect(() => {
    if (custQuery.length < 2) { setCustResults([]); return }
    const t = setTimeout(async () => {
      const { data, error } = await createClient()
        .from('customers')
        .select('id, name, phone, address, category')
        .ilike('name', `%${custQuery}%`)
        .limit(8)
      if (!error && data) setCustResults(data as Customer[])
    }, 300)
    return () => clearTimeout(t)
  }, [custQuery])

  // ── Re-price cart when tier changes ────────────────────────

  useEffect(() => {
    setCart(prev => prev.map(i => {
      const unit_price = resolvePrice(i.unit, tier, priceOverrides)
      return { ...i, unit_price, subtotal: i.qty * unit_price }
    }))
  }, [tier, priceOverrides])

  // ── Cart helpers ────────────────────────────────────────────

  function addToCart(product: Product, unit: Unit, qty: number) {
    const unit_price = resolvePrice(unit, tier, priceOverrides)
    const key = `${product.id}-${unit.id}`
    setCart(prev => {
      const found = prev.find(i => i.key === key)
      if (found) return prev.map(i => i.key === key
        ? { ...i, qty: i.qty + qty, subtotal: (i.qty + qty) * unit_price }
        : i)
      return [...prev, { key, product, unit, qty, unit_price, subtotal: qty * unit_price }]
    })
  }

  function updateQty(key: string, delta: number) {
    setCart(prev =>
      prev
        .map(i => i.key === key ? { ...i, qty: i.qty + delta, subtotal: (i.qty + delta) * i.unit_price } : i)
        .filter(i => i.qty > 0)
    )
  }

  function setCartQty(key: string, qty: number) {
    if (qty <= 0) return
    setCart(prev => prev.map(i => i.key === key
      ? { ...i, qty, subtotal: qty * i.unit_price }
      : i
    ))
  }

  // ── Confirm sale ────────────────────────────────────────────

  async function confirmSale() {
    if (cart.length === 0) return
    if (fulfillment === 'antar' && !customer) {
      setCheckoutErr('Pilih pelanggan dulu untuk pengiriman.')
      return
    }
    setCheckoutErr(null)
    setSubmitting(true)

    const { data, error } = await createClient().rpc('checkout_sale', {
      p_cashier_id:       user.id,
      p_customer_id:      customer?.id ?? null,
      p_warehouse_id:     1,
      p_fulfillment:      fulfillment,
      p_pay_method:       payMethod,
      p_items:            cart.map(i => ({ unit_id: i.unit.id, qty: i.qty })),
      p_delivery_address: fulfillment === 'antar' ? (deliveryAddress.trim() || null) : null,
    })

    if (error || !data) {
      setCheckoutErr('Gagal menyimpan transaksi. Coba lagi.')
      setSubmitting(false)
      return
    }

    setLastNota((data as { code: string }).code)
    setCart([])
    setCustomer(null)
    setCustQuery('')
    setDeliveryAddress('')
    setFulfillment('ambil')
    setPayMethod('tunai')
    setCheckingOut(false)
    setSubmitting(false)
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex-1 min-h-0 bg-gray-50 flex flex-col overflow-hidden select-none">

      <div className="flex flex-1 overflow-hidden">

        {/* LEFT — Product panel */}
        <ProductPickerPanel tier={tier} priceOverrides={priceOverrides} onAddToCart={addToCart} />

        {/* RIGHT — Cart panel */}
        <div className="w-80 lg:w-96 flex flex-col overflow-hidden shrink-0 bg-gray-50">

          {/* Customer picker */}
          <div ref={custRef} className="p-3 border-b border-gray-200 shrink-0 relative">
            <input
              className="w-full bg-gray-100 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 border border-gray-200"
              placeholder="Cari pelanggan (opsional)..."
              value={custQuery}
              onChange={e => { setCustQuery(e.target.value); setCustOpen(true) }}
              onFocus={() => setCustOpen(true)}
            />
            {customer && (
              <div className="mt-2 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-gray-900 text-base font-medium">{customer.name}</span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md ${
                    customer.category === 'toko'
                      ? 'bg-amber-500/20 text-amber-600'
                      : 'bg-blue-500/20 text-blue-400'
                  }`}>{customer.category}</span>
                </div>
                <button
                  onClick={() => { setCustomer(null); setCustQuery(''); setDeliveryAddress('') }}
                  className="text-gray-500 hover:text-red-600 text-sm"
                >
                  ✕
                </button>
              </div>
            )}
            {custOpen && custResults.length > 0 && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-md z-10 overflow-hidden">
                {custResults.map(c => (
                  <button
                    key={c.id}
                    className="w-full text-left px-4 py-3 hover:bg-gray-100 border-b border-gray-100 last:border-0"
                    onClick={() => { setCustomer(c); setCustQuery(c.name); setCustOpen(false); setDeliveryAddress(c.address ?? '') }}
                  >
                    <span className="text-gray-900 text-base font-medium">{c.name}</span>
                    {c.phone && <span className="text-gray-500 text-sm ml-2">{c.phone}</span>}
                    <span className={`ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-md ${
                      c.category === 'toko'
                        ? 'bg-amber-500/20 text-amber-600'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>{c.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-gray-500 text-center text-base whitespace-pre-line">{'Keranjang kosong\nTap produk untuk tambah'}</p>
              </div>
            ) : (
              <ul className="p-3 space-y-2">
                {cart.map(item => (
                  <li key={item.key} className="bg-white rounded-2xl p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-gray-900 text-base font-medium leading-tight flex-1">{item.product.name}</p>
                      <button
                        onClick={() => updateQty(item.key, -item.qty)}
                        className="text-gray-500 hover:text-red-600 text-base leading-none shrink-0"
                      >✕</button>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQty(item.key, -1)}
                          className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold text-lg flex items-center justify-center leading-none"
                        >−</button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0.01}
                          step="any"
                          value={item.qty}
                          onChange={e => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v) && v > 0) setCartQty(item.key, v)
                          }}
                          onFocus={e => e.target.select()}
                          className="w-12 text-gray-900 text-base font-semibold text-center bg-gray-100 border border-gray-300 focus:border-orange-500 rounded-lg h-8 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => updateQty(item.key, 1)}
                          className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 font-bold text-lg flex items-center justify-center leading-none"
                        >+</button>
                        <span className="text-gray-500 text-sm">{item.unit.unit_name}</span>
                      </div>
                      <span className="text-orange-600 text-base font-bold">{rp(item.subtotal)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer: fulfillment + total + bayar */}
          <div className="p-3 border-t border-gray-200 space-y-3 shrink-0">
            <div className="flex gap-2">
              {(['ambil', 'antar'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFulfillment(f)}
                  className={`flex-1 py-2.5 rounded-xl text-base font-semibold transition-colors ${
                    fulfillment === f
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {f === 'ambil' ? '🏪 Ambil' : '🚚 Antar'}
                </button>
              ))}
            </div>

            {fulfillment === 'antar' && (
              <textarea
                value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
                placeholder="Alamat pengiriman…"
                rows={2}
                className="w-full bg-gray-100 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 resize-none"
              />
            )}

            <div className="flex items-center justify-between px-1">
              <div>
                <span className="text-gray-500 text-sm">{cartCount} item</span>
                <span className="text-gray-500 mx-2">·</span>
                <span className="text-gray-500 text-sm uppercase">{tier}</span>
              </div>
              <span className="text-gray-900 text-2xl font-bold">{rp(cartTotal)}</span>
            </div>

            <Button
              disabled={cart.length === 0}
              onClick={() => { setCheckingOut(true); setCheckoutErr(null) }}
              className="w-full h-14 text-lg font-bold rounded-2xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:opacity-25 border-0 text-white"
            >
              BAYAR →
            </Button>
          </div>
        </div>
      </div>

      {/* Overlays */}
      {checkingOut && (
        <CheckoutOverlay
          cartTotal={cartTotal}
          payMethod={payMethod}
          onPayMethodChange={setPayMethod}
          submitting={submitting}
          checkoutErr={checkoutErr}
          onClose={() => !submitting && setCheckingOut(false)}
          onConfirm={confirmSale}
        />
      )}

      {lastNota && (
        <SuccessOverlay
          lastNota={lastNota}
          onClose={() => setLastNota(null)}
        />
      )}
    </div>
  )
}
