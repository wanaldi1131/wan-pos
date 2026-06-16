'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────
type Driver = { id: number; name: string }

type SuratJalanRec = {
  id: number
  code: string
  status: 'dimuat' | 'terkirim'
  plat: string | null
  created_at: string
  driver: { name: string } | null
}

type Customer = {
  id: number
  name: string
  phone: string | null
  address: string | null
}

type SaleAntar = {
  id: number
  code: string
  total: number
  pay_method: string
  pay_status: string
  created_at: string
  customer: Customer | null
  surat_jalan: SuratJalanRec[]
}

type SaleBelumLunas = {
  id: number
  code: string
  total: number
  pay_method: string
  pay_status: string
  fulfillment: string
  created_at: string
  customer: { name: string } | null
}

type SaleItem = {
  id: number
  qty: number
  base_qty: number
  unit_price: number
  subtotal: number
  product: { name: string } | null
  unit: { unit_name: string } | null
}

type Tab = 'antaran' | 'belum_lunas'

// ── Helpers ────────────────────────────────────────────────────
const rp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })

const fmtQty = (n: number) =>
  Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toLocaleString('id-ID', { maximumFractionDigits: 4 })

const PAY_LABEL: Record<string, string> = {
  tunai: 'Tunai', transfer: 'Transfer', cod: 'COD', kredit: 'Kredit',
}

function deliveryStatus(sjs: SuratJalanRec[]): 'none' | 'dimuat' | 'terkirim' {
  if (sjs.length === 0) return 'none'
  if (sjs.some(s => s.status === 'terkirim')) return 'terkirim'
  return 'dimuat'
}

