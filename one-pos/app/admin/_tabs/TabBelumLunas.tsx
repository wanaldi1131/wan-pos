'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { SaleBelumLunas } from '../_types'
import { rp, fmtDate, PAY_LABEL } from '../_helpers'

export default function TabBelumLunas({
  user,
  isAdmin,
  onCountChange,
}: {
  user: User
  isAdmin: boolean
  onCountChange: (n: number) => void
}) {
  const sb = createClient()
  const [sales, setSales]       = useState<SaleBelumLunas[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await sb
      .from('sales')
      .select('id, code, total, pay_method, pay_status, fulfillment, created_at, customer:customers(name)')
      .eq('pay_status', 'belum')
      .eq('voided', false)
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) setError(err.message)
    else {
      const rows = (data ?? []) as unknown as SaleBelumLunas[]
      setSales(rows)
      onCountChange(rows.length)
    }
    setLoading(false)
  }, [sb, onCountChange])

  useEffect(() => { load() }, [load])

  async function toggleLunas(sale: SaleBelumLunas) {
    setUpdatingId(sale.id)
    setError(null)
    const next = sale.pay_status === 'lunas' ? 'belum' : 'lunas'
    const { error: err } = await sb.from('sales').update({
      pay_status: next,
      paid_at:    next === 'lunas' ? new Date().toISOString() : null,
    }).eq('id', sale.id)
    if (err) setError(err.message)
    else await load()
    setUpdatingId(null)
  }

  const filtered = search.trim()
    ? sales.filter(s => {
        const q = search.toLowerCase()
        return s.code.toLowerCase().includes(q) || (s.customer?.name ?? '').toLowerCase().includes(q)
      })
    : sales

  if (loading) return <p className="text-gray-500 text-center mt-12 text-base">Memuat data...</p>

  return (
    <>
      {error && (
        <div className="bg-red-50 border border-red-500/30 text-red-600 px-4 py-3 rounded-xl text-base flex items-start justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <input
        className="w-full bg-white border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-4 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
        placeholder="Cari nomor invoice atau nama customer..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {sales.length === 0 ? (
        <p className="text-gray-500 text-center mt-10 text-base">Semua transaksi sudah lunas 🎉</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center mt-10 text-base">Tidak ditemukan: &ldquo;{search}&rdquo;</p>
      ) : (
        filtered.map(sale => (
          <div key={sale.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <span className="text-gray-900 font-mono text-base font-bold">{sale.code}</span>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                  {PAY_LABEL[sale.pay_method] ?? sale.pay_method}
                </span>
                {sale.fulfillment === 'antar' && (
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400">Pengiriman</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-500">
                <span>{fmtDate(sale.created_at)}</span>
                {sale.customer?.name && <><span>·</span><span>{sale.customer.name}</span></>}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-gray-900 font-bold">{rp(sale.total)}</span>
              {isAdmin && (
                <button
                  onClick={() => toggleLunas(sale)}
                  disabled={updatingId === sale.id}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-500/10 text-green-600 border border-green-500/30 hover:bg-green-500/20 transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  {updatingId === sale.id ? '...' : 'Tandai Lunas'}
                </button>
              )}
            </div>
          </div>
        ))
      )}
    </>
  )
}
