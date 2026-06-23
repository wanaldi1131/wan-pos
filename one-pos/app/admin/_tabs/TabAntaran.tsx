'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { SaleAntar, SaleItem, SuratJalanRec, Customer, Driver } from '../_types'
import { rp, fmtDate, fmtDateTime, fmtQty, PAY_LABEL } from '../_helpers'

// ── Helpers ────────────────────────────────────────────────────

function hasPendingDispatch(sale: SaleAntar): boolean {
  const totalBase      = sale.sale_items.reduce((s, i) => s + Number(i.base_qty), 0)
  const dispatchedBase = sale.surat_jalan
    .flatMap(sj => sj.surat_jalan_lines ?? [])
    .reduce((s, l) => s + Number(l.base_qty), 0)
  return dispatchedBase < totalBase || sale.surat_jalan.some(sj => sj.status === 'dimuat')
}

function getItemDispatch(item: SaleItem, sjs: SuratJalanRec[]) {
  const factor       = item.base_qty / item.qty
  let dispatchedBase = 0
  let deliveredBase  = 0
  for (const sj of sjs) {
    for (const line of sj.surat_jalan_lines ?? []) {
      if (line.sale_item_id === item.id) {
        dispatchedBase += Number(line.base_qty)
        if (sj.status === 'terkirim') deliveredBase += Number(line.base_qty)
      }
    }
  }
  const dispatched = factor > 0 ? dispatchedBase / factor : 0
  const delivered  = factor > 0 ? deliveredBase  / factor : 0
  return { dispatched, delivered, pending: item.qty - dispatched }
}