// ── Print surat jalan ──────────────────────────────────────────
function printSJ(
  sj: SuratJalanRec,
  sale: Pick<SaleAntar, 'code' | 'pay_method' | 'total'>,
  customer: Customer | null,
  items: SaleItem[],
) {
  const rows = items.map((item, i) => `
    <tr>
      <td style="text-align:center;width:5%">${i + 1}</td>
      <td>${item.product?.name ?? '—'}</td>
      <td style="text-align:right;width:13%">${fmtQty(item.qty)}</td>
      <td style="width:15%">${item.unit?.unit_name ?? '—'}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Surat Jalan ${sj.code}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11pt;color:#000;padding:14mm 20mm}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:5mm}
  .co h1{font-size:20pt;font-weight:900;letter-spacing:1px}
  .co p{font-size:9pt;color:#555;margin-top:1mm}
  .sji{text-align:right}
  .sji h2{font-size:15pt;font-weight:bold;letter-spacing:3px}
  .sji p{font-size:9.5pt;margin-top:1mm}
  hr{border:none;border-top:2px solid #000;margin:4mm 0}
  .info{display:flex;gap:8mm;margin-bottom:5mm}
  .ib{flex:1}
  .ib .lbl{font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5mm}
  .ib .val{font-size:10.5pt}
  table{width:100%;border-collapse:collapse;margin:4mm 0}
  thead tr{background:#f2f2f2}
  th,td{border:1px solid #ccc;padding:2.5mm 3mm;font-size:10pt}
  th{font-size:8.5pt;font-weight:bold;text-transform:uppercase}
  .note{font-size:8.5pt;color:#555;margin-top:2mm}
  .sigs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6mm;margin-top:14mm}
  .sig{text-align:center}
  .sig .sp{height:18mm}
  .sig .ln{border-top:1px solid #000;padding-top:2mm;font-size:9pt}
  @media print{@page{margin:0}body{padding:10mm 14mm}}
</style>
</head><body>
<div class="hdr">
  <div class="co"><h1>ADI JAYA</h1><p>Toko Bahan Bangunan</p></div>
  <div class="sji">
    <h2>SURAT JALAN</h2>
    <p>No: <strong>${sj.code}</strong></p>
    <p>Tanggal: ${fmtDate(sj.created_at)}</p>
    <p>Ref Nota: ${sale.code}</p>
  </div>
</div>
<hr>
<div class="info">
  <div class="ib">
    <div class="lbl">Dikirim kepada</div>
    <div class="val"><strong>${customer?.name ?? '—'}</strong></div>
    ${customer?.phone ? `<div class="val">${customer.phone}</div>` : ''}
    ${customer?.address ? `<div class="val">${customer.address}</div>` : ''}
  </div>
  <div class="ib">
    ${sj.plat ? `<div class="lbl">Kendaraan</div><div class="val"><strong>${sj.plat}</strong></div>` : ''}
    ${sj.driver?.name ? `<div class="lbl" style="margin-top:2mm">Pengemudi</div><div class="val">${sj.driver.name}</div>` : ''}
  </div>
</div>
<table>
  <thead><tr><th>No</th><th>Nama Barang</th><th style="text-align:right">Qty</th><th>Satuan</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="note">Pembayaran: ${PAY_LABEL[sale.pay_method] ?? sale.pay_method} · Total: ${rp(sale.total)}</div>
<div class="sigs">
  <div class="sig"><div class="sp"></div><div class="ln">Penerima</div></div>
  <div class="sig"><div class="sp"></div><div class="ln">Pengemudi</div></div>
  <div class="sig"><div class="sp"></div><div class="ln">Admin / Gudang</div></div>
</div>
</body></html>`

  const w = window.open('', '_blank', 'width=820,height=1160')
  if (!w) return
  w.document.write(html)
  w.document.close()
  setTimeout(() => w.print(), 350)
}

// ── Component ──────────────────────────────────────────────────
export default function AdminPage() {
  const sb = createClient()

  const [user, setUser]             = useState<User | null | undefined>(undefined)
  const [tab, setTab]               = useState<Tab>('antaran')
  const [antaRanSales, setAntaRanSales]       = useState<SaleAntar[]>([])
  const [belumLunasSales, setBelumLunasSales] = useState<SaleBelumLunas[]>([])
  const [drivers, setDrivers]       = useState<Driver[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [expandedId, setExpandedId]   = useState<number | null>(null)
  const [itemsCache, setItemsCache]   = useState<Record<number, SaleItem[]>>({})
  const [loadingItems, setLoadingItems] = useState(false)

  // Buat SJ form
  const [makingSjId, setMakingSjId] = useState<number | null>(null)
  const [sjDriverId, setSjDriverId] = useState('')
  const [sjPlat, setSjPlat]         = useState('')
  const [submittingSj, setSubmittingSj] = useState(false)

  // Action spinners
  const [updatingId, setUpdatingId]     = useState<number | null>(null)
  const [updatingSjId, setUpdatingSjId] = useState<number | null>(null)

  // ── Auth ────────────────────────────────────────────────────
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUser(data.user ?? null))
  }, [])
  useEffect(() => {
    if (user === null) window.location.href = '/'
  }, [user])

  // ── Load data ────────────────────────────────────────────────
  const loadAntaran = useCallback(async () => {
    const { data, error: err } = await sb
      .from('sales')
      .select(`
        id, code, total, pay_method, pay_status, created_at,
        customer:customers(id, name, phone, address),
        surat_jalan(id, code, status, plat, created_at, driver:drivers(name))
      `)
      .eq('fulfillment', 'antar')
      .eq('voided', false)
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) setError(err.message)
    else setAntaRanSales((data ?? []) as unknown as SaleAntar[])
  }, [sb])

  const loadBelumLunas = useCallback(async () => {
    const { data, error: err } = await sb
      .from('sales')
      .select(`
        id, code, total, pay_method, pay_status, fulfillment, created_at,
        customer:customers(name)
      `)
      .eq('pay_status', 'belum')
      .eq('voided', false)
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) setError(err.message)
    else setBelumLunasSales((data ?? []) as unknown as SaleBelumLunas[])
  }, [sb])

  const loadDrivers = useCallback(async () => {
    const { data } = await sb.from('drivers').select('id, name').eq('active', true).order('name')
    setDrivers(data ?? [])
  }, [sb])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([loadAntaran(), loadBelumLunas(), loadDrivers()]).then(() => setLoading(false))
  }, [user, loadAntaran, loadBelumLunas, loadDrivers])

  // ── Expand & fetch items ─────────────────────────────────────
  async function toggleExpand(saleId: number) {
    if (expandedId === saleId) { setExpandedId(null); return }
    setExpandedId(saleId)
    if (itemsCache[saleId]) return

    setLoadingItems(true)
    const { data } = await sb
      .from('sale_items')
      .select(`
        id, qty, base_qty, unit_price, subtotal,
        product:products(name),
        unit:product_units(unit_name)
      `)
      .eq('sale_id', saleId)
    setItemsCache(c => ({ ...c, [saleId]: (data ?? []) as unknown as SaleItem[] }))
    setLoadingItems(false)
  }

  // ── Buat surat jalan ────────────────────────────────────────
  async function createSuratJalan(saleId: number) {
    const items = itemsCache[saleId]
    if (!items || items.length === 0 || !user) return
    setSubmittingSj(true); setError(null)

    const { data: sj, error: err } = await sb
      .from('surat_jalan')
      .insert({
        sale_id:    saleId,
        driver_id:  sjDriverId ? parseInt(sjDriverId) : null,
        plat:       sjPlat.trim() || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (err || !sj) { setError(err?.message ?? 'Gagal buat surat jalan'); setSubmittingSj(false); return }

    await sb.from('surat_jalan_lines').insert(
      items.map(item => ({
        surat_jalan_id: sj.id,
        sale_item_id:   item.id,
        base_qty:       item.base_qty,
      }))
    )

    setMakingSjId(null); setSjDriverId(''); setSjPlat('')
    setSubmittingSj(false)
    loadAntaran()
  }

  // ── Tandai terkirim ─────────────────────────────────────────
  async function markTerkirim(sjId: number) {
    setUpdatingSjId(sjId); setError(null)
    const { error: err } = await sb.from('surat_jalan').update({ status: 'terkirim' }).eq('id', sjId)
    if (err) setError(err.message)
    else loadAntaran()
    setUpdatingSjId(null)
  }

  // ── Toggle pay_status ────────────────────────────────────────
  async function togglePayStatus(saleId: number, current: string) {
    setUpdatingId(saleId); setError(null)
    const next = current === 'lunas' ? 'belum' : 'lunas'
    const { error: err } = await sb.from('sales').update({ pay_status: next }).eq('id', saleId)
    if (err) setError(err.message)
    else { await loadAntaran(); await loadBelumLunas() }
    setUpdatingId(null)
  }

  // ── Render guard ─────────────────────────────────────────────
  if (user === undefined || user === null) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    )
  }

  const pendingAntaran = antaRanSales.filter(s => deliveryStatus(s.surat_jalan) !== 'terkirim').length
  const totalBelumLunas = belumLunasSales.length

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col select-none">

      {/* Header */}
      <div className="flex items-center px-4 py-3 bg-gray-900 border-b border-white/10 shrink-0 gap-4">
        <a href="/" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">← POS</a>
        <span className="text-white font-bold text-base flex-1">Dashboard Admin</span>
        <a href="/history" className="text-gray-400 hover:text-white text-sm font-medium transition-colors">Riwayat</a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 px-4 py-2.5 bg-gray-900/50 border-b border-white/10 shrink-0">
        {([
          ['antaran',     'Antaran',     pendingAntaran,   'bg-amber-500 text-black'],
          ['belum_lunas', 'Belum Lunas', totalBelumLunas,  'bg-red-500 text-white'],
        ] as [Tab, string, number, string][]).map(([v, label, count, badgeCls]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === v ? 'bg-indigo-600 text-white' : 'bg-white/8 text-gray-400 hover:bg-white/15'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${badgeCls}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-2">

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm flex items-start justify-between gap-2">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="shrink-0 opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {loading ? (
            <p className="text-gray-500 text-center mt-12 text-sm">Memuat data...</p>
          ) : tab === 'antaran' ? (

            /* ── TAB ANTARAN ── */
            antaRanSales.length === 0 ? (
              <p className="text-gray-600 text-center mt-12 text-sm">Belum ada transaksi pengiriman</p>
            ) : (
              antaRanSales.map(sale => {
                const djStatus   = deliveryStatus(sale.surat_jalan)
                const activeSj   = sale.surat_jalan.find(s => s.status === 'dimuat') ?? sale.surat_jalan[0] ?? null
                const isExpanded = expandedId === sale.id
                const isMakingSj = makingSjId === sale.id
                const items      = itemsCache[sale.id]

                return (
                  <div
                    key={sale.id}
                    className={`border rounded-2xl transition-colors ${
                      isExpanded
                        ? 'bg-gray-900 border-indigo-500/40'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    {/* Card header */}
                    <button className="w-full text-left p-4" onClick={() => toggleExpand(sale.id)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">

                          {/* Badges row */}
                          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                            <span className="text-white font-mono text-sm font-bold">{sale.code}</span>

                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                              djStatus === 'terkirim'
                                ? 'bg-green-500/20 text-green-400'
                                : djStatus === 'dimuat'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-white/10 text-gray-500'
                            }`}>
                              {djStatus === 'terkirim' ? 'Terkirim' : djStatus === 'dimuat' ? 'Dimuat' : 'Belum SJ'}
                            </span>

                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                              sale.pay_status === 'lunas'
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-amber-500/20 text-amber-400'
                            }`}>{sale.pay_status}</span>

                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-white/10 text-gray-400">
                              {PAY_LABEL[sale.pay_method] ?? sale.pay_method}
                            </span>
                          </div>

                          {/* Info row */}
                          <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-wrap">
                            <span>{fmtDate(sale.created_at)}</span>
                            {sale.customer && (
                              <><span>·</span><span className="text-gray-400 font-medium">{sale.customer.name}</span></>
                            )}
                            {sale.customer?.phone && (
                              <><span>·</span><span>{sale.customer.phone}</span></>
                            )}
                            {sale.customer?.address && (
                              <><span>·</span><span className="text-gray-600 truncate max-w-40">{sale.customer.address}</span></>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-white font-bold text-base">{rp(sale.total)}</span>
                          <span className="text-gray-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-white/10 px-4 pb-4 space-y-3">

                        {/* Items table */}
                        {loadingItems && !items ? (
                          <p className="text-gray-500 text-xs text-center py-3">Memuat item...</p>
                        ) : items && items.length > 0 ? (
                          <table className="w-full mt-3 text-sm">
                            <thead>
                              <tr className="text-gray-600 text-xs uppercase tracking-wide">
                                <th className="text-left pb-2 font-medium">Produk</th>
                                <th className="text-right pb-2 font-medium">Qty</th>
                                <th className="text-right pb-2 font-medium">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {items.map(item => (
                                <tr key={item.id}>
                                  <td className="py-2 text-white pr-3">{item.product?.name ?? '—'}</td>
                                  <td className="py-2 text-gray-400 text-right whitespace-nowrap">
                                    {fmtQty(item.qty)} {item.unit?.unit_name ?? ''}
                                  </td>
                                  <td className="py-2 text-indigo-300 font-semibold text-right whitespace-nowrap">
                                    {rp(item.subtotal)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-white/10">
                                <td colSpan={2} className="pt-2 text-gray-600 text-xs">Total</td>
                                <td className="pt-2 text-white font-bold text-right">{rp(sale.total)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        ) : null}

                        {/* SJ info strip */}
                        {activeSj && (
                          <div className="px-3 py-2 bg-white/5 rounded-xl text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                            <span className="text-white font-mono font-semibold">{activeSj.code}</span>
                            {activeSj.driver?.name && <span>· {activeSj.driver.name}</span>}
                            {activeSj.plat && <span className="text-gray-300 font-medium">· {activeSj.plat}</span>}
                            <span className="text-gray-700">· {fmtDateTime(activeSj.created_at)}</span>
                          </div>
                        )}

                        {/* Buat SJ inline form */}
                        {isMakingSj && (
                          <div className="border border-indigo-500/30 rounded-xl p-3 bg-indigo-500/5 space-y-2">
                            <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wide">Buat Surat Jalan</p>
                            <select
                              value={sjDriverId}
                              onChange={e => setSjDriverId(e.target.value)}
                              className="w-full bg-white/8 border border-white/10 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">— Pengemudi (opsional) —</option>
                              {drivers.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={sjPlat}
                              onChange={e => setSjPlat(e.target.value)}
                              placeholder="Plat kendaraan (cth: B 1234 XX)"
                              className="w-full bg-white/8 border border-white/10 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => setMakingSjId(null)}
                                className="flex-1 py-2 rounded-xl bg-white/5 text-gray-400 text-sm hover:bg-white/10 transition-colors"
                              >
                                Batal
                              </button>
                              <button
                                onClick={() => createSuratJalan(sale.id)}
                                disabled={submittingSj || !items || items.length === 0}
                                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-40"
                              >
                                {submittingSj ? 'Membuat...' : 'Buat SJ →'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 pt-1">

                          {/* Toggle pay status */}
                          <button
                            onClick={() => togglePayStatus(sale.id, sale.pay_status)}
                            disabled={updatingId === sale.id}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${
                              sale.pay_status === 'lunas'
                                ? 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                            }`}
                          >
                            {updatingId === sale.id ? '...'
                              : sale.pay_status === 'lunas' ? '✓ Lunas · Ubah ke Belum' : 'Tandai Lunas'}
                          </button>

                          {/* Buat SJ */}
                          {djStatus === 'none' && !isMakingSj && (
                            <button
                              onClick={() => { setMakingSjId(sale.id); setSjDriverId(''); setSjPlat('') }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 transition-colors"
                            >
                              + Buat Surat Jalan
                            </button>
                          )}

                          {/* Tandai terkirim */}
                          {djStatus === 'dimuat' && activeSj && (
                            <button
                              onClick={() => markTerkirim(activeSj.id)}
                              disabled={updatingSjId === activeSj.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
                            >
                              {updatingSjId === activeSj.id ? '...' : '✓ Tandai Terkirim'}
                            </button>
                          )}

                          {/* Cetak SJ */}
                          {activeSj && items && items.length > 0 && (
                            <button
                              onClick={() => printSJ(activeSj, sale, sale.customer, items)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/8 text-gray-300 border border-white/15 hover:bg-white/15 transition-colors"
                            >
                              🖨 Cetak SJ
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )

          ) : (

            /* ── TAB BELUM LUNAS ── */
            belumLunasSales.length === 0 ? (
              <p className="text-gray-600 text-center mt-12 text-sm">Semua transaksi sudah lunas 🎉</p>
            ) : (
              belumLunasSales.map(sale => (
                <div
                  key={sale.id}
                  className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-white font-mono text-sm font-bold">{sale.code}</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-white/10 text-gray-400">
                        {PAY_LABEL[sale.pay_method] ?? sale.pay_method}
                      </span>
                      {sale.fulfillment === 'antar' && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400">Antar</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span>{fmtDate(sale.created_at)}</span>
                      {sale.customer?.name && (
                        <><span>·</span><span className="text-gray-400">{sale.customer.name}</span></>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-white font-bold">{rp(sale.total)}</span>
                    <button
                      onClick={() => togglePayStatus(sale.id, sale.pay_status)}
                      disabled={updatingId === sale.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors disabled:opacity-40 whitespace-nowrap"
                    >
                      {updatingId === sale.id ? '...' : 'Tandai Lunas'}
                    </button>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  )
}
