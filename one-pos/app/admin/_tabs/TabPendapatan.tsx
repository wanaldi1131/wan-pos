'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { DailyRevenue } from '../_types'
import { rp } from '../_helpers'

const todayKey = () => {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

const fmtDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function TabPendapatan({ user }: { user: User }) {
  const sb = createClient()
  const [data, setData]       = useState<DailyRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const TODAY = todayKey()

  const load = useCallback(async () => {
    setLoading(true)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const toKey = (iso: string) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    const [{ data: salesData }, { data: returnsData }] = await Promise.all([
      sb.from('sales').select('created_at, total, pay_method, pay_status').eq('voided', false).gte('created_at', since),
      sb.from('sale_returns').select('created_at, total').gte('created_at', since),
    ])

    const map: Record<string, DailyRevenue> = {}
    const empty = (): DailyRevenue => ({
      date: '', txn_count: 0, total: 0, retur: 0, net: 0,
      tunai: 0, transfer: 0, cod: 0, kredit: 0,
      tunai_count: 0, transfer_count: 0, cod_count: 0, kredit_count: 0, belum_count: 0,
    })

    for (const s of salesData ?? []) {
      const key = toKey(s.created_at)
      if (!map[key]) map[key] = { ...empty(), date: key }
      const d = map[key]
      d.txn_count++
      d.total += Number(s.total)
      if (s.pay_method === 'tunai')         { d.tunai    += Number(s.total); d.tunai_count++ }
      else if (s.pay_method === 'transfer') { d.transfer += Number(s.total); d.transfer_count++ }
      else if (s.pay_method === 'cod')      { d.cod      += Number(s.total); d.cod_count++ }
      else                                  { d.kredit   += Number(s.total); d.kredit_count++ }
      if (s.pay_status === 'belum') d.belum_count++
    }
    for (const r of returnsData ?? []) {
      const key = toKey(r.created_at)
      if (!map[key]) map[key] = { ...empty(), date: key }
      map[key].retur += Number(r.total)
    }

    setData(Object.values(map).map(d => ({ ...d, net: d.total - d.retur })).sort((a, b) => b.date.localeCompare(a.date)))
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  if (loading) return <p className="text-gray-500 text-center mt-12 text-base">Memuat data...</p>
  if (data.length === 0) return <p className="text-gray-500 text-center mt-12 text-base">Belum ada transaksi dalam 30 hari</p>

  const total30 = data.reduce((s, d) => s + d.net, 0)
  const txn30   = data.reduce((s, d) => s + d.txn_count, 0)

  return (
    <div className="space-y-3 mt-1">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-gray-500 text-sm">Net 30 Hari</p>
          <p className="text-gray-900 font-bold text-base mt-0.5">{rp(total30)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-3">
          <p className="text-gray-500 text-sm">Total Transaksi</p>
          <p className="text-gray-900 font-bold text-base mt-0.5">{txn30} nota</p>
        </div>
      </div>

      {data.map(day => {
        const isToday = day.date === TODAY
        const isOpen  = expanded === day.date
        const methods = [
          { key: 'tunai',    label: 'Tunai',    amount: day.tunai,    count: day.tunai_count,    color: 'text-green-600',  bg: 'bg-green-500/10 border-green-500/20' },
          { key: 'transfer', label: 'Transfer', amount: day.transfer, count: day.transfer_count, color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
          { key: 'cod',      label: 'COD',      amount: day.cod,      count: day.cod_count,      color: 'text-amber-600',  bg: 'bg-amber-500/10 border-amber-500/20' },
          { key: 'kredit',   label: 'Kredit',   amount: day.kredit,   count: day.kredit_count,   color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
        ].filter(m => m.amount > 0)

        return (
          <div
            key={day.date}
            className={`rounded-2xl border transition-colors ${
              isOpen
                ? isToday ? 'bg-orange-600/15 border-orange-500/50' : 'bg-white border-gray-300'
                : isToday ? 'bg-orange-600/10 border-orange-500/40' : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <button className="w-full text-left p-4" onClick={() => setExpanded(isOpen ? null : day.date)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className={`text-base font-bold ${isToday ? 'text-orange-600' : 'text-gray-900'}`}>
                      {isToday ? 'Hari Ini' : fmtDay(day.date)}
                    </p>
                    {isToday && <p className="text-gray-500 text-sm">{fmtDay(day.date)}</p>}
                  </div>
                  <p className="text-gray-500 text-sm mt-0.5">
                    {day.txn_count} transaksi
                    {day.belum_count > 0 && <span className="text-amber-600 ml-1.5">· {day.belum_count} belum lunas</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <p className={`font-bold text-base ${isToday ? 'text-orange-600' : 'text-gray-900'}`}>{rp(day.net)}</p>
                    {day.retur > 0 && <p className="text-amber-600 text-sm">retur −{rp(day.retur)}</p>}
                  </div>
                  <span className="text-gray-500 text-sm">{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-200 px-4 pb-4 pt-3 space-y-1">
                {methods.map(m => (
                  <div key={m.key} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold px-2 py-0.5 rounded-md border ${m.bg} ${m.color}`}>{m.label}</span>
                      <span className="text-gray-500 text-sm">{m.count} nota</span>
                    </div>
                    <span className={`font-semibold text-base ${m.color}`}>{rp(m.amount)}</span>
                  </div>
                ))}
                <div className="border-t border-gray-200 pt-2 mt-1 space-y-1">
                  <div className="flex items-center justify-between text-base">
                    <span className="text-gray-500 text-sm">Gross Penjualan</span>
                    <span className="text-gray-400 font-semibold">{rp(day.total)}</span>
                  </div>
                  {day.retur > 0 && (
                    <div className="flex items-center justify-between text-base">
                      <span className="text-amber-600 text-sm">Retur</span>
                      <span className="text-amber-500 font-semibold">−{rp(day.retur)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 mt-1">
                    <span className="text-gray-900 text-sm font-semibold">Net Pendapatan</span>
                    <span className="text-gray-900 font-bold">{rp(day.net)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
