'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────
type Driver = { id: number; name: string }

type SuratJalanLine = { sale_item_id: number; base_qty: number }

type SuratJalanRec = {
  id: number
  code: string
  status: 'dimuat' | 'terkirim'
  plat: string | null
  created_at: string
  driver: { name: string } | null
  surat_jalan_lines: SuratJalanLine[]
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
  delivery_address: string | null
  customer: Customer | null
  surat_jalan: SuratJalanRec[]
  sale_items: { id: number; base_qty: number }[]
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

type Tab = 'antaran' | 'belum_lunas' | 'kasir' | 'pendapatan' | 'kas_tunai' | 'produk' | 'kategori'

type KasTunaiDay = {
  date: string
  total: number; count: number
  tunai_count: number; tunai_total: number
  transfer_count: number; transfer_total: number
  hutang_count: number; hutang_total: number
  retur_tunai: number; retur_transfer: number   // kas keluar karena refund
}

type KasTunaiInvoice = {
  id: number
  code: string
  total: number         // positif = masuk, negatif = retur keluar
  pay_method: string    // pay_method untuk sale, refund_method untuk retur
  paid_at: string
  customer_name: string | null
  is_hutang: boolean
  is_retur: boolean
}

type DailyRevenue = {
  date: string        // YYYY-MM-DD
  txn_count: number
  total: number       // gross penjualan
  retur: number       // total retur
  net: number         // total - retur
  tunai: number
  transfer: number
  cod: number
  kredit: number
  tunai_count: number
  transfer_count: number
  cod_count: number
  kredit_count: number
  belum_count: number
}

type KasirProfile = {
  id: string
  full_name: string
  staff_code: string | null
  email_login: string | null
  active: boolean
  created_at: string
}

type ProductUnit = {
  id: number
  unit_name: string
  factor_to_base: number
  price: number
  price_toko: number | null
  is_default: boolean
}

type ProductFull = {
  id: number
  name: string
  base_unit: string
  sku: string | null
  category: string | null
  active: boolean
  product_units: ProductUnit[]
}

type UnitFormRow = {
  id?: number
  unit_name: string
  factor_to_base: string
  price: string
  price_toko: string
  is_default: boolean
}

type Category = {
  id: number
  name: string
  product_count: number
}

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

function hasPendingDispatch(sale: SaleAntar): boolean {
  const totalBase      = sale.sale_items.reduce((s, i) => s + Number(i.base_qty), 0)
  const dispatchedBase = sale.surat_jalan
    .flatMap(sj => sj.surat_jalan_lines ?? [])
    .reduce((s, l) => s + Number(l.base_qty), 0)
  return dispatchedBase < totalBase || sale.surat_jalan.some(sj => sj.status === 'dimuat')
}

function getItemDispatch(item: SaleItem, sjs: SuratJalanRec[]) {
  const factor         = item.base_qty / item.qty
  let dispatchedBase   = 0
  let deliveredBase    = 0
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
  const pending    = item.qty - dispatched
  return { dispatched, delivered, pending }
}

// ── Print surat jalan ──────────────────────────────────────────
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
      const sjQty  = Number(line.base_qty) / factor
      return { ...item, qty: sjQty }
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
export default function AdminPage() {
  const sb = createClient()

  const [user, setUser]             = useState<User | null | undefined>(undefined)
  const [userRole, setUserRole]     = useState<string | null>(null)
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
  const [makingSjId, setMakingSjId]   = useState<number | null>(null)
  const [sjDriverId, setSjDriverId]   = useState('')
  const [sjPlat, setSjPlat]           = useState('')
  const [sjItemQtys, setSjItemQtys]   = useState<Record<number, number>>({})
  const [submittingSj, setSubmittingSj] = useState(false)

  // Action spinners
  const [updatingId, setUpdatingId]     = useState<number | null>(null)
  const [updatingSjId, setUpdatingSjId] = useState<number | null>(null)

  // Search
  const [pengirimanSearch, setPengirimanSearch] = useState('')
  const [belumLunasSearch, setBelumLunasSearch] = useState('')

  // Kasir list + detail
  const [kasirList, setKasirList]           = useState<KasirProfile[]>([])
  const [loadingKasirList, setLoadingKasirList] = useState(false)
  const [selectedKasir, setSelectedKasir]   = useState<KasirProfile | null>(null)
  const [togglingId, setTogglingId]         = useState<string | null>(null)
  const [showForm, setShowForm]             = useState(false)

  // Pendapatan
  const [pendapatanData, setPendapatanData]           = useState<DailyRevenue[]>([])
  const [loadingPendapatan, setLoadingPendapatan]     = useState(false)
  const [expandedPendapatan, setExpandedPendapatan]   = useState<string | null>(null)

  // Kas Tunai
  const [kasTunaiData, setKasTunaiData]               = useState<KasTunaiDay[]>([])
  const [loadingKasTunai, setLoadingKasTunai]         = useState(false)
  const [kasTunaiError, setKasTunaiError]             = useState<string | null>(null)
  const [expandedKasTunai, setExpandedKasTunai]       = useState<string | null>(null)
  const [kasTunaiInvoices, setKasTunaiInvoices]       = useState<Record<string, KasTunaiInvoice[]>>({})
  const [loadingKasTunaiDetail, setLoadingKasTunaiDetail] = useState<string | null>(null)

  // Tambah kasir form
  const [kasirName, setKasirName]       = useState('')
  const [kasirCode, setKasirCode]       = useState('')
  const [kasirEmail, setKasirEmail]     = useState('')
  const [kasirPin, setKasirPin]         = useState('')
  const [kasirMsg, setKasirMsg]         = useState<{ ok: boolean; text: string } | null>(null)
  const [savingKasir, setSavingKasir]   = useState(false)

  // Produk
  const [products, setProducts]               = useState<ProductFull[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productSearch, setProductSearch]     = useState('')
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProduct, setEditingProduct]   = useState<ProductFull | null>(null)
  const [pName, setPName]                     = useState('')
  const [pBaseUnit, setPBaseUnit]             = useState('')
  const [pSku, setPSku]                       = useState('')
  const [pCategory, setPCategory]             = useState('')
  const [pUnits, setPUnits]                   = useState<UnitFormRow[]>([])
  const [savingProduct, setSavingProduct]     = useState(false)
  const [productMsg, setProductMsg]           = useState<{ ok: boolean; text: string } | null>(null)
  const [togglingProductId, setTogglingProductId] = useState<number | null>(null)
  const [productHasMore, setProductHasMore]       = useState(false)
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false)
  const productSentinelRef = useRef<HTMLDivElement>(null)

  // Kategori
  const [categories, setCategories]           = useState<Category[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [categoryError, setCategoryError]     = useState<string | null>(null)
  const [showAddCat, setShowAddCat]           = useState(false)
  const [newCatName, setNewCatName]           = useState('')
  const [editingCat, setEditingCat]           = useState<Category | null>(null)
  const [editCatName, setEditCatName]         = useState('')
  const [savingCat, setSavingCat]             = useState(false)
  const [deletingCatId, setDeletingCatId]     = useState<number | null>(null)

  // ── Auth ────────────────────────────────────────────────────
  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      setUser(data.user ?? null)
      if (data.user) {
        const { data: profile } = await sb
          .from('profiles').select('role').eq('id', data.user.id).single()
        setUserRole(profile?.role ?? null)
      }
    })
  }, [])
  useEffect(() => {
    if (user === null) window.location.href = '/'
  }, [user])

  // ── Load kasir list ──────────────────────────────────────────
  const loadKasirList = useCallback(async () => {
    setLoadingKasirList(true)
    const { data } = await sb
      .from('profiles')
      .select('id, full_name, staff_code, email_login, active, created_at')
      .eq('role', 'kasir')
      .order('created_at', { ascending: true })
    setKasirList(data ?? [])
    setLoadingKasirList(false)
  }, [sb])

  useEffect(() => {
    if (tab === 'kasir') loadKasirList()
  }, [tab, loadKasirList])

  const PROD_PAGE = 40

  const mergeUnits = (prods: any[], units: any[]): ProductFull[] =>
    prods.map(p => ({
      ...p,
      product_units: units
        .filter((u: any) => u.product_id === p.id)
        .map((u: any) => ({
          id: u.id, unit_name: u.unit_name,
          factor_to_base: Number(u.factor_to_base),
          price: Number(u.price),
          price_toko: u.price_toko != null ? Number(u.price_toko) : null,
          is_default: u.is_default,
        })),
    }))

  const loadProducts = useCallback(async (search: string) => {
    setLoadingProducts(true)
    setProducts([])
    setProductHasMore(false)

    let q = sb.from('products')
      .select('id, name, base_unit, sku, category, active')
      .order('name')
      .range(0, PROD_PAGE - 1)
    if (search.trim()) q = (q as any).ilike('name', `%${search.trim()}%`)

    const { data: prods } = await q
    if (!prods || prods.length === 0) { setLoadingProducts(false); return }

    const { data: units } = await sb.from('product_units')
      .select('id, product_id, unit_name, factor_to_base, price, price_toko, is_default')
      .in('product_id', prods.map((p: any) => p.id))
      .order('is_default', { ascending: false })

    setProducts(mergeUnits(prods, units ?? []))
    setProductHasMore(prods.length === PROD_PAGE)
    setLoadingProducts(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb])

  useEffect(() => {
    if (tab === 'produk' && user) loadProducts(productSearch)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user])

  useEffect(() => {
    if (tab !== 'produk' || !user) return
    const t = setTimeout(() => loadProducts(productSearch), 350)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch])

  async function loadMoreProducts() {
    if (loadingMoreProducts || !productHasMore) return
    setLoadingMoreProducts(true)
    const offset = products.length
    let q = sb.from('products')
      .select('id, name, base_unit, sku, category, active')
      .order('name')
      .range(offset, offset + PROD_PAGE - 1)
    if (productSearch.trim()) q = (q as any).ilike('name', `%${productSearch.trim()}%`)
    const { data: prods } = await q
    if (!prods || prods.length === 0) { setProductHasMore(false); setLoadingMoreProducts(false); return }
    const { data: units } = await sb.from('product_units')
      .select('id, product_id, unit_name, factor_to_base, price, price_toko, is_default')
      .in('product_id', prods.map((p: any) => p.id))
      .order('is_default', { ascending: false })
    setProducts(prev => [...prev, ...mergeUnits(prods, units ?? [])])
    setProductHasMore(prods.length === PROD_PAGE)
    setLoadingMoreProducts(false)
  }

  useEffect(() => {
    const el = productSentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreProducts() },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productHasMore, loadingMoreProducts, products.length])

  function openNewProductForm() {
    setEditingProduct(null)
    setPName(''); setPBaseUnit(''); setPSku(''); setPCategory('')
    setPUnits([{ unit_name: '', factor_to_base: '1', price: '', price_toko: '', is_default: true }])
    setProductMsg(null)
    setShowProductForm(true)
  }

  function openEditProductForm(p: ProductFull) {
    setEditingProduct(p)
    setPName(p.name)
    setPBaseUnit(p.base_unit)
    setPSku(p.sku ?? '')
    setPCategory(p.category ?? '')
    setPUnits(p.product_units.map(u => ({
      id: u.id,
      unit_name: u.unit_name,
      factor_to_base: String(u.factor_to_base),
      price: String(u.price),
      price_toko: u.price_toko != null ? String(u.price_toko) : '',
      is_default: u.is_default,
    })))
    setProductMsg(null)
    setShowProductForm(true)
  }

  async function saveProduct() {
    if (!pName.trim() || !pBaseUnit.trim()) {
      setProductMsg({ ok: false, text: 'Nama dan satuan dasar wajib diisi' })
      return
    }
    const validUnits = pUnits.filter(u => u.unit_name.trim() && u.price.trim())
    if (validUnits.length === 0) {
      setProductMsg({ ok: false, text: 'Minimal satu satuan jual harus diisi (nama + harga)' })
      return
    }
    const defaultCount = validUnits.filter(u => u.is_default).length
    if (defaultCount === 0) {
      setProductMsg({ ok: false, text: 'Pilih satu satuan sebagai default' })
      return
    }

    setSavingProduct(true)
    setProductMsg(null)

    if (editingProduct) {
      const { error: pErr } = await sb.from('products')
        .update({ name: pName.trim(), base_unit: pBaseUnit.trim(), sku: pSku.trim() || null, category: pCategory.trim() || null })
        .eq('id', editingProduct.id)
      if (pErr) { setProductMsg({ ok: false, text: pErr.message }); setSavingProduct(false); return }

      for (const u of validUnits) {
        const uData = {
          product_id: editingProduct.id,
          unit_name: u.unit_name.trim(),
          factor_to_base: parseFloat(u.factor_to_base) || 1,
          price: parseFloat(u.price) || 0,
          price_toko: u.price_toko.trim() ? parseFloat(u.price_toko) : null,
          is_default: u.is_default,
        }
        if (u.id) {
          const { error } = await sb.from('product_units').update(uData).eq('id', u.id)
          if (error) { setProductMsg({ ok: false, text: error.message }); setSavingProduct(false); return }
        } else {
          const { error } = await sb.from('product_units').insert(uData)
          if (error) { setProductMsg({ ok: false, text: error.message }); setSavingProduct(false); return }
        }
      }

      setProductMsg({ ok: true, text: `"${pName}" berhasil diperbarui` })
    } else {
      const { data: newProd, error: pErr } = await sb.from('products')
        .insert({ name: pName.trim(), base_unit: pBaseUnit.trim(), sku: pSku.trim() || null, category: pCategory.trim() || null, active: true })
        .select('id')
        .single()
      if (pErr || !newProd) { setProductMsg({ ok: false, text: pErr?.message ?? 'Gagal menyimpan' }); setSavingProduct(false); return }

      const unitRows = validUnits.map(u => ({
        product_id: (newProd as any).id,
        unit_name: u.unit_name.trim(),
        factor_to_base: parseFloat(u.factor_to_base) || 1,
        price: parseFloat(u.price) || 0,
        price_toko: u.price_toko.trim() ? parseFloat(u.price_toko) : null,
        is_default: u.is_default,
      }))
      const { error: uErr } = await sb.from('product_units').insert(unitRows)
      if (uErr) { setProductMsg({ ok: false, text: uErr.message }); setSavingProduct(false); return }

      setProductMsg({ ok: true, text: `Produk "${pName}" berhasil ditambahkan` })
    }

    setSavingProduct(false)
    loadProducts(productSearch)
    setTimeout(() => { setShowProductForm(false); setProductMsg(null) }, 1500)
  }

  async function toggleProductActive(p: ProductFull) {
    setTogglingProductId(p.id)
    await sb.from('products').update({ active: !p.active }).eq('id', p.id)
    setProducts(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x))
    setTogglingProductId(null)
  }

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true)
    setCategoryError(null)
    const [{ data: cats, error }, { data: prods }] = await Promise.all([
      sb.from('categories').select('id, name').order('name'),
      sb.from('products').select('category').not('category', 'is', null),
    ])
    if (error) { setCategoryError(error.message); setLoadingCategories(false); return }
    const countMap: Record<string, number> = {}
    for (const p of prods ?? []) {
      if (p.category) countMap[p.category] = (countMap[p.category] ?? 0) + 1
    }
    setCategories((cats ?? []).map((c: any) => ({ id: c.id, name: c.name, product_count: countMap[c.name] ?? 0 })))
    setLoadingCategories(false)
  }, [sb])

  useEffect(() => {
    if (tab === 'kategori' && user) loadCategories()
  }, [tab, user, loadCategories])

  async function addCategory() {
    const name = newCatName.trim()
    if (!name) return
    setSavingCat(true)
    const { error } = await sb.from('categories').insert({ name })
    setSavingCat(false)
    if (error) { setCategoryError(error.message); return }
    setNewCatName(''); setShowAddCat(false)
    loadCategories()
  }

  async function renameCategory() {
    if (!editingCat) return
    const name = editCatName.trim()
    if (!name || name === editingCat.name) { setEditingCat(null); return }
    setSavingCat(true)
    const { error } = await sb.from('categories').update({ name }).eq('id', editingCat.id)
    if (!error && editingCat.product_count > 0) {
      await sb.from('products').update({ category: name }).eq('category', editingCat.name)
    }
    setSavingCat(false)
    if (error) { setCategoryError(error.message); return }
    setEditingCat(null)
    loadCategories()
  }

  async function deleteCategory(cat: Category) {
    if (cat.product_count > 0) return
    setDeletingCatId(cat.id)
    await sb.from('categories').delete().eq('id', cat.id)
    setDeletingCatId(null)
    setCategories(prev => prev.filter(c => c.id !== cat.id))
  }

  async function toggleActive(kasir: KasirProfile) {
    setTogglingId(kasir.id)
    const { data } = await sb
      .from('profiles')
      .update({ active: !kasir.active })
      .eq('id', kasir.id)
      .select('id, full_name, staff_code, email_login, active, created_at')
      .single()
    setTogglingId(null)
    if (data) {
      setKasirList(prev => prev.map(k => k.id === kasir.id ? data : k))
      setSelectedKasir(data)
    }
  }

  // ── Load data ────────────────────────────────────────────────
  const loadAntaran = useCallback(async () => {
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

  const loadPendapatan = useCallback(async () => {
    setLoadingPendapatan(true)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [{ data: salesData }, { data: returnsData }] = await Promise.all([
      sb.from('sales')
        .select('created_at, total, pay_method, pay_status')
        .eq('voided', false)
        .gte('created_at', since)
        .order('created_at', { ascending: false }),
      sb.from('sale_returns')
        .select('created_at, total')
        .gte('created_at', since),
    ])

    const toKey = (iso: string) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    const map: Record<string, DailyRevenue> = {}
    const empty = (): DailyRevenue => ({
      date: '', txn_count: 0, total: 0, retur: 0, net: 0,
      tunai: 0, transfer: 0, cod: 0, kredit: 0,
      tunai_count: 0, transfer_count: 0, cod_count: 0, kredit_count: 0,
      belum_count: 0,
    })

    for (const s of salesData ?? []) {
      const key = toKey(s.created_at)
      if (!map[key]) { map[key] = { ...empty(), date: key } }
      const d = map[key]
      d.txn_count++
      d.total += Number(s.total)
      if (s.pay_method === 'tunai')          { d.tunai    += Number(s.total); d.tunai_count++ }
      else if (s.pay_method === 'transfer')  { d.transfer += Number(s.total); d.transfer_count++ }
      else if (s.pay_method === 'cod')       { d.cod      += Number(s.total); d.cod_count++ }
      else                                   { d.kredit   += Number(s.total); d.kredit_count++ }
      if (s.pay_status === 'belum') d.belum_count++
    }

    for (const r of returnsData ?? []) {
      const key = toKey(r.created_at)
      if (!map[key]) { map[key] = { ...empty(), date: key } }
      map[key].retur += Number(r.total)
    }

    const result = Object.values(map)
      .map(d => ({ ...d, net: d.total - d.retur }))
      .sort((a, b) => b.date.localeCompare(a.date))

    setPendapatanData(result)
    setLoadingPendapatan(false)
  }, [sb])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([loadAntaran(), loadBelumLunas(), loadDrivers()]).then(() => setLoading(false))
  }, [user, loadAntaran, loadBelumLunas, loadDrivers])

  useEffect(() => {
    if (tab === 'pendapatan' && user) loadPendapatan()
  }, [tab, user, loadPendapatan])

  const loadKasTunai = useCallback(async () => {
    setLoadingKasTunai(true)
    setKasTunaiError(null)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await sb
      .from('sales')
      .select('paid_at, total, pay_method')
      .not('paid_at', 'is', null)
      .gte('paid_at', since)
      .eq('voided', false)

    if (error) {
      setKasTunaiError(error.message)
      setLoadingKasTunai(false)
      return
    }

    const toKey = (iso: string) => {
      const d = new Date(iso)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    const { data: returData } = await sb
      .from('sale_returns')
      .select('created_at, total, refund_method')
      .in('refund_method', ['tunai', 'transfer'])
      .gte('created_at', since)

    const emptyDay = (key: string): KasTunaiDay => ({
      date: key, total: 0, count: 0,
      tunai_count: 0, tunai_total: 0,
      transfer_count: 0, transfer_total: 0,
      hutang_count: 0, hutang_total: 0,
      retur_tunai: 0, retur_transfer: 0,
    })

    const map: Record<string, KasTunaiDay> = {}
    for (const s of data ?? []) {
      const key = toKey(s.paid_at!)
      if (!map[key]) map[key] = emptyDay(key)
      const amt = Number(s.total)
      map[key].total += amt
      map[key].count++
      if (s.pay_method === 'tunai') { map[key].tunai_count++; map[key].tunai_total += amt }
      else if (s.pay_method === 'transfer') { map[key].transfer_count++; map[key].transfer_total += amt }
      else { map[key].hutang_count++; map[key].hutang_total += amt }
    }
    for (const r of returData ?? []) {
      const key = toKey(r.created_at)
      if (!map[key]) map[key] = emptyDay(key)
      const amt = Number(r.total)
      map[key].total -= amt
      if (r.refund_method === 'tunai') map[key].retur_tunai += amt
      else map[key].retur_transfer += amt
    }

    setKasTunaiData(
      Object.values(map).sort((a, b) => b.date.localeCompare(a.date))
    )
    setLoadingKasTunai(false)
  }, [sb])

  async function loadKasTunaiDetail(dateKey: string) {
    if (kasTunaiInvoices[dateKey]) return
    setLoadingKasTunaiDetail(dateKey)
    const [y, m, d] = dateKey.split('-').map(Number)
    const start = new Date(y, m - 1, d).toISOString()
    const end   = new Date(y, m - 1, d + 1).toISOString()

    const [{ data: sales }, { data: returns }] = await Promise.all([
      sb.from('sales')
        .select('id, code, total, pay_method, paid_at, customer:customers(name)')
        .gte('paid_at', start).lt('paid_at', end)
        .eq('voided', false)
        .order('paid_at', { ascending: true }),
      sb.from('sale_returns')
        .select('id, total, refund_method, created_at, sale:sales(code, customer:customers(name))')
        .in('refund_method', ['tunai', 'transfer'])
        .gte('created_at', start).lt('created_at', end)
        .order('created_at', { ascending: true }),
    ])

    const saleEntries: KasTunaiInvoice[] = (sales ?? []).map((s: any) => ({
      id:            s.id,
      code:          s.code,
      total:         Number(s.total),
      pay_method:    s.pay_method,
      paid_at:       s.paid_at,
      customer_name: s.customer?.name ?? null,
      is_hutang:     s.pay_method === 'cod' || s.pay_method === 'kredit',
      is_retur:      false,
    }))

    const returEntries: KasTunaiInvoice[] = (returns ?? []).map((r: any) => ({
      id:            r.id,
      code:          r.sale?.code ?? '—',
      total:         -Number(r.total),
      pay_method:    r.refund_method,
      paid_at:       r.created_at,
      customer_name: r.sale?.customer?.name ?? null,
      is_hutang:     false,
      is_retur:      true,
    }))

    const merged = [...saleEntries, ...returEntries]
      .sort((a, b) => a.paid_at.localeCompare(b.paid_at))

    setKasTunaiInvoices(prev => ({ ...prev, [dateKey]: merged }))
    setLoadingKasTunaiDetail(null)
  }

  useEffect(() => {
    if (tab === 'kas_tunai' && user) loadKasTunai()
  }, [tab, user, loadKasTunai])

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
  async function createSuratJalan(sale: SaleAntar) {
    const items = itemsCache[sale.id]
    if (!items || items.length === 0 || !user) return
    setSubmittingSj(true); setError(null)

    const sjItems = items
      .map(item => {
        const { pending } = getItemDispatch(item, sale.surat_jalan)
        const enteredQty  = sjItemQtys[item.id] ?? pending
        if (enteredQty <= 0) return null
        const factor    = item.base_qty > 0 ? item.base_qty / item.qty : 1
        const baseQty   = enteredQty * factor
        return { sale_item_id: item.id, base_qty: baseQty }
      })
      .filter(Boolean)

    if (sjItems.length === 0) {
      setError('Tidak ada item yang dipilih')
      setSubmittingSj(false)
      return
    }

    const { error: err } = await sb.rpc('create_surat_jalan', {
      p_sale_id:    sale.id,
      p_driver_id:  sjDriverId ? parseInt(sjDriverId) : null,
      p_plat:       sjPlat.trim() || null,
      p_created_by: user.id,
      p_items:      sjItems,
    })

    if (err) { setError(err.message); setSubmittingSj(false); return }

    setMakingSjId(null); setSjDriverId(''); setSjPlat(''); setSjItemQtys({})
    setSubmittingSj(false)
    loadAntaran()
  }

  // ── Tandai terkirim + kurangi stok (via RPC atomik) ─────────
  async function markTerkirim(sjId: number) {
    setUpdatingSjId(sjId); setError(null)
    const { error: err } = await sb.rpc('mark_sj_terkirim', { p_sj_id: sjId })
    if (err) setError(err.message)
    else loadAntaran()
    setUpdatingSjId(null)
  }

  // ── Toggle pay_status — set paid_at saat tandai lunas ───────
  async function togglePayStatus(saleId: number, current: string) {
    setUpdatingId(saleId); setError(null)
    const next = current === 'lunas' ? 'belum' : 'lunas'
    const { error: err } = await sb.from('sales')
      .update({
        pay_status: next,
        paid_at:    next === 'lunas' ? new Date().toISOString() : null,
      })
      .eq('id', saleId)
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

  const isAdmin             = userRole === 'admin' || userRole === 'owner'
  const displayedPengiriman = antaRanSales.filter(s => hasPendingDispatch(s))
  const pendingAntaran      = displayedPengiriman.length
  const totalBelumLunas     = belumLunasSales.length

  const filteredPengiriman  = pengirimanSearch.trim()
    ? displayedPengiriman.filter(s => {
        const q = pengirimanSearch.trim().toLowerCase()
        return s.code.toLowerCase().includes(q)
          || (s.customer?.name ?? '').toLowerCase().includes(q)
      })
    : displayedPengiriman

  const filteredBelumLunas  = belumLunasSearch.trim()
    ? belumLunasSales.filter(s => {
        const q = belumLunasSearch.trim().toLowerCase()
        return s.code.toLowerCase().includes(q)
          || (s.customer?.name ?? '').toLowerCase().includes(q)
      })
    : belumLunasSales

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
      <div className="flex gap-1.5 px-4 py-2.5 bg-gray-900/50 border-b border-white/10 shrink-0 overflow-x-auto">
        {([
          ['antaran',     'Pengiriman',  pendingAntaran,   'bg-amber-500 text-black'],
          ['belum_lunas', 'Belum Lunas', totalBelumLunas,  'bg-red-500 text-white'],
          ['pendapatan',  'Pendapatan',  0,                ''],
          ['kas_tunai',   'Kas Tunai',   0,                ''],
          ...(isAdmin ? [['produk', 'Produk', 0, ''], ['kategori', 'Kategori', 0, '']] : []),
          ['kasir',       'Kasir',       0,                ''],
        ] as [Tab, string, number, string][]).map(([v, label, count, badgeCls]) => (
          <button
            key={v}
            onClick={() => { setTab(v); setPengirimanSearch(''); setBelumLunasSearch('') }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 ${
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
        {isAdmin && (
          <>
            <a
              href="/supplier"
              className="flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 bg-white/8 text-gray-400 hover:bg-white/15"
            >
              Supplier
            </a>
            <a
              href="/penerimaan"
              className="flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 bg-white/8 text-gray-400 hover:bg-white/15"
            >
              Penerimaan
            </a>
          </>
        )}
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

            /* ── TAB PENGIRIMAN ── */
            <>
              <input
                className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Cari nomor invoice atau nama customer..."
                value={pengirimanSearch}
                onChange={e => setPengirimanSearch(e.target.value)}
              />

              {displayedPengiriman.length === 0 ? (
                <p className="text-gray-600 text-center mt-10 text-sm">Semua pengiriman sudah terkirim 🎉</p>
              ) : filteredPengiriman.length === 0 ? (
                <p className="text-gray-600 text-center mt-10 text-sm">
                  Tidak ditemukan: &ldquo;{pengirimanSearch}&rdquo;
                </p>
              ) : (
                filteredPengiriman.map(sale => {
                const isExpanded = expandedId === sale.id
                const isMakingSj = makingSjId === sale.id
                const items      = itemsCache[sale.id]
                const anyDispatched = items
                  ? items.some(it => getItemDispatch(it, sale.surat_jalan).dispatched > 0)
                  : false
                const anyPending = items
                  ? items.some(it => getItemDispatch(it, sale.surat_jalan).pending > 0)
                  : hasPendingDispatch(sale)

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

                            {sale.surat_jalan.length === 0 ? (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-white/10 text-gray-500">Belum SJ</span>
                            ) : sale.surat_jalan.some(sj => sj.status === 'dimuat') ? (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400">
                                Dimuat{sale.surat_jalan.length > 1 ? ` (${sale.surat_jalan.length} SJ)` : ''}
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-green-500/20 text-green-400">
                                Terkirim{anyPending ? ' (Sebagian)' : ''}
                              </span>
                            )}

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
                            {sale.delivery_address && (
                              <><span>·</span><span className="text-gray-600 truncate max-w-40">{sale.delivery_address}</span></>
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
                                {anyDispatched && <th className="text-right pb-2 font-medium">Dikirim</th>}
                                {anyDispatched && <th className="text-right pb-2 font-medium text-amber-500">Sisa</th>}
                                <th className="text-right pb-2 font-medium">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {items.map(item => {
                                const { dispatched, pending } = getItemDispatch(item, sale.surat_jalan)
                                const unitName = item.unit?.unit_name ?? ''
                                return (
                                  <tr key={item.id}>
                                    <td className="py-2 text-white pr-3">{item.product?.name ?? '—'}</td>
                                    <td className="py-2 text-gray-400 text-right whitespace-nowrap">
                                      {fmtQty(item.qty)} {unitName}
                                    </td>
                                    {anyDispatched && (
                                      <td className="py-2 text-blue-400 text-right whitespace-nowrap">
                                        {dispatched > 0 ? `${fmtQty(dispatched)} ${unitName}` : '—'}
                                      </td>
                                    )}
                                    {anyDispatched && (
                                      <td className={`py-2 text-right whitespace-nowrap font-semibold ${pending > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                                        {pending > 0 ? `${fmtQty(pending)} ${unitName}` : '✓'}
                                      </td>
                                    )}
                                    <td className="py-2 text-indigo-300 font-semibold text-right whitespace-nowrap">
                                      {rp(item.subtotal)}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-white/10">
                                <td colSpan={anyDispatched ? 4 : 2} className="pt-2 text-gray-600 text-xs">Total</td>
                                <td className="pt-2 text-white font-bold text-right">{rp(sale.total)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        ) : null}

                        {/* List semua Surat Jalan */}
                        {sale.surat_jalan.length > 0 && (
                          <div className="space-y-2 mt-1">
                            <p className="text-gray-600 text-xs uppercase tracking-wide font-semibold">Surat Jalan</p>
                            {sale.surat_jalan
                              .slice()
                              .sort((a, b) => a.created_at.localeCompare(b.created_at))
                              .map(sj => (
                                <div key={sj.id} className={`px-3 py-2 rounded-xl text-xs flex items-center gap-2 flex-wrap ${
                                  sj.status === 'terkirim' ? 'bg-green-500/8 border border-green-500/20' : 'bg-white/5 border border-white/10'
                                }`}>
                                  <span className={`font-mono font-semibold ${sj.status === 'terkirim' ? 'text-green-400' : 'text-white'}`}>{sj.code}</span>
                                  {sj.driver?.name && <span className="text-gray-500">· {sj.driver.name}</span>}
                                  {sj.plat && <span className="text-gray-300 font-medium">· {sj.plat}</span>}
                                  <span className="text-gray-700">· {fmtDateTime(sj.created_at)}</span>
                                  <span className={`ml-auto text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                                    sj.status === 'terkirim' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                                  }`}>{sj.status === 'terkirim' ? 'Terkirim' : 'Dimuat'}</span>
                                  {items && items.length > 0 && (
                                    <button
                                      onClick={() => printSJ(sj, sale, sale.customer, items)}
                                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white/8 text-gray-400 hover:bg-white/15 transition-colors"
                                    >
                                      🖨 Cetak
                                    </button>
                                  )}
                                  {isAdmin && sj.status === 'dimuat' && (
                                    <button
                                      onClick={() => markTerkirim(sj.id)}
                                      disabled={updatingSjId === sj.id}
                                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-40"
                                    >
                                      {updatingSjId === sj.id ? '...' : '✓ Terkirim'}
                                    </button>
                                  )}
                                </div>
                              ))
                            }
                          </div>
                        )}

                        {/* Form buat surat jalan baru */}
                        {isMakingSj && items && (
                          <div className="border border-indigo-500/30 rounded-xl p-3 bg-indigo-500/5 space-y-2.5">
                            <p className="text-indigo-400 text-xs font-semibold uppercase tracking-wide">Buat Surat Jalan Baru</p>

                            {/* Pilih item + qty */}
                            <div className="divide-y divide-white/5">
                              {items.map(item => {
                                const { pending } = getItemDispatch(item, sale.surat_jalan)
                                if (pending <= 0) return null
                                const unitName   = item.unit?.unit_name ?? ''
                                const currentQty = sjItemQtys[item.id] ?? pending
                                const setQty = (v: number) => setSjItemQtys(prev => ({
                                  ...prev,
                                  [item.id]: Math.max(0, Math.min(v, pending)),
                                }))
                                return (
                                  <div key={item.id} className="py-3 flex items-center gap-3">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-white text-sm font-medium truncate">{item.product?.name ?? '—'}</p>
                                      <p className="text-gray-500 text-xs mt-0.5">sisa {fmtQty(pending)} {unitName}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        onClick={() => setQty(currentQty - 1)}
                                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm flex items-center justify-center"
                                      >−</button>
                                      <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        max={pending}
                                        step="any"
                                        value={currentQty === 0 ? '' : currentQty}
                                        placeholder="0"
                                        onChange={e => {
                                          const v = parseFloat(e.target.value)
                                          setQty(isNaN(v) ? 0 : v)
                                        }}
                                        onFocus={e => e.target.select()}
                                        className="w-16 text-white text-sm text-center bg-white/10 border border-white/15 focus:border-indigo-500 rounded-lg h-7 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                      />
                                      <button
                                        onClick={() => setQty(currentQty + 1)}
                                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm flex items-center justify-center"
                                      >+</button>
                                      <span className="text-gray-600 text-xs w-10 text-right">{unitName}</span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            <select
                              value={sjDriverId}
                              onChange={e => setSjDriverId(e.target.value)}
                              className="w-full bg-white/8 border border-white/10 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
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
                              className="w-full bg-white/8 border border-white/10 text-white placeholder-gray-600 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <div className="flex gap-2 pt-1">
                              <button
                                onClick={() => { setMakingSjId(null); setSjItemQtys({}) }}
                                className="flex-1 py-2 rounded-xl bg-white/5 text-gray-400 text-sm hover:bg-white/10 transition-colors"
                              >
                                Batal
                              </button>
                              <button
                                onClick={() => createSuratJalan(sale)}
                                disabled={submittingSj}
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
                          {isAdmin && (
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
                          )}

                          {/* Buat SJ baru — tampil kalau masih ada item pending */}
                          {isAdmin && anyPending && !isMakingSj && (
                            <button
                              onClick={() => {
                                if (!items) return
                                const initQtys: Record<number, number> = {}
                                for (const it of items) {
                                  const { pending } = getItemDispatch(it, sale.surat_jalan)
                                  if (pending > 0) initQtys[it.id] = pending
                                }
                                setSjItemQtys(initQtys)
                                setMakingSjId(sale.id)
                                setSjDriverId('')
                                setSjPlat('')
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/20 transition-colors"
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

          ) : tab === 'belum_lunas' ? (

            /* ── TAB BELUM LUNAS ── */
            <>
              <input
                className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Cari nomor invoice atau nama customer..."
                value={belumLunasSearch}
                onChange={e => setBelumLunasSearch(e.target.value)}
              />

              {belumLunasSales.length === 0 ? (
                <p className="text-gray-600 text-center mt-10 text-sm">Semua transaksi sudah lunas 🎉</p>
              ) : filteredBelumLunas.length === 0 ? (
                <p className="text-gray-600 text-center mt-10 text-sm">
                  Tidak ditemukan: &ldquo;{belumLunasSearch}&rdquo;
                </p>
              ) : (
                filteredBelumLunas.map(sale => (
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
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-blue-500/20 text-blue-400">Pengiriman</span>
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
                    {isAdmin && (
                      <button
                        onClick={() => togglePayStatus(sale.id, sale.pay_status)}
                        disabled={updatingId === sale.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors disabled:opacity-40 whitespace-nowrap"
                      >
                        {updatingId === sale.id ? '...' : 'Tandai Lunas'}
                      </button>
                    )}
                  </div>
                </div>
              ))
              )}
            </>
          ) : tab === 'pendapatan' ? (

            /* ── TAB PENDAPATAN ── */
            (() => {
              const now = new Date()
              const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

              const fmtDay = (key: string) => {
                const [y, m, d] = key.split('-').map(Number)
                return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
                  weekday: 'short', day: 'numeric', month: 'short',
                })
              }

              const total30 = pendapatanData.reduce((s, d) => s + d.net, 0)
              const txn30   = pendapatanData.reduce((s, d) => s + d.txn_count, 0)

              return (
                <div className="space-y-3 mt-1">
                  {loadingPendapatan ? (
                    <p className="text-gray-500 text-center mt-12 text-sm">Memuat data...</p>
                  ) : pendapatanData.length === 0 ? (
                    <p className="text-gray-600 text-center mt-12 text-sm">Belum ada transaksi dalam 30 hari</p>
                  ) : (
                    <>
                      {/* Ringkasan 30 hari */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <p className="text-gray-500 text-xs">Net 30 Hari</p>
                          <p className="text-white font-bold text-base mt-0.5">{rp(total30)}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <p className="text-gray-500 text-xs">Total Transaksi</p>
                          <p className="text-white font-bold text-base mt-0.5">{txn30} nota</p>
                        </div>
                      </div>

                      {/* List per hari */}
                      {pendapatanData.map(day => {
                        const isToday  = day.date === todayKey
                        const isOpen   = expandedPendapatan === day.date

                        const methods = [
                          { key: 'tunai',    label: 'Tunai',    amount: day.tunai,    count: day.tunai_count,    color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
                          { key: 'transfer', label: 'Transfer', amount: day.transfer, count: day.transfer_count, color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20' },
                          { key: 'cod',      label: 'COD',      amount: day.cod,      count: day.cod_count,      color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
                          { key: 'kredit',   label: 'Kredit',   amount: day.kredit,   count: day.kredit_count,   color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                        ].filter(m => m.amount > 0)

                        return (
                          <div
                            key={day.date}
                            className={`rounded-2xl border transition-colors ${
                              isOpen
                                ? isToday ? 'bg-indigo-600/15 border-indigo-500/50' : 'bg-gray-900 border-white/20'
                                : isToday ? 'bg-indigo-600/10 border-indigo-500/40' : 'bg-white/5 border-white/10 hover:border-white/20'
                            }`}
                          >
                            {/* Header — bisa diklik */}
                            <button
                              className="w-full text-left p-4"
                              onClick={() => setExpandedPendapatan(isOpen ? null : day.date)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className={`text-sm font-bold ${isToday ? 'text-indigo-300' : 'text-white'}`}>
                                      {isToday ? 'Hari Ini' : fmtDay(day.date)}
                                    </p>
                                    {isToday && (
                                      <p className="text-gray-500 text-xs">{fmtDay(day.date)}</p>
                                    )}
                                  </div>
                                  <p className="text-gray-500 text-xs mt-0.5">
                                    {day.txn_count} transaksi
                                    {day.belum_count > 0 && (
                                      <span className="text-amber-600 ml-1.5">· {day.belum_count} belum lunas</span>
                                    )}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="text-right">
                                    <p className={`font-bold text-base ${isToday ? 'text-indigo-300' : 'text-white'}`}>
                                      {rp(day.net)}
                                    </p>
                                    {day.retur > 0 && (
                                      <p className="text-amber-600 text-xs">retur −{rp(day.retur)}</p>
                                    )}
                                  </div>
                                  <span className="text-gray-600 text-xs">{isOpen ? '▲' : '▼'}</span>
                                </div>
                              </div>
                            </button>

                            {/* Detail per metode bayar */}
                            {isOpen && (
                              <div className="border-t border-white/10 px-4 pb-4 pt-3 space-y-1">
                                {methods.map(m => (
                                  <div key={m.key} className="flex items-center justify-between py-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${m.bg} ${m.color}`}>
                                        {m.label}
                                      </span>
                                      <span className="text-gray-600 text-xs">{m.count} nota</span>
                                    </div>
                                    <span className={`font-semibold text-sm ${m.color}`}>{rp(m.amount)}</span>
                                  </div>
                                ))}

                                {/* Divider + total */}
                                <div className="border-t border-white/10 pt-2 mt-1 space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500 text-xs">Gross Penjualan</span>
                                    <span className="text-gray-300 font-semibold">{rp(day.total)}</span>
                                  </div>
                                  {day.retur > 0 && (
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-amber-600 text-xs">Retur</span>
                                      <span className="text-amber-500 font-semibold">−{rp(day.retur)}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center justify-between border-t border-white/10 pt-1.5 mt-1">
                                    <span className="text-white text-xs font-semibold">Net Pendapatan</span>
                                    <span className="text-white font-bold">{rp(day.net)}</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )
            })()

          ) : tab === 'kas_tunai' ? (

            /* ── TAB KAS TUNAI ── */
            (() => {
              const todayKey = (() => {
                const n = new Date()
                return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
              })()

              const totalCash = kasTunaiData.reduce((s, d) => s + d.total, 0)
              const totalTxn  = kasTunaiData.reduce((s, d) => s + d.count, 0)

              const fmt = (iso: string) => {
                const d = new Date(iso)
                const jam  = String(d.getHours()).padStart(2, '0')
                const mnt  = String(d.getMinutes()).padStart(2, '0')
                return `${jam}:${mnt}`
              }

              const fmtDate = (key: string) => {
                const [y, m, d] = key.split('-').map(Number)
                const date = new Date(y, m - 1, d)
                return date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
              }

              return (
                <div className="space-y-3 mt-1">
                  {loadingKasTunai ? (
                    <p className="text-gray-500 text-center mt-12 text-sm">Memuat data...</p>
                  ) : kasTunaiError ? (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mt-4">
                      <p className="text-red-400 text-sm font-semibold mb-1">Gagal memuat data kas</p>
                      <p className="text-red-300/70 text-xs font-mono">{kasTunaiError}</p>
                      <p className="text-gray-500 text-xs mt-2">Pastikan sudah menjalankan <code className="text-amber-400">schema_patch_paid_at.sql</code> di Supabase SQL Editor.</p>
                    </div>
                  ) : kasTunaiData.length === 0 ? (
                    <p className="text-gray-600 text-center mt-12 text-sm">Belum ada penerimaan kas dalam 30 hari</p>
                  ) : (
                    <>
                      {/* Summary cards */}
                      <div className="grid grid-cols-2 gap-3 mb-1">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                          <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-1">Total Kas 30 Hari</p>
                          <p className="text-white font-bold text-xl">{rp(totalCash)}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-1">Total Transaksi</p>
                          <p className="text-white font-bold text-xl">{totalTxn}</p>
                        </div>
                      </div>

                      {/* Per-day cards */}
                      {kasTunaiData.map(day => {
                        const isToday = day.date === todayKey
                        const isOpen  = expandedKasTunai === day.date
                        const invs    = kasTunaiInvoices[day.date] ?? []
                        const loading = loadingKasTunaiDetail === day.date

                        return (
                          <div
                            key={day.date}
                            className={`rounded-2xl border overflow-hidden ${isToday ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-white/10 bg-white/5'}`}
                          >
                            <button
                              className="w-full text-left p-4"
                              onClick={async () => {
                                if (!isOpen) await loadKasTunaiDetail(day.date)
                                setExpandedKasTunai(isOpen ? null : day.date)
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className={`font-semibold text-sm ${isToday ? 'text-emerald-400' : 'text-white'}`}>
                                    {isToday ? 'Hari Ini' : fmtDate(day.date)}
                                    {isToday && <span className="text-gray-400 font-normal ml-1">— {fmtDate(day.date)}</span>}
                                  </p>
                                  <div className="flex gap-3 mt-0.5 flex-wrap">
                                    {day.tunai_count > 0    && <p className="text-green-400 text-xs">{day.tunai_count}× tunai</p>}
                                    {day.transfer_count > 0 && <p className="text-blue-400 text-xs">{day.transfer_count}× transfer</p>}
                                    {day.hutang_count > 0   && <p className="text-amber-400 text-xs">{day.hutang_count}× bayar hutang</p>}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-white font-bold">{rp(day.total)}</p>
                                  <p className="text-gray-500 text-xs">{isOpen ? '▲' : '▼'}</p>
                                </div>
                              </div>
                            </button>

                            {isOpen && (
                              <div className="border-t border-white/10 bg-black/20 px-4 py-3 space-y-2">
                                {loading ? (
                                  <p className="text-gray-500 text-xs text-center py-3">Memuat...</p>
                                ) : invs.length === 0 ? (
                                  <p className="text-gray-600 text-xs text-center py-3">Tidak ada data</p>
                                ) : (
                                  invs.map((inv, i) => {
                                    const isTransfer = inv.pay_method === 'transfer'
                                    return (
                                      <div key={`${inv.is_retur ? 'r' : 's'}-${inv.id}-${i}`} className={`flex items-center gap-3 py-2 border-b border-white/5 last:border-0 ${inv.is_retur ? 'opacity-80' : ''}`}>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <p className={`text-xs font-semibold font-mono ${inv.is_retur ? 'text-red-400' : 'text-white'}`}>{inv.code}</p>
                                            {inv.is_retur && (
                                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 shrink-0">
                                                RETUR
                                              </span>
                                            )}
                                            {!inv.is_retur && isTransfer && (
                                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 shrink-0">
                                                TRANSFER
                                              </span>
                                            )}
                                            {inv.is_retur && isTransfer && (
                                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 shrink-0">
                                                TRANSFER
                                              </span>
                                            )}
                                            {inv.is_hutang && (
                                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 shrink-0">
                                                BAYAR HUTANG
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-gray-500 text-xs">
                                            {inv.customer_name ?? 'Umum'} · {fmt(inv.paid_at)}
                                          </p>
                                        </div>
                                        <p className={`text-sm font-semibold shrink-0 ${inv.is_retur ? 'text-red-400' : 'text-white'}`}>
                                          {inv.is_retur ? `−${rp(-inv.total)}` : rp(inv.total)}
                                        </p>
                                      </div>
                                    )
                                  })
                                )}
                                {/* Footer breakdown */}
                                <div className="border-t border-white/10 pt-2 mt-1 space-y-1">
                                  {day.tunai_total > 0 && (
                                    <div className="flex justify-between items-center">
                                      <p className="text-green-400 text-xs">Tunai ({day.tunai_count}×)</p>
                                      <p className="text-green-400 text-xs font-semibold">{rp(day.tunai_total)}</p>
                                    </div>
                                  )}
                                  {day.transfer_total > 0 && (
                                    <div className="flex justify-between items-center">
                                      <p className="text-blue-400 text-xs">Transfer ({day.transfer_count}×)</p>
                                      <p className="text-blue-400 text-xs font-semibold">{rp(day.transfer_total)}</p>
                                    </div>
                                  )}
                                  {day.hutang_total > 0 && (
                                    <div className="flex justify-between items-center">
                                      <p className="text-amber-400 text-xs">Bayar Hutang ({day.hutang_count}×)</p>
                                      <p className="text-amber-400 text-xs font-semibold">{rp(day.hutang_total)}</p>
                                    </div>
                                  )}
                                  {(day.retur_tunai > 0 || day.retur_transfer > 0) && (
                                    <div className="flex justify-between items-center">
                                      <p className="text-red-400 text-xs">Retur Keluar</p>
                                      <p className="text-red-400 text-xs font-semibold">−{rp(day.retur_tunai + day.retur_transfer)}</p>
                                    </div>
                                  )}
                                  <div className="flex justify-between items-center border-t border-white/10 pt-1.5">
                                    <p className="text-gray-400 text-xs font-semibold">Net Kas</p>
                                    <p className="text-white font-bold text-sm">{rp(day.total)}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )
            })()

          ) : tab === 'kategori' ? (

            /* ── TAB KATEGORI ── */
            <div className="space-y-3 mt-1">

              {/* Header */}
              <div className="flex items-center justify-between">
                <p className="text-white font-bold text-base">Kategori Produk</p>
                <button
                  onClick={() => { setShowAddCat(f => !f); setNewCatName(''); setCategoryError(null) }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  {showAddCat ? 'Batal' : '+ Tambah Kategori'}
                </button>
              </div>

              {/* Error / SQL hint */}
              {categoryError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm space-y-1">
                  <p className="font-semibold">Gagal memuat kategori</p>
                  <p className="text-red-300/70 text-xs font-mono">{categoryError}</p>
                  <p className="text-gray-500 text-xs">Pastikan sudah menjalankan <code className="text-amber-400">schema_patch_categories.sql</code> di Supabase SQL Editor.</p>
                </div>
              )}

              {/* Form tambah */}
              {showAddCat && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex gap-2">
                  <input
                    className="flex-1 bg-white/8 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
                    placeholder="Nama kategori baru…"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
                    autoFocus
                  />
                  <button
                    disabled={savingCat || !newCatName.trim()}
                    onClick={addCategory}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    {savingCat ? '...' : 'Simpan'}
                  </button>
                </div>
              )}

              {/* List */}
              {loadingCategories ? (
                <p className="text-gray-500 text-center mt-12 text-sm">Memuat kategori...</p>
              ) : !categoryError && categories.length === 0 ? (
                <p className="text-gray-600 text-center mt-12 text-sm">Belum ada kategori — jalankan <code className="text-amber-400 text-xs">schema_patch_categories.sql</code> dulu</p>
              ) : (
                categories.map(cat => (
                  <div
                    key={cat.id}
                    className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3"
                  >
                    {editingCat?.id === cat.id ? (
                      /* Mode edit inline */
                      <>
                        <input
                          className="flex-1 bg-white/10 text-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-indigo-500/50"
                          value={editCatName}
                          onChange={e => setEditCatName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') renameCategory()
                            if (e.key === 'Escape') setEditingCat(null)
                          }}
                          autoFocus
                        />
                        <button
                          disabled={savingCat}
                          onClick={renameCategory}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40"
                        >{savingCat ? '...' : 'Simpan'}</button>
                        <button
                          onClick={() => setEditingCat(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/8 text-gray-400 hover:bg-white/15 transition-colors"
                        >Batal</button>
                      </>
                    ) : (
                      /* Mode tampil */
                      <>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <p className="text-white text-sm font-medium">{cat.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            cat.product_count > 0
                              ? 'bg-indigo-500/15 text-indigo-400'
                              : 'bg-white/8 text-gray-500'
                          }`}>
                            {cat.product_count} produk
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => { setEditingCat(cat); setEditCatName(cat.name); setCategoryError(null) }}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/8 text-gray-300 border border-white/10 hover:bg-white/15 transition-colors"
                          >Edit</button>
                          <button
                            onClick={() => deleteCategory(cat)}
                            disabled={cat.product_count > 0 || deletingCatId === cat.id}
                            title={cat.product_count > 0 ? `Tidak bisa dihapus — masih ada ${cat.product_count} produk` : 'Hapus kategori'}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                          >
                            {deletingCatId === cat.id ? '...' : 'Hapus'}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

          ) : tab === 'produk' ? (

            /* ── TAB PRODUK ── */
            (() => {
              const emptyUnitRow = (): UnitFormRow => ({
                unit_name: '', factor_to_base: '1', price: '', price_toko: '', is_default: false,
              })

              return (
                <div className="space-y-3 mt-1">

                  {/* Header + tombol tambah */}
                  <div className="flex items-center justify-between">
                    <p className="text-white font-bold text-base">Daftar Produk</p>
                    <button
                      onClick={() => {
                        if (showProductForm) { setShowProductForm(false); setProductMsg(null) }
                        else openNewProductForm()
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                    >
                      {showProductForm ? 'Tutup Form' : '+ Tambah Produk'}
                    </button>
                  </div>

                  {/* Form tambah / edit produk */}
                  {showProductForm && (
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                      <p className="text-white font-semibold text-sm">
                        {editingProduct ? `Edit: ${editingProduct.name}` : 'Produk Baru'}
                      </p>

                      {/* Info produk */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className="text-gray-400 text-xs mb-1 block">Nama Produk *</label>
                          <input
                            className="w-full bg-white/8 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
                            placeholder="cth: Semen Tiga Roda"
                            value={pName}
                            onChange={e => setPName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-gray-400 text-xs mb-1 block">Satuan Dasar *</label>
                          <input
                            className="w-full bg-white/8 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
                            placeholder="cth: sak, pcs, kg"
                            value={pBaseUnit}
                            onChange={e => setPBaseUnit(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-gray-400 text-xs mb-1 block">SKU / Kode</label>
                          <input
                            className="w-full bg-white/8 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
                            placeholder="opsional"
                            value={pSku}
                            onChange={e => setPSku(e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-gray-400 text-xs mb-1 block">Kategori</label>
                          <input
                            className="w-full bg-white/8 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
                            placeholder="cth: material, elektronik (opsional)"
                            value={pCategory}
                            onChange={e => setPCategory(e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Satuan jual */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Satuan Jual</label>
                          <button
                            onClick={() => setPUnits(prev => [...prev, emptyUnitRow()])}
                            className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
                          >+ Tambah Satuan</button>
                        </div>

                        <div className="space-y-3">
                          {pUnits.map((u, i) => (
                            <div key={i} className="bg-white/5 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => setPUnits(prev => prev.map((x, j) => ({ ...x, is_default: j === i })))}
                                    className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${
                                      u.is_default ? 'bg-indigo-500 border-indigo-500' : 'border-gray-600 hover:border-indigo-400'
                                    }`}
                                    title="Jadikan default"
                                  />
                                  <span className="text-gray-400 text-xs">{u.is_default ? 'Default' : 'Jadikan default'}</span>
                                </div>
                                {pUnits.length > 1 && !u.id && (
                                  <button
                                    onClick={() => setPUnits(prev => prev.filter((_, j) => j !== i))}
                                    className="text-red-500/60 hover:text-red-400 text-xs"
                                  >Hapus</button>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-gray-500 text-[11px] mb-1 block">Nama Satuan *</label>
                                  <input
                                    className="w-full bg-white/8 text-white placeholder-gray-600 rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 border border-white/10"
                                    placeholder="cth: sak, lusin"
                                    value={u.unit_name}
                                    onChange={e => setPUnits(prev => prev.map((x, j) => j === i ? { ...x, unit_name: e.target.value } : x))}
                                  />
                                </div>
                                <div>
                                  <label className="text-gray-500 text-[11px] mb-1 block">Faktor ke {pBaseUnit || 'base'}</label>
                                  <input
                                    type="number"
                                    min="0.001"
                                    step="any"
                                    className="w-full bg-white/8 text-white placeholder-gray-600 rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 border border-white/10"
                                    placeholder="1"
                                    value={u.factor_to_base}
                                    onChange={e => setPUnits(prev => prev.map((x, j) => j === i ? { ...x, factor_to_base: e.target.value } : x))}
                                  />
                                </div>
                                <div>
                                  <label className="text-gray-500 text-[11px] mb-1 block">Harga Retail *</label>
                                  <input
                                    type="number"
                                    min="0"
                                    className="w-full bg-white/8 text-white placeholder-gray-600 rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 border border-white/10"
                                    placeholder="0"
                                    value={u.price}
                                    onChange={e => setPUnits(prev => prev.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                                  />
                                </div>
                                <div>
                                  <label className="text-gray-500 text-[11px] mb-1 block">Harga Toko</label>
                                  <input
                                    type="number"
                                    min="0"
                                    className="w-full bg-white/8 text-white placeholder-gray-600 rounded-lg px-2.5 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500 border border-white/10"
                                    placeholder="opsional"
                                    value={u.price_toko}
                                    onChange={e => setPUnits(prev => prev.map((x, j) => j === i ? { ...x, price_toko: e.target.value } : x))}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {productMsg && (
                        <p className={`text-xs px-3 py-2 rounded-xl ${productMsg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                          {productMsg.text}
                        </p>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowProductForm(false); setProductMsg(null) }}
                          className="flex-1 py-2 rounded-xl bg-white/5 text-gray-400 text-sm hover:bg-white/10 transition-colors"
                        >Batal</button>
                        <button
                          disabled={savingProduct}
                          onClick={saveProduct}
                          className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-bold text-sm transition-colors"
                        >
                          {savingProduct ? 'Menyimpan...' : editingProduct ? 'Simpan Perubahan' : 'Tambah Produk'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Search */}
                  <input
                    className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Cari nama atau SKU..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                  />

                  {/* List produk */}
                  {loadingProducts ? (
                    <p className="text-gray-500 text-center mt-12 text-sm">Memuat produk...</p>
                  ) : products.length === 0 ? (
                    <p className="text-gray-600 text-center mt-12 text-sm">
                      {productSearch.trim() ? `Tidak ditemukan: "${productSearch}"` : 'Belum ada produk'}
                    </p>
                  ) : (
                    products.map(p => (
                      <div
                        key={p.id}
                        className={`border rounded-2xl p-4 ${p.active ? 'bg-white/5 border-white/10' : 'bg-white/2 border-white/5 opacity-60'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white font-semibold text-sm">{p.name}</p>
                              {!p.active && (
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-gray-500/20 text-gray-500">Nonaktif</span>
                              )}
                              {p.sku && (
                                <span className="text-[10px] font-mono text-gray-500">{p.sku}</span>
                              )}
                            </div>
                            <p className="text-gray-500 text-xs mt-0.5">Satuan dasar: {p.base_unit}{p.category ? ` · ${p.category}` : ''}</p>

                            {/* Units */}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {p.product_units.map(u => (
                                <div
                                  key={u.id}
                                  className={`text-xs px-2 py-1 rounded-lg border ${
                                    u.is_default
                                      ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                                      : 'bg-white/5 border-white/10 text-gray-400'
                                  }`}
                                >
                                  <span className="font-semibold">{u.unit_name}</span>
                                  {u.factor_to_base !== 1 && <span className="text-gray-500"> ×{fmtQty(u.factor_to_base)}</span>}
                                  <span className="ml-1 text-gray-400">{rp(u.price)}</span>
                                  {u.price_toko != null && (
                                    <span className="ml-1 text-amber-500/70">/ {rp(u.price_toko)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => openEditProductForm(p)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/8 text-gray-300 border border-white/10 hover:bg-white/15 transition-colors"
                            >Edit</button>
                            <button
                              onClick={() => toggleProductActive(p)}
                              disabled={togglingProductId === p.id}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 ${
                                p.active
                                  ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                                  : 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/20'
                              }`}
                            >
                              {togglingProductId === p.id ? '...' : p.active ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Sentinel infinite scroll */}
                  <div ref={productSentinelRef} className="py-3 text-center">
                    {loadingMoreProducts && <p className="text-gray-600 text-xs">Memuat lebih banyak...</p>}
                    {!loadingMoreProducts && !productHasMore && products.length > 0 && (
                      <p className="text-gray-700 text-xs">{products.length} produk ditampilkan</p>
                    )}
                  </div>
                </div>
              )
            })()

          ) : (

            /* ── TAB KASIR ── */
            <div className="max-w-lg mx-auto mt-4 space-y-4">

              {/* ── List kasir ── */}
              <div className="flex items-center justify-between">
                <p className="text-white font-bold text-base">Daftar Kasir</p>
                <button
                  onClick={() => { setShowForm(f => !f); setKasirMsg(null) }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  {showForm ? 'Tutup Form' : '+ Tambah Kasir'}
                </button>
              </div>

              {/* Form tambah kasir */}
              {showForm && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                  <p className="text-white font-semibold text-sm">Kasir Baru</p>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Nama Lengkap</label>
                    <input
                      className="w-full bg-white/8 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
                      placeholder="cth: Budi Santoso"
                      value={kasirName}
                      onChange={e => setKasirName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Kode Staff</label>
                    <input
                      className="w-full bg-white/8 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
                      placeholder="cth: staff03"
                      value={kasirCode}
                      onChange={e => setKasirCode(e.target.value.toLowerCase().replace(/\s/g, ''))}
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Email Login</label>
                    <input
                      type="email"
                      className="w-full bg-white/8 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10"
                      placeholder="cth: budi@gmail.com"
                      value={kasirEmail}
                      onChange={e => setKasirEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">PIN (6 digit)</label>
                    <input
                      className="w-full bg-white/8 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 border border-white/10 font-mono tracking-widest"
                      placeholder="••••••"
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={kasirPin}
                      onChange={e => setKasirPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </div>
                  {kasirMsg && (
                    <p className={`text-xs px-3 py-2 rounded-xl ${kasirMsg.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {kasirMsg.text}
                    </p>
                  )}
                  <button
                    disabled={savingKasir || !kasirName || !kasirCode || !kasirEmail || kasirPin.length !== 6}
                    onClick={async () => {
                      setSavingKasir(true)
                      setKasirMsg(null)
                      const res = await fetch('/api/kasir', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: kasirName, staff_code: kasirCode, email: kasirEmail, pin: kasirPin }),
                      })
                      const json = await res.json()
                      setSavingKasir(false)
                      if (res.ok) {
                        setKasirMsg({ ok: true, text: `Kasir "${kasirName}" berhasil dibuat.` })
                        setKasirName(''); setKasirCode(''); setKasirEmail(''); setKasirPin('')
                        loadKasirList()
                      } else {
                        setKasirMsg({ ok: false, text: json.error ?? 'Gagal membuat kasir.' })
                      }
                    }}
                    className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white font-bold text-sm transition-colors"
                  >
                    {savingKasir ? 'Menyimpan...' : 'Buat Kasir'}
                  </button>
                </div>
              )}

              {/* Kasir list */}
              {loadingKasirList ? (
                <p className="text-gray-500 text-sm text-center py-8">Memuat...</p>
              ) : kasirList.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-8">Belum ada kasir terdaftar</p>
              ) : (
                <div className="space-y-2">
                  {kasirList.map(k => (
                    <div key={k.id}>
                      <button
                        onClick={() => setSelectedKasir(prev => prev?.id === k.id ? null : k)}
                        className={`w-full text-left px-4 py-3 rounded-2xl border transition-colors flex items-center justify-between gap-3 ${
                          selectedKasir?.id === k.id
                            ? 'bg-gray-900 border-indigo-500/50'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${k.active ? 'bg-green-400' : 'bg-gray-600'}`} />
                          <div className="min-w-0">
                            <p className="text-white font-semibold text-sm truncate">{k.full_name}</p>
                            <p className="text-gray-500 text-xs">{k.staff_code ?? '—'}</p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md shrink-0 ${
                          k.active ? 'bg-green-500/15 text-green-400' : 'bg-white/8 text-gray-500'
                        }`}>
                          {k.active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </button>

                      {/* Detail panel */}
                      {selectedKasir?.id === k.id && (
                        <div className="mx-2 mt-1 mb-1 bg-gray-900 border border-indigo-500/20 rounded-2xl p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <div>
                              <p className="text-gray-500 text-xs mb-0.5">Nama</p>
                              <p className="text-white font-medium">{k.full_name}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-xs mb-0.5">Kode Staff</p>
                              <p className="text-white font-medium">{k.staff_code ?? '—'}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-gray-500 text-xs mb-0.5">Email Login</p>
                              <p className="text-white font-medium break-all">{k.email_login ?? '—'}</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-xs mb-0.5">Status</p>
                              <p className={`font-semibold ${k.active ? 'text-green-400' : 'text-gray-500'}`}>
                                {k.active ? 'Aktif' : 'Nonaktif'}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-xs mb-0.5">Terdaftar</p>
                              <p className="text-white">{fmtDate(k.created_at)}</p>
                            </div>
                          </div>
                          <button
                            disabled={togglingId === k.id}
                            onClick={() => toggleActive(k)}
                            className={`w-full h-9 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 ${
                              k.active
                                ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20'
                                : 'bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20'
                            }`}
                          >
                            {togglingId === k.id ? '...' : k.active ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          )}
        </div>
      </div>
    </div>
  )
}
