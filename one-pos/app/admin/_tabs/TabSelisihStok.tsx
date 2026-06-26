'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type DiscItem = {
  id: number
  product: { name: string; base_unit: string } | null
  unit: { unit_name: string; factor_to_base: number } | null
  transfer_qty_base: number
  received_qty_base: number
  diff_base_qty: number
}

type Discrepancy = {
  id: number
  created_at: string
  transfer_id: number
  from_warehouse: { name: string } | null
  to_warehouse: { name: string } | null
  creator: { full_name: string } | null
  stock_discrepancy_items: DiscItem[]
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

function fmtQtyU(base: number, factor: number, unit: string) {
  const inUnit = factor > 0 ? base / factor : base
  const v = Number.isInteger(inUnit) ? String(inUnit) : inUnit.toLocaleString('id-ID', { maximumFractionDigits: 4 })
  return `${v} ${unit}`
}

export default function TabSelisihStok({ user: _user }: { user: User }) {
  const sb = createClient()
  const [rows, setRows]       = useState<Discrepancy[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('stock_discrepancies')
      .select(`
        id, created_at, transfer_id,
        from_warehouse:warehouses!from_wh(name),
        to_warehouse:warehouses!to_wh(name),
        creator:profiles!created_by(full_name),
        stock_discrepancy_items(
          id, transfer_qty_base, received_qty_base, diff_base_qty,
          product:products(name, base_unit),
          unit:product_units!unit_id(unit_name, factor_to_base)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100)
    setRows((data ?? []) as unknown as Discrepancy[])
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-900 font-bold text-base">Selisih Stok</p>
        <button onClick={load}
          className="text-gray-500 hover:text-gray-900 text-sm transition-colors">
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-12 text-base">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-gray-500 py-12 text-base">Belum ada selisih stok yang tercatat.</p>
      ) : (
        <div className="space-y-3">
          {rows.map(disc => {
            const isOpen = expanded === disc.id
            return (
              <div key={disc.id} className="bg-white border border-red-200 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : disc.id)}
                  className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-red-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-900 text-base font-semibold">
                        TRF-{String(disc.transfer_id).padStart(5, '0')}
                      </span>
                      <span className="text-xs font-bold uppercase px-1.5 py-0.5 rounded-md bg-red-100 text-red-700">
                        selisih
                      </span>
                      <span className="text-gray-500 text-sm">{fmtDate(disc.created_at)}</span>
                    </div>
                    <p className="text-gray-700 text-sm mt-0.5 font-medium">
                      {disc.from_warehouse?.name ?? '?'} → {disc.to_warehouse?.name ?? '?'}
                    </p>
                    {disc.creator && (
                      <p className="text-gray-400 text-sm mt-0.5">Dicatat oleh: {disc.creator.full_name}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-red-600 text-sm font-semibold">
                      {disc.stock_discrepancy_items.length} item
                    </span>
                    <span className="text-gray-400 text-sm">{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-red-100 px-4 py-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-400 uppercase tracking-wide text-xs">
                          <th className="text-left pb-2 font-medium">Barang</th>
                          <th className="text-right pb-2 font-medium">Dikirim</th>
                          <th className="text-right pb-2 font-medium">Diterima</th>
                          <th className="text-right pb-2 font-medium">Selisih</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {disc.stock_discrepancy_items.map(item => {
                          const factor    = item.unit?.factor_to_base ?? 1
                          const unitName  = item.unit?.unit_name ?? item.product?.base_unit ?? '?'
                          const isShort   = item.diff_base_qty < 0
                          return (
                            <tr key={item.id}>
                              <td className="py-2 text-gray-700 pr-2">{item.product?.name ?? '—'}</td>
                              <td className="py-2 text-right text-gray-600 whitespace-nowrap">
                                {fmtQtyU(item.transfer_qty_base, factor, unitName)}
                              </td>
                              <td className="py-2 text-right text-gray-600 whitespace-nowrap">
                                {fmtQtyU(item.received_qty_base, factor, unitName)}
                              </td>
                              <td className={`py-2 text-right font-semibold whitespace-nowrap ${isShort ? 'text-red-600' : 'text-green-600'}`}>
                                {isShort ? '' : '+'}{fmtQtyU(item.diff_base_qty, factor, unitName)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs text-gray-400 mt-3">
                      Selisih negatif = barang kurang diterima · positif = lebih dari yang dikirim
                    </p>
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
