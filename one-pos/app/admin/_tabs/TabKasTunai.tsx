'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { KasTunaiDay, KasTunaiInvoice } from '../_types'
import { rp } from '../_helpers'

const toKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const todayKey = () => toKey(new Date().toISOString())

const fmtDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const emptyDay = (key: string): KasTunaiDay => ({
  date: key, total: 0, count: 0,
  tunai_count: 0, tunai_total: 0,
  transfer_count: 0, transfer_total: 0,
  hutang_count: 0, hutang_total: 0,
  retur_tunai: 0, retur_transfer: 0,
})

export default function TabKasTunai({ user }: { user: User }) {
  const sb = createClient()
  const [data, setData]         = useState<KasTunaiDay[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Record<string, KasTunaiInvoice[]>>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)
  const TODAY = todayKey()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: sales, error: salesErr }, { data: returns }] = await Promise.all([
      sb.from('sales').select('paid_at, total, pay_method').not('paid_at', 'is', null).gte('paid_at', since).eq('voided', false),
      sb.from('sale_returns').select('created_at, total, refund_method').in('refund_method', ['tunai', 'transfer']).gte('created_at', since),
    ])

    if (salesErr) { setError(salesErr.message); setLoading(false); return }

    const map: Record<string, KasTunaiDay> = {}
    for (const s of sales ?? []) {
      const key = toKey(s.paid_at!)
      if (!map[key]) map[key] = emptyDay(key)
      const amt = Number(s.total)
      map[key].total += amt; map[key].count++
      if (s.pay_method === 'tunai')         { map[key].tunai_count++;    map[key].tunai_total    += amt }
      else if (s.pay_method === 'transfer') { map[key].transfer_count++; map[key].transfer_total += amt }
      else                                  { map[key].hutang_count++;   map[key].hutang_total   += amt }
    }
    for (const r of returns ?? []) {
      const key = toKey(r.created_at)
      if (!map[key]) map[key] = emptyDay(key)
      const amt = Number(r.total)
      map[key].total -= amt
      if (r.refund_method === 'tunai') map[key].retur_tunai += amt
      else map[key].retur_transfer += amt
    }
    setData(Object.values(map).sort((a, b) => b.date.localeCompare(a.date)))
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  async function loadDetail(dateKey: string) {
    if (invoices[dateKey]) return
    setLoadingDetail(dateKey)
    const [y, m, d] = dateKey.split('-').map(Number)
    const start = new Date(y, m - 1, d).toISOString()
    const end   = new Date(y, m - 1, d + 1).toISOString()

    const [{ data: sales }, { data: returns }] = await Promise.all([
      sb.from('sales').select('id, code, total, pay_method, paid_at, customer:customers(name)').gte('paid_at', start).lt('paid_at', end).eq('voided', false).order('paid_at'),
      sb.from('sale_returns').select('id, total, refund_method, created_at, sale:sales(code, customer:customers(name))').in('refund_method', ['tunai', 'transfer']).gte('created_at', start).lt('created_at', end).order('created_at'),
    ])

    const merged: KasTunaiInvoice[] = [
      ...(sales ?? []).map((s: any) => ({
        id: s.id, code: s.code, total: Number(s.total), pay_method: s.pay_method,
        paid_at: s.paid_at, customer_name: s.customer?.name ?? null,
        is_hutang: s.pay_method === 'cod' || s.pay_method === 'kredit', is_retur: false,
      })),
      ...(returns ?? []).map((r: any) => ({
        id: r.id, code: r.sale?.code ?? '—', total: -Number(r.total), pay_method: r.refund_method,
        paid_at: r.created_at, customer_name: r.sale?.customer?.name ?? null,
        is_hutang: false, is_retur: true,
      })),
    ].sort((a, b) => a.paid_at.localeCompare(b.paid_at))

    setInvoices(prev => ({ ...prev, [dateKey]: merged }))
    setLoadingDetail(null)
  }

  if (loading) return <p className="text-gray-500 text-center mt-12 text-base">Memuat data...</p>

  if (error) return (
    <div className="bg-red-50 border border-red-500/30 rounded-2xl p-4 mt-4">
      <p className="text-red-600 text-base font-semibold mb-1">Gagal memuat data kas</p>
      <p className="text-red-400 text-sm font-mono">{error}</p>
      <p className="text-gray-500 text-sm mt-2">Pastikan sudah menjalankan <code className="text-amber-600">schema_patch_paid_at.sql</code> di Supabase SQL Editor.</p>
    </div>
  )

  if (data.length === 0) return <p className="text-gray-500 text-center mt-12 text-base">Belum ada penerimaan kas dalam 30 hari</p>

  const totalCash = data.reduce((s, d) => s + d.total, 0)
  const totalTxn  = data.reduce((s, d) => s + d.count, 0)

  return (
    <div className="space-y-3 mt-1">
      <div className="grid grid-cols-2 gap-3 mb-1">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
          <p className="text-emerald-600 text-sm font-semibold uppercase tracking-wide mb-1">Total Kas 30 Hari</p>
          <p className="text-gray-900 font-bold text-xl">{rp(totalCash)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-gray-500 text-sm font-semibold uppercase tracking-wide mb-1">Total Transaksi</p>
          <p className="text-gray-900 font-bold text-xl">{totalTxn}</p>
        </div>
      </div>

      {data.map(day => {
        const isToday = day.date === TODAY
        const isOpen  = expanded === day.date
        const invs    = invoices[day.date] ?? []

        return (
          <div key={day.date} className={`rounded-2xl border overflow-hidden ${isToday ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-gray-200 bg-white'}`}>
            <button
              className="w-full text-left p-4"
              onClick={async () => {
                if (!isOpen) await loadDetail(day.date)
                setExpanded(isOpen ? null : day.date)
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`font-semibold text-base ${isToday ? 'text-emerald-600' : 'text-gray-900'}`}>
                    {isToday ? 'Hari Ini' : fmtDateKey(day.date)}
                    {isToday && <span className="text-gray-500 font-normal ml-1">— {fmtDateKey(day.date)}</span>}
                  </p>
                  <div className="flex gap-3 mt-0.5 flex-wrap">
                    {day.tunai_count > 0    && <p className="text-green-600 text-sm">{day.tunai_count}× tunai</p>}
                    {day.transfer_count > 0 && <p className="text-blue-400 text-sm">{day.transfer_count}× transfer</p>}
                    {day.hutang_count > 0   && <p className="text-amber-600 text-sm">{day.hutang_count}× bayar hutang</p>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-gray-900 font-bold">{rp(day.total)}</p>
                  <p className="text-gray-500 text-sm">{isOpen ? '▲' : '▼'}</p>
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 space-y-2">
                {loadingDetail === day.date ? (
                  <p className="text-gray-500 text-sm text-center py-3">Memuat...</p>
                ) : invs.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-3">Tidak ada data</p>
                ) : (
                  invs.map((inv, i) => (
                    <div key={`${inv.is_retur ? 'r' : 's'}-${inv.id}-${i}`}
                      className={`flex items-center gap-3 py-2 border-b border-gray-100 last:border-0 ${inv.is_retur ? 'opacity-80' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className={`text-sm font-semibold font-mono ${inv.is_retur ? 'text-red-600' : 'text-gray-900'}`}>{inv.code}</p>
                          {inv.is_retur && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-600">RETUR</span>}
                          {inv.pay_method === 'transfer' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400">TRANSFER</span>}
                          {inv.is_hutang && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600">BAYAR HUTANG</span>}
                        </div>
                        <p className="text-gray-500 text-sm">{inv.customer_name ?? 'Umum'} · {fmtTime(inv.paid_at)}</p>
                      </div>
                      <p className={`text-base font-semibold shrink-0 ${inv.is_retur ? 'text-red-600' : 'text-gray-900'}`}>
                        {inv.is_retur ? `−${rp(-inv.total)}` : rp(inv.total)}
                      </p>
                    </div>
                  ))
                )}
                <div className="border-t border-gray-200 pt-2 mt-1 space-y-1">
                  {day.tunai_total > 0    && <div className="flex justify-between"><p className="text-green-600 text-sm">Tunai ({day.tunai_count}×)</p><p className="text-green-600 text-sm font-semibold">{rp(day.tunai_total)}</p></div>}
                  {day.transfer_total > 0 && <div className="flex justify-between"><p className="text-blue-400 text-sm">Transfer ({day.transfer_count}×)</p><p className="text-blue-400 text-sm font-semibold">{rp(day.transfer_total)}</p></div>}
                  {day.hutang_total > 0   && <div className="flex justify-between"><p className="text-amber-600 text-sm">Bayar Hutang ({day.hutang_count}×)</p><p className="text-amber-600 text-sm font-semibold">{rp(day.hutang_total)}</p></div>}
                  {(day.retur_tunai > 0 || day.retur_transfer > 0) && (
                    <div className="flex justify-between"><p className="text-red-600 text-sm">Retur Keluar</p><p className="text-red-600 text-sm font-semibold">−{rp(day.retur_tunai + day.retur_transfer)}</p></div>
                  )}
                  <div className="flex justify-between border-t border-gray-200 pt-1.5">
                    <p className="text-gray-500 text-sm font-semibold">Net Kas</p>
                    <p className="text-gray-900 font-bold text-base">{rp(day.total)}</p>
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
