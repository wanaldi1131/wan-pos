'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

const fmtRp = (n: number | null) =>
  n == null ? '—' : 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

type PriceList = { id: number; name: string }
type Warehouse = { id: number; name: string; price_list_id: number | null }

type PliRow = {
  product_unit_id: number
  price_retail: number | null
  price_toko: number | null
  unit: {
    id: number
    unit_name: string
    price: number
    price_toko: number | null
    product: { id: number; name: string } | null
  } | null
}

type ProductHit = { id: number; name: string; product_units: { id: number; unit_name: string }[] }

export default function TabPriceLists({ user }: { user: User }) {
  const sb = createClient()

  const [lists, setLists]           = useState<PriceList[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [loading, setLoading]       = useState(false)

  const [editList, setEditList]       = useState<PriceList | null>(null)
  const [editName, setEditName]       = useState('')
  const [renamingList, setRenamingList] = useState(false)

  const [items, setItems]         = useState<PliRow[]>([])
  const [loadingItems, setLoadingItems] = useState(false)

  // Per-row editable prices
  const [priceEdits, setPriceEdits] = useState<Record<number, { retail: string; toko: string }>>({})
  const [savingItem, setSavingItem] = useState<number | null>(null)
  const [removingItem, setRemovingItem] = useState<number | null>(null)

  // Add product form
  const [addSearch, setAddSearch]   = useState('')
  const [addHits, setAddHits]       = useState<ProductHit[]>([])
  const [addDropOpen, setAddDropOpen] = useState(false)
  const [addUnitId, setAddUnitId]   = useState<number | null>(null)
  const [addUnits, setAddUnits]     = useState<{ id: number; unit_name: string }[]>([])
  const [addRetail, setAddRetail]   = useState('')
  const [addToko, setAddToko]       = useState('')
  const [adding, setAdding]         = useState(false)

  // New list form
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName]         = useState('')
  const [creatingList, setCreatingList] = useState(false)

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: ls }, { data: whs }] = await Promise.all([
      sb.from('price_lists').select('id, name').order('name'),
      sb.from('warehouses').select('id, name, price_list_id').order('name'),
    ])
    setLists((ls ?? []) as PriceList[])
    setWarehouses((whs ?? []) as Warehouse[])
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  const loadItems = useCallback(async (listId: number) => {
    setLoadingItems(true)
    const { data } = await sb.from('price_list_items')
      .select(`
        product_unit_id, price_retail, price_toko,
        unit:product_units!product_unit_id(
          id, unit_name, price, price_toko,
          product:products(id, name)
        )
      `)
      .eq('price_list_id', listId)
      .order('product_unit_id')
    const rows = (data ?? []) as unknown as PliRow[]
    setItems(rows)
    const edits: Record<number, { retail: string; toko: string }> = {}
    for (const r of rows) {
      edits[r.product_unit_id] = {
        retail: r.price_retail != null ? String(r.price_retail) : '',
        toko:   r.price_toko   != null ? String(r.price_toko)   : '',
      }
    }
    setPriceEdits(edits)
    setLoadingItems(false)
  }, [sb])

  function openEdit(list: PriceList) {
    setEditList(list)
    setEditName(list.name)
    setAddSearch(''); setAddHits([]); setAddDropOpen(false)
    setAddUnitId(null); setAddUnits([]); setAddRetail(''); setAddToko('')
    setMsg(null)
    loadItems(list.id)
  }

  function closeEdit() {
    setEditList(null)
    setMsg(null)
  }

  async function createList() {
    if (!newName.trim()) return
    setCreatingList(true)
    const { error } = await sb.from('price_lists').insert({ name: newName.trim() })
    if (error) { setMsg({ ok: false, text: error.message }); setCreatingList(false); return }
    setNewName(''); setShowNewForm(false)
    load()
    setCreatingList(false)
  }

  async function renameList() {
    if (!editList || !editName.trim()) return
    setRenamingList(true)
    const { error } = await sb.from('price_lists').update({ name: editName.trim() }).eq('id', editList.id)
    if (!error) setEditList({ ...editList, name: editName.trim() })
    setRenamingList(false)
    load()
  }

  async function deleteList(id: number) {
    if (!confirm('Hapus price list ini?')) return
    await sb.from('price_lists').delete().eq('id', id)
    load()
  }

  function onAddSearch(value: string) {
    setAddSearch(value)
    setAddUnitId(null); setAddUnits([])
    setAddDropOpen(true)
    clearTimeout(debounceRef.current ?? undefined)
    if (!value.trim()) { setAddHits([]); setAddDropOpen(false); return }
    debounceRef.current = setTimeout(async () => {
      const { data } = await sb.from('products')
        .select('id, name, product_units(id, unit_name)')
        .ilike('name', `%${value.trim()}%`)
        .eq('active', true)
        .order('name').limit(8)
      setAddHits((data ?? []) as unknown as ProductHit[])
    }, 300)
  }

  function selectAddProduct(hit: ProductHit) {
    setAddSearch(hit.name)
    setAddHits([]); setAddDropOpen(false)
    const units = hit.product_units ?? []
    setAddUnits(units)
    setAddUnitId(units.length === 1 ? units[0].id : null)
  }

  async function addItem() {
    if (!editList || !addUnitId) return
    const retail = parseFloat(addRetail) || null
    const toko   = parseFloat(addToko)   || null
    setAdding(true)
    const { error } = await sb.from('price_list_items').upsert({
      price_list_id:   editList.id,
      product_unit_id: addUnitId,
      price_retail:    retail,
      price_toko:      toko,
    }, { onConflict: 'price_list_id,product_unit_id' })
    if (error) { setMsg({ ok: false, text: error.message }); setAdding(false); return }
    setAddSearch(''); setAddUnitId(null); setAddUnits([])
    setAddRetail(''); setAddToko('')
    loadItems(editList.id)
    setAdding(false)
  }

  async function saveItemPrice(unitId: number) {
    if (!editList) return
    setSavingItem(unitId)
    const edit = priceEdits[unitId] ?? { retail: '', toko: '' }
    const { error } = await sb.from('price_list_items').upsert({
      price_list_id:   editList.id,
      product_unit_id: unitId,
      price_retail:    parseFloat(edit.retail) || null,
      price_toko:      parseFloat(edit.toko)   || null,
    }, { onConflict: 'price_list_id,product_unit_id' })
    if (error) setMsg({ ok: false, text: error.message })
    setSavingItem(null)
    loadItems(editList.id)
  }

  async function removeItem(unitId: number) {
    if (!editList) return
    setRemovingItem(unitId)
    await sb.from('price_list_items')
      .delete()
      .eq('price_list_id', editList.id)
      .eq('product_unit_id', unitId)
    setRemovingItem(null)
    loadItems(editList.id)
  }

  async function assignWarehouse(warehouseId: number, listId: number | null) {
    await sb.from('warehouses').update({ price_list_id: listId }).eq('id', warehouseId)
    setWarehouses(prev => prev.map(w => w.id === warehouseId ? { ...w, price_list_id: listId } : w))
  }

  // ── Render: edit mode ─────────────────────────────────────────

  if (editList) {
    return (
      <div className="pb-8">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={closeEdit} className="text-gray-500 hover:text-gray-900 text-sm transition-colors">
            ← Kembali
          </button>
          <p className="text-gray-900 font-bold text-base flex-1">Price List</p>
        </div>

        {/* Rename */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <label className="block text-sm text-gray-500 mb-1">Nama Price List</label>
          <div className="flex gap-2">
            <input value={editName} onChange={e => setEditName(e.target.value)}
              className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base focus:outline-none focus:border-orange-500" />
            <button onClick={renameList} disabled={renamingList || editName === editList.name}
              className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40">
              {renamingList ? '…' : 'Simpan'}
            </button>
          </div>
        </div>

        {/* Warehouse assignments */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-3">Digunakan oleh Gudang</p>
          {warehouses.length === 0 ? (
            <p className="text-gray-500 text-sm">Belum ada gudang.</p>
          ) : (
            <div className="space-y-2">
              {warehouses.map(w => {
                const isAssigned = w.price_list_id === editList.id
                return (
                  <div key={w.id} className="flex items-center justify-between">
                    <span className="text-gray-900 text-base">{w.name}</span>
                    <button
                      onClick={() => assignWarehouse(w.id, isAssigned ? null : editList.id)}
                      className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                        isAssigned
                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {isAssigned ? '✓ Aktif' : 'Aktifkan'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Add product */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-3">Tambah Produk</p>
          <div className="relative mb-3">
            <input
              type="text" value={addSearch}
              onChange={e => onAddSearch(e.target.value)}
              onFocus={() => addHits.length > 0 && setAddDropOpen(true)}
              onBlur={() => setTimeout(() => setAddDropOpen(false), 150)}
              placeholder="Cari nama produk…"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500"
            />
            {addDropOpen && addHits.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-md z-30 overflow-hidden">
                {addHits.map(h => (
                  <button key={h.id} onMouseDown={() => selectAddProduct(h)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-100 text-gray-900 text-base border-b border-gray-100 last:border-0">
                    {h.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {addUnits.length > 1 && (
            <div className="flex gap-2 flex-wrap mb-3">
              {addUnits.map(u => (
                <button key={u.id} onClick={() => setAddUnitId(u.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    addUnitId === u.id ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {u.unit_name}
                </button>
              ))}
            </div>
          )}

          {addUnitId && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Harga Retail</label>
                <input type="number" inputMode="decimal" value={addRetail}
                  onChange={e => setAddRetail(e.target.value)} onFocus={e => e.target.select()}
                  placeholder="Kosong = pakai master"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Harga Toko</label>
                <input type="number" inputMode="decimal" value={addToko}
                  onChange={e => setAddToko(e.target.value)} onFocus={e => e.target.select()}
                  placeholder="Kosong = pakai master"
                  className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </div>
            </div>
          )}

          {addUnitId && (
            <button onClick={addItem} disabled={adding}
              className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40">
              {adding ? 'Menyimpan…' : '+ Tambah ke Price List'}
            </button>
          )}
        </div>

        {/* Items list */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-gray-500 text-sm font-medium uppercase tracking-wide mb-3">
            Harga Override ({items.length} item)
          </p>
          {loadingItems ? (
            <p className="text-gray-500 text-sm py-4 text-center">Memuat…</p>
          ) : items.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">Belum ada produk. Tambah di atas.</p>
          ) : (
            <div className="space-y-3">
              {items.map(row => {
                const unitId  = row.product_unit_id
                const edit    = priceEdits[unitId] ?? { retail: '', toko: '' }
                const isDirty = edit.retail !== (row.price_retail != null ? String(row.price_retail) : '')
                             || edit.toko   !== (row.price_toko   != null ? String(row.price_toko)   : '')
                return (
                  <div key={unitId} className="border border-gray-100 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="text-gray-900 text-sm font-semibold">
                          {row.unit?.product?.name ?? '—'}
                        </span>
                        <span className="text-gray-500 text-sm ml-2">· {row.unit?.unit_name}</span>
                      </div>
                      <button onClick={() => removeItem(unitId)} disabled={removingItem === unitId}
                        className="text-gray-400 hover:text-red-600 text-sm transition-colors disabled:opacity-40">
                        {removingItem === unitId ? '…' : 'Hapus'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Retail <span className="text-gray-400">(master: {fmtRp(row.unit?.price ?? null)})</span>
                        </label>
                        <input type="number" inputMode="decimal" value={edit.retail}
                          onChange={e => setPriceEdits(p => ({ ...p, [unitId]: { ...edit, retail: e.target.value } }))}
                          onFocus={e => e.target.select()}
                          placeholder="Pakai master"
                          className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Toko <span className="text-gray-400">(master: {fmtRp(row.unit?.price_toko ?? null)})</span>
                        </label>
                        <input type="number" inputMode="decimal" value={edit.toko}
                          onChange={e => setPriceEdits(p => ({ ...p, [unitId]: { ...edit, toko: e.target.value } }))}
                          onFocus={e => e.target.select()}
                          placeholder="Pakai master"
                          className="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-orange-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                      </div>
                    </div>
                    {isDirty && (
                      <button onClick={() => saveItemPrice(unitId)} disabled={savingItem === unitId}
                        className="text-sm text-orange-600 hover:text-orange-700 font-medium transition-colors disabled:opacity-40">
                        {savingItem === unitId ? 'Menyimpan…' : 'Simpan perubahan'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {msg && (
          <p className={`mt-3 text-sm ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>
        )}
      </div>
    )
  }

  // ── Render: list mode ─────────────────────────────────────────

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-900 font-bold text-base">Price Lists</p>
        <button onClick={() => setShowNewForm(v => !v)}
          className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
          + Buat Price List
        </button>
      </div>

      {showNewForm && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <label className="block text-sm text-gray-500 mb-1">Nama Price List</label>
          <div className="flex gap-2">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createList()}
              placeholder="cth: Harga Jakarta, Harga Surabaya"
              className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
            <button onClick={() => { setShowNewForm(false); setNewName('') }}
              className="px-3 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors">Batal</button>
            <button onClick={createList} disabled={creatingList || !newName.trim()}
              className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40">
              {creatingList ? '…' : 'Simpan'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-500 py-12 text-base">Memuat…</p>
      ) : lists.length === 0 ? (
        <p className="text-center text-gray-500 py-12 text-base">Belum ada price list.</p>
      ) : (
        <div className="space-y-3">
          {lists.map(list => {
            const assignedWhs = warehouses.filter(w => w.price_list_id === list.id)
            return (
              <div key={list.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-semibold text-base">{list.name}</p>
                  {assignedWhs.length > 0 ? (
                    <p className="text-gray-500 text-sm mt-0.5">
                      Gudang: {assignedWhs.map(w => w.name).join(', ')}
                    </p>
                  ) : (
                    <p className="text-gray-400 text-sm mt-0.5">Belum diasign ke gudang manapun</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEdit(list)}
                    className="text-orange-600 hover:text-orange-700 text-sm font-medium transition-colors">
                    Edit
                  </button>
                  {assignedWhs.length === 0 && (
                    <button onClick={() => deleteList(list.id)}
                      className="text-gray-400 hover:text-red-600 text-sm transition-colors">
                      Hapus
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
