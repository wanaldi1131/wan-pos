'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────
type CashSession = {
  id: number
  cashier_id: string
  warehouse_id: number
  opened_at: string
  closed_at: string | null
  opening_balance: number
  closing_balance: number | null
  notes: string | null
  status: 'open' | 'closed'
}

type CashOut = {
  id: number
  session_id: number
  amount: number
  description: string
  created_at: string
}

type SaleSummary = {
  total_tunai: number
  total_transfer: number
  retur_tunai: number
}

// ── Helpers ────────────────────────────────────────────────────
const fmt = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID')

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('id-ID', { timeStyle: 'short' })
}

// ── Sub-components ─────────────────────────────────────────────
function StatCard({
  label, value, sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent: 'neutral' | 'green' | 'blue' | 'red'
}) {
  const valColor: Record<string, string> = {
    neutral: 'text-gray-900',
    green:   'text-green-600',
    blue:    'text-blue-400',
    red:     'text-red-600',
  }
  const labelColor: Record<string, string> = {
    neutral: 'text-gray-500',
    green:   'text-green-600',
    blue:    'text-blue-600',
    red:     'text-red-600',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3">
      <p className={`text-sm ${labelColor[accent]}`}>{label}</p>
      <p className={`text-base font-bold mt-0.5 ${valColor[accent]}`}>{value}</p>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────
export default function KasPage() {
  const sb = createClient()

  // undefined = masih loading, null = tidak ada sesi aktif
  const [session, setSession]   = useState<CashSession | null | undefined>(undefined)
  const [cashOuts, setCashOuts] = useState<CashOut[]>([])
  const [summary, setSummary]   = useState<SaleSummary>({ total_tunai: 0, total_transfer: 0, retur_tunai: 0 })
  const [error, setError]       = useState<string | null>(null)

  // Form: buka sesi
  const [openingBalance, setOpeningBalance] = useState('')
  const [opening, setOpening]               = useState(false)

  // Form: pengeluaran kas
  const [showOutForm, setShowOutForm] = useState(false)
  const [outAmount, setOutAmount]     = useState('')
  const [outDesc, setOutDesc]         = useState('')
  const [addingOut, setAddingOut]     = useState(false)

  // Form: tutup sesi
  const [showCloseForm, setShowCloseForm]   = useState(false)
  const [closingBalance, setClosingBalance] = useState('')
  const [closingNotes, setClosingNotes]     = useState('')
  const [closing, setClosing]               = useState(false)

  // ── Data fetching ────────────────────────────────────────────
  const loadSessionData = useCallback(async (sess: CashSession) => {
    const [{ data: outs }, { data: salesData }, { data: returnsData }] = await Promise.all([
      sb.from('cash_out')
        .select('*')
        .eq('session_id', sess.id)
        .order('created_at', { ascending: true }),

      sb.from('sales')
        .select('pay_method, total')
        .eq('cashier_id', sess.cashier_id)
        .eq('pay_status', 'lunas')
        .gte('created_at', sess.opened_at),

      sb.from('sale_returns')
        .select('total')
        .eq('cashier_id', sess.cashier_id)
        .eq('refund_method', 'tunai')
        .gte('created_at', sess.opened_at),
    ])

    setCashOuts(outs ?? [])

    const totals = (salesData ?? []).reduce(
      (acc, s) => {
        if (s.pay_method === 'tunai') acc.total_tunai += Number(s.total)
        else acc.total_transfer += Number(s.total)
        return acc
      },
      { total_tunai: 0, total_transfer: 0, retur_tunai: 0 },
    )
    totals.retur_tunai = (returnsData ?? []).reduce((s, r) => s + Number(r.total), 0)
    setSummary(totals)
  }, [sb])

  const loadSession = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSession(null); return }

    const { data } = await sb
      .from('cash_sessions')
      .select('*')
      .eq('cashier_id', user.id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) { setSession(data); loadSessionData(data) }
    else setSession(null)
  }, [sb, loadSessionData])

  useEffect(() => { loadSession() }, [loadSession])

  // ── Actions ──────────────────────────────────────────────────
  async function handleOpenSession() {
    setOpening(true); setError(null)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setOpening(false); return }

    const { data, error: err } = await sb
      .from('cash_sessions')
      .insert({ cashier_id: user.id, warehouse_id: 1, opening_balance: parseFloat(openingBalance) || 0 })
      .select().single()

    if (err) { setError(err.message); setOpening(false); return }
    setSession(data); loadSessionData(data); setOpeningBalance(''); setOpening(false)
  }

  async function handleAddCashOut() {
    if (!session) return
    setAddingOut(true); setError(null)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setAddingOut(false); return }

    const { error: err } = await sb.from('cash_out').insert({
      session_id: session.id, cashier_id: user.id,
      amount: parseFloat(outAmount), description: outDesc.trim(),
    })

    if (err) { setError(err.message); setAddingOut(false); return }
    setOutAmount(''); setOutDesc(''); setShowOutForm(false)
    loadSessionData(session); setAddingOut(false)
  }

  async function handleCloseSession() {
    if (!session) return
    setClosing(true); setError(null)

    const { error: err } = await sb
      .from('cash_sessions')
      .update({
        status: 'closed', closed_at: new Date().toISOString(),
        closing_balance: parseFloat(closingBalance) || 0,
        notes: closingNotes.trim() || null,
      })
      .eq('id', session.id)

    if (err) { setError(err.message); setClosing(false); return }
    setSession(null); setCashOuts([])
    setSummary({ total_tunai: 0, total_transfer: 0, retur_tunai: 0 })
    setClosingBalance(''); setClosingNotes(''); setShowCloseForm(false); setClosing(false)
  }

  // ── Computed ─────────────────────────────────────────────────
  const totalOut     = cashOuts.reduce((s, o) => s + Number(o.amount), 0)
  const expectedCash = session
    ? Number(session.opening_balance) + summary.total_tunai - summary.retur_tunai - totalOut
    : 0
  const actualCash = parseFloat(closingBalance) || 0
  const selisih    = actualCash - expectedCash

  // ── Shared input style ────────────────────────────────────────
  const inputCls = 'w-full bg-gray-100 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500'

  // ── Render ───────────────────────────────────────────────────
  if (session === undefined) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-base">Memuat sesi kas...</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col select-none">

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-xl mx-auto space-y-3">

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-500/30 text-red-600 px-4 py-3 rounded-xl text-base">
              {error}
            </div>
          )}

          {/* ── Tidak ada sesi aktif ── */}
          {!session && (
            <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center space-y-5">
              <div>
                <p className="text-4xl mb-3">🏧</p>
                <h2 className="font-bold text-gray-900 text-lg">Belum Ada Sesi Kas</h2>
                <p className="text-base text-gray-500 mt-1">
                  Hitung uang di laci, lalu buka sesi untuk mulai mencatat hari ini.
                </p>
              </div>

              <div className="max-w-xs mx-auto space-y-3 text-left">
                <div>
                  <label className="block text-sm text-gray-500 mb-1.5">Saldo Awal di Laci (Rp)</label>
                  <input
                    type="number"
                    value={openingBalance}
                    onChange={e => setOpeningBalance(e.target.value)}
                    placeholder="0"
                    min="0"
                    inputMode="numeric"
                    className={inputCls}
                  />
                </div>
                <button
                  onClick={handleOpenSession}
                  disabled={opening}
                  className="w-full bg-orange-600 hover:bg-orange-500 text-white rounded-xl py-2.5 text-base font-semibold transition-colors disabled:opacity-50"
                >
                  {opening ? 'Membuka sesi...' : 'Buka Sesi Kas'}
                </button>
              </div>
            </div>
          )}

          {/* ── Sesi aktif ── */}
          {session && (
            <>
              {/* Info sesi */}
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Sesi dibuka pukul</p>
                  <p className="text-base font-medium text-gray-900">{fmtDateTime(session.opened_at)}</p>
                </div>
                <span className="bg-green-500/15 text-green-600 text-sm font-semibold px-2.5 py-1 rounded-full border border-green-500/30">
                  Aktif
                </span>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <StatCard label="Saldo Awal"   value={fmt(session.opening_balance)} accent="neutral" />
                <StatCard label="Tunai Masuk"  value={fmt(summary.total_tunai)}     accent="green" />
                <StatCard label="Transfer"     value={fmt(summary.total_transfer)}  sub="tidak masuk laci" accent="blue" />
                <StatCard label="Pengeluaran"  value={fmt(totalOut)}                accent="red" />
              </div>

              {/* Ekspektasi kas */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                <p className="text-sm text-amber-600">Ekspektasi Kas di Laci</p>
                <p className="text-2xl font-bold text-amber-600 mt-0.5">{fmt(expectedCash)}</p>
                <p className="text-sm text-amber-700 mt-1">
                  {fmt(session.opening_balance)} awal
                  &nbsp;+&nbsp;{fmt(summary.total_tunai)} tunai
                  {summary.retur_tunai > 0 && (
                    <>&nbsp;−&nbsp;{fmt(summary.retur_tunai)} retur</>
                  )}
                  {totalOut > 0 && (
                    <>&nbsp;−&nbsp;{fmt(totalOut)} keluar</>
                  )}
                </p>
              </div>

              {/* ── Pengeluaran kas ── */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                  <span className="text-base font-semibold text-gray-900">
                    Pengeluaran Kas
                    {cashOuts.length > 0 && (
                      <span className="ml-2 text-gray-500 font-normal text-sm">({cashOuts.length})</span>
                    )}
                  </span>
                  <button
                    onClick={() => { setShowOutForm(v => !v); setError(null) }}
                    className="text-orange-400 hover:text-orange-600 text-base font-medium transition-colors"
                  >
                    {showOutForm ? 'Batal' : '+ Catat'}
                  </button>
                </div>

                {showOutForm && (
                  <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 space-y-2">
                    <input
                      type="number"
                      value={outAmount}
                      onChange={e => setOutAmount(e.target.value)}
                      placeholder="Jumlah (Rp)"
                      min="1"
                      inputMode="numeric"
                      className={inputCls}
                    />
                    <input
                      type="text"
                      value={outDesc}
                      onChange={e => setOutDesc(e.target.value)}
                      placeholder="Keterangan (cth: beli alat tulis)"
                      className={inputCls}
                    />
                    <button
                      onClick={handleAddCashOut}
                      disabled={addingOut || !outAmount || !outDesc.trim()}
                      className="w-full bg-red-600/80 hover:bg-red-600 text-white rounded-xl py-2 text-base font-semibold transition-colors disabled:opacity-40"
                    >
                      {addingOut ? 'Menyimpan...' : 'Catat Pengeluaran'}
                    </button>
                  </div>
                )}

                {cashOuts.length === 0 ? (
                  <p className="text-center text-gray-500 text-base py-5">Belum ada pengeluaran</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {cashOuts.map(o => (
                      <li key={o.id} className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-base text-gray-900">{o.description}</p>
                          <p className="text-sm text-gray-500">{fmtTime(o.created_at)}</p>
                        </div>
                        <span className="text-base font-semibold text-red-600 shrink-0 ml-4">
                          −{fmt(o.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Tutup sesi ── */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => { setShowCloseForm(v => !v); setError(null) }}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-base font-semibold text-gray-900">Tutup Sesi Kas</span>
                  <span className="text-gray-500 text-sm">{showCloseForm ? '▲' : '▼'}</span>
                </button>

                {showCloseForm && (
                  <div className="px-4 py-4 border-t border-gray-200 space-y-3">
                    <p className="text-sm text-gray-500">
                      Hitung fisik uang di laci, masukkan totalnya. Sistem akan menghitung selisih otomatis.
                    </p>

                    <div>
                      <label className="text-sm text-gray-500 block mb-1.5">Kas Aktual di Laci (Rp)</label>
                      <input
                        type="number"
                        value={closingBalance}
                        onChange={e => setClosingBalance(e.target.value)}
                        placeholder="0"
                        min="0"
                        inputMode="numeric"
                        className={inputCls}
                      />
                    </div>

                    {closingBalance !== '' && (
                      <div className={`px-3 py-2.5 rounded-xl text-base border ${
                        selisih === 0
                          ? 'bg-green-500/10 border-green-500/30 text-green-600'
                          : selisih > 0
                            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                            : 'bg-red-50 border-red-500/30 text-red-600'
                      }`}>
                        <span className="font-semibold">
                          {selisih === 0 && 'Pas ✓'}
                          {selisih > 0 && `Lebih ${fmt(selisih)}`}
                          {selisih < 0 && `Kurang ${fmt(Math.abs(selisih))}`}
                        </span>
                        <span className="text-sm ml-1.5 opacity-60">(ekspektasi {fmt(expectedCash)})</span>
                      </div>
                    )}

                    <div>
                      <label className="text-sm text-gray-500 block mb-1.5">Catatan (opsional)</label>
                      <input
                        type="text"
                        value={closingNotes}
                        onChange={e => setClosingNotes(e.target.value)}
                        placeholder="Catatan penutup sesi"
                        className={inputCls}
                      />
                    </div>

                    <button
                      onClick={handleCloseSession}
                      disabled={closing || closingBalance === ''}
                      className="w-full bg-white/10 hover:bg-gray-200 text-gray-900 rounded-xl py-2.5 text-base font-semibold transition-colors disabled:opacity-40"
                    >
                      {closing ? 'Menutup sesi...' : 'Tutup Sesi Kas'}
                    </button>
                  </div>
                )}
              </div>

              <div className="h-4" />
            </>
          )}

        </div>
      </div>
    </div>
  )
}
