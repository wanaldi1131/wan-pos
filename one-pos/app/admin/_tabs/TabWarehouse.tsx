'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type PriceList = { id: number; name: string }
type Warehouse = {
  id: number
  name: string
  is_hub: boolean
  price_list_id: number | null
}

export default function TabWarehouse({ user }: { user: User }) {
  const sb = createClient()

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])
  const [loading, setLoading]       = useState(false)

  // Add form
  const [showAdd, setShowAdd]   = useState(false)
  const [addName, setAddName]   = useState('')
  const [addIsHub, setAddIsHub] = useState(false)
  const [adding, setAdding]     = useState(false)

  // Edit inline
  const [editId, setEditId]     = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving]     = useState(false)

  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: whs }, { data: pls }] = await Promise.all([
      sb.from('warehouses').select('id, name, is_hub, price_list_id').order('id'),
      sb.from('price_lists').select('id, name').order('name'),
    ])
    setWarehouses((whs ?? []) as Warehouse[])
    setPriceLists((pls ?? []) as PriceList[])
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  async function addWarehouse() {
    if (!addName.trim()) return
    setAdding(true); setErr(null)
    const { error } = await sb.from('warehouses').insert({ name: addName.trim(), is_hub: addIsHub })
    if (error) { setErr(error.message); setAdding(false); return }
    setAddName(''); setAddIsHub(false); setShowAdd(false)
    setAdding(false)
    load()
  }

  function startEdit(w: Warehouse) {
    setEditId(w.id)
    setEditName(w.name)
    setErr(null)
  }

  async function saveEdit(w: Warehouse) {
    if (!editName.trim()) return
    setSaving(true); setErr(null)
    const { error } = await sb.from('warehouses').update({ name: editName.trim() }).eq('id', w.id)
    if (error) { setErr(error.message); setSaving(false); return }
    setSaving(false)
    setEditId(null)
    load()
  }

  async function toggleHub(w: Warehouse) {
    await sb.from('warehouses').update({ is_hub: !w.is_hub }).eq('id', w.id)
    load()
  }

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-900 font-bold text-base">Gudang / Outlet</p>
        <button
          onClick={() => { setShowAdd(v => !v); setErr(null) }}
          className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          + Tambah Gudang
        </button>
      </div>

      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 space-y-3">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Nama Gudang</label>
            <input
              autoFocus
              value={addName}
              onChange={e => setAddName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addWarehouse()}
              placeholder="cth: Toko Pusat, Cabang Selatan"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addIsHub}
              onChange={e => setAddIsHub(e.target.checked)}
              className="w-4 h-4 accent-orange-600"
            />
            <span className="text-gray-700 text-base">Gudang utama (hub)</span>
          </label>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAdd(false); setAddName(''); setAddIsHub(false); setErr(null) }}
              className="px-3 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors"
            >
              Batal
            </button>
            <button
              onClick={addWarehouse}
              disabled={adding || !addName.trim()}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
            >
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
            const pl = priceLists.find(p => p.id === w.price_list_id)
            const isEditing = editId === w.id
            return (
              <div key={w.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                {isEditing ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveEdit(w)
                        if (e.key === 'Escape') setEditId(null)
                      }}
                      className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-base focus:outline-none focus:border-orange-500"
                    />
                    <button
                      onClick={() => setEditId(null)}
                      className="px-2 text-gray-400 hover:text-gray-700 text-sm transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => saveEdit(w)}
                      disabled={saving || !editName.trim()}
                      className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
                    >
                      {saving ? '…' : 'Simpan'}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 font-semibold text-base">{w.name}</span>
                        {w.is_hub && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-700">
                            Hub
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 text-sm mt-0.5">
                        {pl ? `Price list: ${pl.name}` : 'Belum ada price list'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => toggleHub(w)}
                        title={w.is_hub ? 'Lepas status hub' : 'Jadikan hub'}
                        className="text-gray-400 hover:text-orange-600 text-sm transition-colors"
                      >
                        {w.is_hub ? '★' : '☆'}
                      </button>
                      <button
                        onClick={() => startEdit(w)}
                        className="text-orange-600 hover:text-orange-700 text-sm font-medium transition-colors"
                      >
                        Rename
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
