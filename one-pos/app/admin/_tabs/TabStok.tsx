'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { fmtQty } from '../_helpers'

type StockRow = { base_qty: number; warehouse: { id: number; name: string } | null }

type ProductRow = {
  id: number
  name: string
  sku: string | null
  category: string | null
  base_unit: string
  active: boolean
  stocks: StockRow[]
}

function totalQty(stocks: StockRow[]) {
  return stocks.reduce((s, r) => s + Number(r.base_qty), 0)
}

export default function TabStok({ user }: { user: User }) {
  const sb = createClient()

  const [products, setProducts] = useState<ProductRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showZero, setShowZero] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb
      .from('products')
      .select(`
        id, name, sku, category, base_unit, active,
        stocks(base_qty, warehouse:warehouses(id, name))
      `)
      .eq('active', true)
      .order('name')
    setProducts((data ?? []) as unknown as ProductRow[])
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  const filtered = products.filter(p => {
    const q = search.trim().toLowerCase()
    const matchSearch = !q
      || p.name.toLowerCase().includes(q)
      || (p.sku ?? '').toLowerCase().includes(q)
      || (p.category ?? '').toLowerCase().includes(q)
    const total = totalQty(p.stocks)
    const matchZero = showZero || total > 0
    return matchSearch && matchZero
  })

  if (loading) return <p className="text-gray-500 text-center mt-12 text-base">Memuat stok...</p>

  return (
    <div className="pb-8">
      {/* Toolbar */}
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 bg-white border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          placeholder="Cari nama, SKU, atau kategori..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button
          onClick={() => setShowZero(v => !v)}
          className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 ${
            showZero
              ? 'bg-orange-600 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Stok 0
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center mt-10 text-base">
          {search ? `Tidak ditemukan: "${search}"` : 'Belum ada produk aktif.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const total     = totalQty(p.stocks)
            const isExpanded = expandedId === p.id
            const isLow     = total <= 0

            return (
              <div
                key={p.id}
                className={`bg-white border rounded-2xl overflow-hidden transition-colors ${
                  isLow ? 'border-red-200' : 'border-gray-200'
                }`}
              >
                {/* Baris utama — klik untuk expand */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-gray-900 font-semibold text-base">{p.name}</span>
                      {p.category && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                          {p.category}
                        </span>
                      )}
                    </div>
                    {p.sku && <p className="text-gray-400 text-sm mt-0.5">{p.sku}</p>}
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`font-bold text-base ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                      {fmtQty(total)}
                      <span className="text-gray-400 font-normal text-sm ml-1">{p.base_unit}</span>
                    </p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {p.stocks.length} gudang · {isExpanded ? '▲' : '▼'}
                    </p>
                  </div>
                </button>

                {/* Detail per gudang */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                    {p.stocks.length === 0 ? (
                      <p className="text-gray-400 text-sm">Belum ada stok di gudang manapun.</p>
                    ) : (
                      p.stocks
                        .slice()
                        .sort((a, b) => Number(b.base_qty) - Number(a.base_qty))
                        .map((s, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-gray-600 text-sm">{s.warehouse?.name ?? 'Gudang ?'}</span>
                            <span className={`text-sm font-semibold ${Number(s.base_qty) <= 0 ? 'text-red-500' : 'text-gray-900'}`}>
                              {fmtQty(Number(s.base_qty))}
                              <span className="text-gray-400 font-normal ml-1">{p.base_unit}</span>
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
