'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { Product, Unit, PriceOverride } from '../_types'
import { rp, resolvePrice } from '../_types'
import { CategoryPill, EmptyState, ProductGrid } from './ProductGrid'

interface Props {
  tier: 'retail' | 'toko'
  priceOverrides: Record<number, PriceOverride>
  onAddToCart: (product: Product, unit: Unit, qty: number) => void
}

export function ProductPickerPanel({ tier, priceOverrides, onAddToCart }: Props) {
  const [query, setQuery]                   = useState('')
  const [activeCategory, setActiveCat]      = useState<string | null>(null)
  const [categories, setCategories]         = useState<string[]>([])
  const [products, setProducts]             = useState<Product[]>([])
  const [loadingProd, setLoadingProd]       = useState(false)
  const [defaultProds, setDefaultProds]     = useState<Product[]>([])
  const [loadingDefault, setLoadingDefault] = useState(false)

  const [picking, setPicking]   = useState<Product | null>(null)
  const [pickUnit, setPickUnit] = useState<Unit | null>(null)
  const [pickQty, setPickQty]   = useState(1)

  // ── Fetch categories once ───────────────────────────────────

  useEffect(() => {
    createClient()
      .from('products')
      .select('category')
      .eq('active', true)
      .not('category', 'is', null)
      .then(({ data }) => {
        const cats = [...new Set((data ?? []).map(r => r.category as string))].sort()
        setCategories(cats)
      })
  }, [])

  // ── Default products ────────────────────────────────────────

  useEffect(() => {
    if (query || activeCategory) return
    setLoadingDefault(true)
    const sb = createClient()
    const fetchDefault = async () => {
      const { data: rows, error } = await sb.rpc('get_default_products', { p_limit: 48 })
      if (error || !rows || rows.length === 0) {
        setDefaultProds([])
        setLoadingDefault(false)
        return
      }
      const { data: units } = await sb
        .from('product_units').select('*')
        .in('product_id', (rows as any[]).map(r => r.id))

      const merged: Product[] = (rows as any[]).map(r => ({
        id: r.id, sku: r.sku, name: r.name,
        category: r.category, base_unit: r.base_unit,
        section: r.section as 'favorit' | 'terlaris',
        product_units: (units ?? [])
          .filter((u: any) => String(u.product_id) === String(r.id))
          .sort((a: any, b: any) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0)),
      }))
      setDefaultProds(merged)
      setLoadingDefault(false)
    }
    fetchDefault()
  }, [query, activeCategory])

  // ── Search products ─────────────────────────────────────────

  useEffect(() => {
    if (!query && !activeCategory) { setProducts([]); return }
    setLoadingProd(true)
    const t = setTimeout(async () => {
      const sb = createClient()

      let q = sb
        .from('products')
        .select('id, sku, name, category, base_unit')
        .eq('active', true)
        .order('name')
        .limit(48)
      if (query.length >= 2) q = q.ilike('name', `%${query}%`)
      if (activeCategory)    q = q.eq('category', activeCategory)

      const { data: prods } = await q
      if (!prods || prods.length === 0) { setProducts([]); setLoadingProd(false); return }

      const { data: units, error: unitsErr } = await sb
        .from('product_units')
        .select('*')
        .in('product_id', prods.map(p => p.id))
      if (unitsErr) console.error('[POS] units error:', unitsErr.message)

      const merged: Product[] = prods.map(p => ({
        ...p,
        product_units: (units ?? [])
          .filter((u: any) => String(u.product_id) === String(p.id))
          .sort((a: any, b: any) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0)),
      }))

      setProducts(merged)
      setLoadingProd(false)
    }, 300)
    return () => clearTimeout(t)
  }, [query, activeCategory])

  function openPicking(product: Product) {
    const def = product.product_units.find(u => u.is_default) ?? product.product_units[0]
    setPicking(product)
    setPickUnit(def ?? null)
    setPickQty(1)
  }

  function handleAddToCart() {
    if (!picking || !pickUnit) return
    onAddToCart(picking, pickUnit, pickQty)
    setPicking(null)
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden border-r border-gray-200">

      {/* Search + category pills */}
      <div className="p-3 space-y-2 shrink-0 bg-white border-b border-gray-200">
        <input
          className="w-full bg-gray-100 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-3 text-base outline-none focus:ring-2 focus:ring-orange-500 border border-gray-200"
          placeholder="Cari nama atau SKU produk..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          <CategoryPill
            label="Semua"
            active={activeCategory === null}
            onClick={() => setActiveCat(null)}
          />
          {categories.map(cat => (
            <CategoryPill
              key={cat}
              label={cat}
              active={activeCategory === cat}
              onClick={() => setActiveCat(prev => prev === cat ? null : cat)}
            />
          ))}
        </div>
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {!query && !activeCategory ? (
          loadingDefault ? (
            <EmptyState text="Memuat..." />
          ) : defaultProds.length === 0 ? (
            <EmptyState text={'Belum ada produk favorit\nTandai produk lewat admin'} />
          ) : (
            <div className="space-y-4">
              {(['favorit', 'terlaris'] as const).map(sec => {
                const list = defaultProds.filter(p => p.section === sec)
                if (list.length === 0) return null
                return (
                  <div key={sec}>
                    <p className="text-gray-500 text-[10px] uppercase tracking-widest mb-2 px-1">
                      {sec === 'favorit' ? '⭐ Favorit' : '🔥 Terlaris'}
                    </p>
                    <ProductGrid products={list} picking={picking} tier={tier} priceOverrides={priceOverrides} onPick={openPicking} />
                  </div>
                )
              })}
            </div>
          )
        ) : loadingProd ? (
          <EmptyState text="Mencari..." />
        ) : products.length === 0 ? (
          <EmptyState text="Produk tidak ditemukan" />
        ) : (
          <ProductGrid products={products} picking={picking} tier={tier} priceOverrides={priceOverrides} onPick={openPicking} />
        )}
      </div>

      {/* Detail panel — slide up saat produk dipilih */}
      {picking && (
        <div className="shrink-0 border-t-2 border-orange-500 bg-white p-4 space-y-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {picking.category && (
                <p className="text-gray-500 text-[10px] uppercase tracking-wide">{picking.category}</p>
              )}
              <p className="text-gray-900 font-bold text-base leading-tight truncate">{picking.name}</p>
              {pickUnit && (
                <p className="text-orange-600 font-bold text-base mt-0.5">
                  {rp(resolvePrice(pickUnit, tier, priceOverrides))}
                  <span className="text-gray-500 font-normal text-sm">/{pickUnit.unit_name}</span>
                </p>
              )}
            </div>
            <button
              onClick={() => setPicking(null)}
              className="text-gray-500 hover:text-gray-900 text-lg leading-none shrink-0 mt-1"
            >✕</button>
          </div>

          {picking.product_units.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {picking.product_units.map(u => (
                <button
                  key={u.id}
                  onClick={() => setPickUnit(u)}
                  className={`px-3 py-2 rounded-xl text-base font-semibold transition-colors ${
                    pickUnit?.id === u.id
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {u.unit_name}
                  <span className="text-sm font-normal ml-1.5 opacity-60">{rp(resolvePrice(u, tier, priceOverrides))}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 pl-10">
            <button
              onClick={() => setPickQty(q => Math.max(1, q - 1))}
              className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 text-2xl font-light flex items-center justify-center shrink-0"
            >−</button>
            <input
              type="number"
              inputMode="decimal"
              min={0.01}
              step="any"
              value={pickQty}
              onChange={e => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && v > 0) setPickQty(v)
              }}
              onFocus={e => e.target.select()}
              className="w-20 text-gray-900 text-2xl font-bold text-center bg-gray-100 border border-gray-300 focus:border-orange-500 rounded-xl h-12 outline-none focus:ring-2 focus:ring-orange-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <button
              onClick={() => setPickQty(q => q + 1)}
              className="w-12 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 text-2xl font-light flex items-center justify-center shrink-0"
            >+</button>
            {pickUnit && (
              <div className="flex-1 text-right">
                <p className="text-gray-500 text-sm">Subtotal</p>
                <p className="text-gray-900 font-bold text-base">{rp(pickQty * resolvePrice(pickUnit, tier, priceOverrides))}</p>
              </div>
            )}
            <Button
              onClick={handleAddToCart}
              disabled={!pickUnit}
              className="h-12 px-5 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 border-0 text-white font-bold text-base shrink-0"
            >
              + Tambah
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
