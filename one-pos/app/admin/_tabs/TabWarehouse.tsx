'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type PriceList = { id: number; name: string }
type Warehouse  = { id: number; name: string; price_list_id: number | null }
type Profile    = { id: string; full_name: string; warehouse_id: number | null }

export default function TabWarehouse({ user }: { user: User }) {
  const sb = createClient()

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [profiles, setProfiles]     = useState<Profile[]>([])
  const [loading, setLoading]       = useState(false)

  // Mode
  const [selected, setSelected] = useState<Warehouse | null>(null)

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [adding, setAdding]   = useState(false)

  // Edit inline dalam detail
  const [editName, setEditName]   = useState('')
  const [editingName, setEditingName] = useState(false)
  const [savingName, setSavingName]   = useState(false)

  const [savingPl, setSavingPl]   = useState(false)
  const [savingStaff, setSavingStaff] = useState<string | null>(null)

  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: whs }, { data: pls }, { data: profs }] = await Promise.all([
      sb.from('warehouses').select('id, name, price_list_id').order('id'),
      sb.from('price_lists').select('id, name').order('name'),
      sb.from('profiles').select('id, full_name, warehouse_id').eq('active', true).order('full_name'),
    ])
    setWarehouses((whs ?? []) as Warehouse[])
    setPriceLists((pls ?? []) as PriceList[])
    setProfiles((profs ?? []) as Profile[])
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  async function addWarehouse() {
    if (!addName.trim()) return
    setAdding(true); setErr(null)
    const { error } = await sb.from('warehouses').insert({ name: addName.trim() })
    if (error) { setErr(error.message); setAdding(false); return }
    setAddName(''); setShowAdd(false)
    setAdding(false); load()
  }

  function openDetail(w: Warehouse) {
    setSelected(w)
    setEditName(w.name)
    setEditingName(false)
    setErr(null)
  }

  async function saveName() {
    if (!selected || !editName.trim()) return
    setSavingName(true)
    const { error } = await sb.from('warehouses').update({ name: editName.trim() }).eq('id', selected.id)
    if (error) { setErr(error.message); setSavingName(false); return }
    setSavingName(false); setEditingName(false)
    setSelected(prev => prev ? { ...prev, name: editName.trim() } : prev)
    load()
  }

  async function savePriceList(listId: number | null) {
    if (!selected) return
    setSavingPl(true)
    await sb.from('warehouses').update({ price_list_id: listId }).eq('id', selected.id)
    setSavingPl(false)
    setSelected(prev => prev ? { ...prev, price_list_id: listId } : prev)
    load()
  }

  async function toggleStaff(profile: Profile) {
    setSavingStaff(profile.id)
    const isAssigned = profile.warehouse_id === selected?.id
    await sb.from('profiles')
      .update({ warehouse_id: isAssigned ? null : (selected?.id ?? null) })
      .eq('id', profile.id)
    setSavingStaff(null); load()
  }

  // ── Render: detail gudang ─────────────────────────────────────

  if (selected) {
    const assignedProfiles = profiles.filter(p => p.warehouse_id === selected.id)
    const unassigned       = profiles.filter(p => p.warehouse_id !== selected.id)
    const currentPl        = priceLists.find(p => p.id === selected.price_list_id)

    return (
      <div className="pb-8">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { setSelected(null); load() }}
            className="text-gray-500 hover:text-gray-900 text-sm transition-colors">← Kembali</button>
          <p className="text-gray-900 font-bold text-base flex-1">{selected.name}</p>
        </div>

        {err && <p className="text-red-600 text-sm mb-3 bg-red-50 rounded-xl px-4 py-2">{err}</p>}

        {/* Info dasar */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 space-y-3">
          <div>
            <p className="text-sm text-gray-500 mb-1">Nama Gudang</p>
            {editingName ? (
              <div className="flex gap-2">
                <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                  className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base focus:outline-none focus:border-orange-500" />
                <button onClick={() => setEditingName(false)}
                  className="px-2 text-gray-400 hover:text-gray-700 text-sm transition-colors">Batal</button>
                <button onClick={saveName} disabled={savingName || !editName.trim()}
                  className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40">
                  {savingName ? '…' : 'Simpan'}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-gray-900 text-base font-medium flex-1">{selected.name}</span>
                <button onClick={() => setEditingName(true)}
                  className="text-orange-600 hover:text-orange-700 text-sm font-medium transition-colors">
                  Ubah nama
                </button>
              </div>
            )}
          </div>

        </div>

        {/* Price list */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3">
          <p className="text-sm text-gray-500 font-medium uppercase tracking-wide mb-3">Price List</p>
          <div className="space-y-2">
            <button
              onClick={() => savePriceList(null)}
              disabled={savingPl}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors text-base ${
                selected.price_list_id === null
                  ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}>
              Tidak ada (pakai harga master)
            </button>
            {priceLists.map(pl => (
              <button key={pl.id}
                onClick={() => savePriceList(pl.id)}
                disabled={savingPl}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors text-base ${
                  selected.price_list_id === pl.id
                    ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}>
                {pl.name}
                {selected.price_list_id === pl.id && <span className="ml-2 text-orange-500">✓</span>}
              </button>
            ))}
            {priceLists.length === 0 && (
              <p className="text-gray-400 text-sm">Belum ada price list. Buat di tab Price Lists.</p>
            )}
          </div>
        </div>

        {/* Staff */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-sm text-gray-500 font-medium uppercase tracking-wide mb-3">
            Karyawan di Gudang Ini
          </p>

          {assignedProfiles.length === 0 ? (
            <p className="text-gray-400 text-sm mb-3">Belum ada karyawan yang diassign.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {assignedProfiles.map(p => (
                <div key={p.id} className="flex items-center justify-between py-1.5">
                  <span className="text-gray-900 text-base">{p.full_name}</span>
                  <button onClick={() => toggleStaff(p)} disabled={savingStaff === p.id}
                    className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-40">
                    {savingStaff === p.id ? '…' : 'Lepas'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {unassigned.length > 0 && (
            <>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">
                {assignedProfiles.length > 0 ? 'Tambah karyawan lain' : 'Pilih karyawan'}
              </p>
              <div className="space-y-2">
                {unassigned.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-1.5">
                    <div>
                      <span className="text-gray-900 text-base">{p.full_name}</span>
                      {p.warehouse_id && (
                        <span className="text-gray-400 text-xs ml-2">
                          ({warehouses.find(w => w.id === p.warehouse_id)?.name ?? 'gudang lain'})
                        </span>
                      )}
                    </div>
                    <button onClick={() => toggleStaff(p)} disabled={savingStaff === p.id}
                      className="text-sm text-orange-600 hover:text-orange-700 font-medium transition-colors disabled:opacity-40">
                      {savingStaff === p.id ? '…' : 'Assign'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Render: list mode ─────────────────────────────────────────

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-900 font-bold text-base">Gudang / Outlet</p>
        <button onClick={() => { setShowAdd(v => !v); setErr(null) }}
          className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
          + Tambah Gudang
        </button>
      </div>

      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 space-y-3">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Nama Gudang</label>
            <input autoFocus value={addName} onChange={e => setAddName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addWarehouse()}
              placeholder="cth: Toko Pusat, Cabang Selatan"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowAdd(false); setAddName(''); setErr(null) }}
              className="px-3 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors">Batal</button>
            <button onClick={addWarehouse} disabled={adding || !addName.trim()}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40">
              {adding ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </div>
      )}

      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}

      {loading ? (
        <p className="text-center text-gray-500 py-12 text-base">Memuat…</p>
      ) : warehouses.length === 0 ? (
        <p className="text-center text-gray-500 py-12 text-base">Belum ada gudang.</p>
      ) : (
        <div className="space-y-2">
          {warehouses.map(w => {
            const pl       = priceLists.find(p => p.id === w.price_list_id)
            const staffCnt = profiles.filter(p => p.warehouse_id === w.id).length
            return (
              <button key={w.id} onClick={() => openDetail(w)}
                className="w-full bg-white border border-gray-200 hover:border-orange-300 rounded-2xl px-4 py-3 text-left transition-colors">
                <p className="text-gray-900 font-semibold text-base mb-0.5">{w.name}</p>
                <p className="text-gray-400 text-sm">
                  {pl ? pl.name : 'Harga master'}
                  <span className="mx-1.5">·</span>
                  {staffCnt} karyawan
                </p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
