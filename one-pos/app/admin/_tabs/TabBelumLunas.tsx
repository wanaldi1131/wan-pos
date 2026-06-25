'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { SaleBelumLunas } from '../_types'
import { rp, fmtDate, PAY_LABEL } from '../_helpers'

type PayMethod = 'tunai' | 'transfer' | 'cod' | 'kredit'
const PAY_METHODS: PayMethod[] = ['tunai', 'transfer', 'cod', 'kredit']

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
  const [error, setError]       = useState<string | null>(null)

  // Konfirmasi pembayaran: id sale yang sedang dikonfirmasi + metode yang dipilih
  const [confirmId, setConfirmId]       = useState<number | null>(null)
  const [confirmMethod, setConfirmMethod] = useState<PayMethod>('tunai')
  const [submitting, setSubmitting]     = useState(false)

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

  function openConfirm(sale: SaleBelumLunas) {
    setConfirmId(sale.id)
    setConfirmMethod(sale.pay_method as PayMethod)
    setError(null)
  }

  function cancelConfirm() {
    setConfirmId(null)
  }

  async function confirmLunas() {
    if (!confirmId) return
    setSubmitting(true)
    setError(null)
    const { error: err } = await sb.from('sales').update({
      pay_status: 'lunas',
      pay_method: confirmMethod,
      paid_at:    new Date().toISOString(),
    }).eq('id', confirmId)
    if (err) {
      setError(err.message)
      setSubmitting(false)
      return
    }
    setConfirmId(null)
    setSubmitting(false)
    await load()
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
          <div key={sale.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            {/* Baris utama */}
            <div className="p-4 flex items-center gap-3">
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
                  confirmId === sale.id ? (
                    <button
                      onClick={cancelConfirm}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors whitespace-nowrap"
                    >
                      Batal
                    </button>
                  ) : (
                    <button
                      onClick={() => openConfirm(sale)}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-green-500/10 text-green-600 border border-green-500/30 hover:bg-green-500/20 transition-colors whitespace-nowrap"
                    >
                      Tandai Lunas
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Panel konfirmasi — muncul inline di bawah baris utama */}
            {confirmId === sale.id && (
              <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
                <p className="text-gray-500 text-sm">Metode pembayaran yang diterima:</p>
                <div className="flex gap-2 flex-wrap">
                  {PAY_METHODS.map(m => (
                    <button
                      key={m}
                      onClick={() => setConfirmMethod(m)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                        confirmMethod === m
                          ? 'bg-orange-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:border-orange-400'
                      }`}
                    >
                      {PAY_LABEL[m]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={confirmLunas}
                  disabled={submitting}
                  className="w-full py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
                >
                  {submitting ? 'Menyimpan…' : `Konfirmasi Lunas via ${PAY_LABEL[confirmMethod]}`}
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </>
  )
}