function printSJ(
  sj: SuratJalanRec,
  sale: Pick<SaleAntar, 'code' | 'pay_method' | 'total' | 'delivery_address'>,
  customer: Customer | null,
  allItems: SaleItem[],
) {
  const sjLines = sj.surat_jalan_lines ?? []
  const items = allItems
    .filter(item => sjLines.some(l => l.sale_item_id === item.id))
    .map(item => {
      const line   = sjLines.find(l => l.sale_item_id === item.id)!
      const factor = item.base_qty > 0 ? item.base_qty / item.qty : 1
      return { ...item, qty: Number(line.base_qty) / factor }
    })

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
    ${(sale.delivery_address ?? customer?.address) ? `<div class="val">${sale.delivery_address ?? customer?.address}</div>` : ''}
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

export default function TabAntaran({
  user,
  isAdmin,
  onCountChange,
}: {
  user: User
  isAdmin: boolean
  onCountChange: (n: number) => void
}) {
  const sb = createClient()

  const [sales, setSales]           = useState<SaleAntar[]>([])
  const [drivers, setDrivers]       = useState<Driver[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')

  const [expandedId, setExpandedId]   = useState<number | null>(null)
  const [itemsCache, setItemsCache]   = useState<Record<number, SaleItem[]>>({})
  const [loadingItems, setLoadingItems] = useState(false)

  const [makingSjId, setMakingSjId]   = useState<number | null>(null)
  const [sjDriverId, setSjDriverId]   = useState('')
  const [sjPlat, setSjPlat]           = useState('')
  const [sjItemQtys, setSjItemQtys]   = useState<Record<number, number>>({})
  const [submittingSj, setSubmittingSj] = useState(false)

  const [updatingId, setUpdatingId]     = useState<number | null>(null)
  const [updatingSjId, setUpdatingSjId] = useState<number | null>(null)

  const load = useCallback(async () => {
    const { data, error: err } = await sb
      .from('sales')
      .select(`
        id, code, total, pay_method, pay_status, created_at, delivery_address,
        customer:customers(id, name, phone, address),
        surat_jalan(id, code, status, plat, created_at, driver:drivers(name), surat_jalan_lines(sale_item_id, base_qty)),
        sale_items(id, base_qty)
      `)
      .eq('fulfillment', 'antar')
      .eq('voided', false)
      .order('created_at', { ascending: false })
      .limit(100)
    if (err) { setError(err.message); return }
    const rows = (data ?? []) as unknown as SaleAntar[]
    setSales(rows)
    onCountChange(rows.filter(hasPendingDispatch).length)
  }, [sb, onCountChange])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      load(),
      sb.from('drivers').select('id, name').eq('active', true).order('name').then(({ data }) => setDrivers(data ?? [])),
    ]).then(() => setLoading(false))
  }, [load, sb])

  async function toggleExpand(saleId: number) {
    if (expandedId === saleId) { setExpandedId(null); return }
    setExpandedId(saleId)
    if (itemsCache[saleId]) return
    setLoadingItems(true)
    const { data } = await sb.from('sale_items')
      .select('id, qty, base_qty, unit_price, subtotal, product:products(name), unit:product_units(unit_name)')
      .eq('sale_id', saleId)
    setItemsCache(c => ({ ...c, [saleId]: (data ?? []) as unknown as SaleItem[] }))
    setLoadingItems(false)
  }

  async function createSuratJalan(sale: SaleAntar) {
    const items = itemsCache[sale.id]
    if (!items || items.length === 0 || !user) return
    setSubmittingSj(true); setError(null)

    const sjItems = items
      .map(item => {
        const { pending } = getItemDispatch(item, sale.surat_jalan)
        const qty = sjItemQtys[item.id] ?? pending
        if (qty <= 0) return null
        return { sale_item_id: item.id, base_qty: qty * (item.base_qty > 0 ? item.base_qty / item.qty : 1) }
      })
      .filter(Boolean)

    if (sjItems.length === 0) { setError('Tidak ada item yang dipilih'); setSubmittingSj(false); return }

    const { error: err } = await sb.rpc('create_surat_jalan', {
      p_sale_id: sale.id, p_driver_id: sjDriverId ? parseInt(sjDriverId) : null,
      p_plat: sjPlat.trim() || null, p_created_by: user.id, p_items: sjItems,
    })
    if (err) { setError(err.message); setSubmittingSj(false); return }
    setMakingSjId(null); setSjDriverId(''); setSjPlat(''); setSjItemQtys({})
    setSubmittingSj(false); load()
  }

  async function markTerkirim(sjId: number) {
    setUpdatingSjId(sjId); setError(null)
    const { error: err } = await sb.rpc('mark_sj_terkirim', { p_sj_id: sjId })
    if (err) setError(err.message)
    else load()
    setUpdatingSjId(null)
  }

  async function togglePayStatus(saleId: number, current: string) {
    setUpdatingId(saleId); setError(null)
    const next = current === 'lunas' ? 'belum' : 'lunas'
    const { error: err } = await sb.from('sales').update({
      pay_status: next, paid_at: next === 'lunas' ? new Date().toISOString() : null,
    }).eq('id', saleId)
    if (err) setError(err.message)
    else load()
    setUpdatingId(null)
  }

  const displayed = sales.filter(hasPendingDispatch)
  const filtered  = search.trim()
    ? displayed.filter(s => {
        const q = search.toLowerCase()
        return s.code.toLowerCase().includes(q) || (s.customer?.name ?? '').toLowerCase().includes(q)
      })
    : displayed

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

      {displayed.length === 0 ? (
        <p className="text-gray-500 text-center mt-10 text-base">Semua pengiriman sudah terkirim 🎉</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-center mt-10 text-base">Tidak ditemukan: &ldquo;{search}&rdquo;</p>
      ) : (
        filtered.map(sale => {
          const isExpanded   = expandedId === sale.id
          const isMakingSj   = makingSjId === sale.id
          const items        = itemsCache[sale.id]
          const anyDispatched = items ? items.some(it => getItemDispatch(it, sale.surat_jalan).dispatched > 0) : false
          const anyPending    = items ? items.some(it => getItemDispatch(it, sale.surat_jalan).pending > 0) : hasPendingDispatch(sale)

          return (
            <div key={sale.id} className={`border rounded-2xl transition-colors ${isExpanded ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-200 hover:border-gray-300'}`}>
              <button className="w-full text-left p-4" onClick={() => toggleExpand(sale.id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      <span className="text-gray-900 font-mono text-base font-bold">{sale.code}</span>
                      {sale.surat_jalan.length === 0 ? (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">Belum SJ</span>
                      ) : sale.surat_jalan.some(sj => sj.status === 'dimuat') ? (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400">
                          Dimuat{sale.surat_jalan.length > 1 ? ` (${sale.surat_jalan.length} SJ)` : ''}
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-green-500/20 text-green-600">
                          Terkirim{anyPending ? ' (Sebagian)' : ''}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${sale.pay_status === 'lunas' ? 'bg-green-500/20 text-green-600' : 'bg-amber-500/20 text-amber-600'}`}>
                        {sale.pay_status}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500">
                        {PAY_LABEL[sale.pay_method] ?? sale.pay_method}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap">
                      <span>{fmtDate(sale.created_at)}</span>
                      {sale.customer && <><span>·</span><span className="font-medium">{sale.customer.name}</span></>}
                      {sale.customer?.phone && <><span>·</span><span>{sale.customer.phone}</span></>}
                      {sale.delivery_address && <><span>·</span><span className="truncate max-w-40">{sale.delivery_address}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-gray-900 font-bold text-base">{rp(sale.total)}</span>
                    <span className="text-gray-500 text-sm">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-200 px-4 pb-4 space-y-3">
                  {loadingItems && !items ? (
                    <p className="text-gray-500 text-sm text-center py-3">Memuat item...</p>
                  ) : items && items.length > 0 && (
                    <table className="w-full mt-3 text-base">
                      <thead>
                        <tr className="text-gray-500 text-sm uppercase tracking-wide">
                          <th className="text-left pb-2 font-medium">Produk</th>
                          <th className="text-right pb-2 font-medium">Qty</th>
                          {anyDispatched && <th className="text-right pb-2 font-medium">Dikirim</th>}
                          {anyDispatched && <th className="text-right pb-2 font-medium text-amber-500">Sisa</th>}
                          <th className="text-right pb-2 font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map(item => {
                          const { dispatched, pending } = getItemDispatch(item, sale.surat_jalan)
                          const unitName = item.unit?.unit_name ?? ''
                          return (
                            <tr key={item.id}>
                              <td className="py-2 text-gray-900 pr-3">{item.product?.name ?? '—'}</td>
                              <td className="py-2 text-gray-500 text-right whitespace-nowrap">{fmtQty(item.qty)} {unitName}</td>
                              {anyDispatched && <td className="py-2 text-blue-400 text-right whitespace-nowrap">{dispatched > 0 ? `${fmtQty(dispatched)} ${unitName}` : '—'}</td>}
                              {anyDispatched && <td className={`py-2 text-right whitespace-nowrap font-semibold ${pending > 0 ? 'text-amber-600' : 'text-gray-500'}`}>{pending > 0 ? `${fmtQty(pending)} ${unitName}` : '✓'}</td>}
                              <td className="py-2 text-orange-600 font-semibold text-right whitespace-nowrap">{rp(item.subtotal)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-200">
                          <td colSpan={anyDispatched ? 4 : 2} className="pt-2 text-gray-500 text-sm">Total</td>
                          <td className="pt-2 text-gray-900 font-bold text-right">{rp(sale.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  )}

                  {sale.surat_jalan.length > 0 && (
                    <div className="space-y-2 mt-1">
                      <p className="text-gray-500 text-sm uppercase tracking-wide font-semibold">Surat Jalan</p>
                      {[...sale.surat_jalan].sort((a, b) => a.created_at.localeCompare(b.created_at)).map(sj => (
                        <div key={sj.id} className={`px-3 py-2 rounded-xl text-sm flex items-center gap-2 flex-wrap ${sj.status === 'terkirim' ? 'bg-green-500/8 border border-green-500/20' : 'bg-white border border-gray-200'}`}>
                          <span className={`font-mono font-semibold ${sj.status === 'terkirim' ? 'text-green-600' : 'text-gray-900'}`}>{sj.code}</span>
                          {sj.driver?.name && <span className="text-gray-500">· {sj.driver.name}</span>}
                          {sj.plat && <span className="text-gray-400 font-medium">· {sj.plat}</span>}
                          <span className="text-gray-700">· {fmtDateTime(sj.created_at)}</span>
                          <span className={`ml-auto text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${sj.status === 'terkirim' ? 'bg-green-500/20 text-green-600' : 'bg-blue-500/20 text-blue-400'}`}>
                            {sj.status === 'terkirim' ? 'Terkirim' : 'Dimuat'}
                          </span>
                          {items && items.length > 0 && (
                            <button onClick={() => printSJ(sj, sale, sale.customer, items)}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                              🖨 Cetak
                            </button>
                          )}
                          {isAdmin && sj.status === 'dimuat' && (
                            <button onClick={() => markTerkirim(sj.id)} disabled={updatingSjId === sj.id}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-40">
                              {updatingSjId === sj.id ? '...' : '✓ Terkirim'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {isMakingSj && items && (
                    <div className="border border-orange-500/30 rounded-xl p-3 bg-orange-50 space-y-2.5">
                      <p className="text-orange-600 text-sm font-semibold uppercase tracking-wide">Buat Surat Jalan Baru</p>
                      <div className="divide-y divide-gray-100">
                        {items.map(item => {
                          const { pending } = getItemDispatch(item, sale.surat_jalan)
                          if (pending <= 0) return null
                          const unitName   = item.unit?.unit_name ?? ''
                          const currentQty = sjItemQtys[item.id] ?? pending
                          const setQty = (v: number) => setSjItemQtys(prev => ({ ...prev, [item.id]: Math.max(0, Math.min(v, pending)) }))
                          return (
                            <div key={item.id} className="py-3 flex items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-gray-900 text-base font-medium truncate">{item.product?.name ?? '—'}</p>
                                <p className="text-gray-500 text-sm mt-0.5">sisa {fmtQty(pending)} {unitName}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => setQty(currentQty - 1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 text-base flex items-center justify-center">−</button>
                                <input
                                  type="number" inputMode="decimal" min={0} max={pending} step="any"
                                  value={currentQty === 0 ? '' : currentQty} placeholder="0"
                                  onChange={e => { const v = parseFloat(e.target.value); setQty(isNaN(v) ? 0 : v) }}
                                  onFocus={e => e.target.select()}
                                  className="w-16 text-gray-900 text-base text-center bg-gray-100 border border-gray-300 focus:border-orange-500 rounded-lg h-7 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <button onClick={() => setQty(currentQty + 1)} className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-900 text-base flex items-center justify-center">+</button>
                                <span className="text-gray-500 text-sm w-10 text-right">{unitName}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <select value={sjDriverId} onChange={e => setSjDriverId(e.target.value)}
                        className="w-full bg-gray-100 border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-500">
                        <option value="">— Pengemudi (opsional) —</option>
                        {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <input type="text" value={sjPlat} onChange={e => setSjPlat(e.target.value)}
                        placeholder="Plat kendaraan (cth: B 1234 XX)"
                        className="w-full bg-gray-100 border border-gray-200 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => { setMakingSjId(null); setSjItemQtys({}) }}
                          className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-500 text-base hover:bg-gray-200 transition-colors">Batal</button>
                        <button onClick={() => createSuratJalan(sale)} disabled={submittingSj}
                          className="flex-1 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-base font-semibold transition-colors disabled:opacity-40">
                          {submittingSj ? 'Membuat...' : 'Buat SJ →'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {isAdmin && (
                      <button onClick={() => togglePayStatus(sale.id, sale.pay_status)} disabled={updatingId === sale.id}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40 ${
                          sale.pay_status === 'lunas'
                            ? 'bg-green-500/10 text-green-600 border-green-500/30 hover:bg-green-500/20'
                            : 'bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20'
                        }`}>
                        {updatingId === sale.id ? '...' : sale.pay_status === 'lunas' ? '✓ Lunas · Ubah ke Belum' : 'Tandai Lunas'}
                      </button>
                    )}
                    {isAdmin && anyPending && !isMakingSj && (
                      <button
                        onClick={() => {
                          if (!items) return
                          const initQtys: Record<number, number> = {}
                          for (const it of items) {
                            const { pending } = getItemDispatch(it, sale.surat_jalan)
                            if (pending > 0) initQtys[it.id] = pending
                          }
                          setSjItemQtys(initQtys); setMakingSjId(sale.id); setSjDriverId(''); setSjPlat('')
                        }}
                        className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-orange-50 text-orange-500 border border-orange-500/30 hover:bg-orange-500/20 transition-colors"
                      >
                        + Buat Surat Jalan{sale.surat_jalan.length > 0 ? ' Baru' : ''}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </>
  )
}
