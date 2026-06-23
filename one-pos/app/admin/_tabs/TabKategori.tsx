'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { Category } from '../_types'

export default function TabKategori({ user }: { user: User }) {
  const sb = createClient()
  const [categories, setCategories]     = useState<Category[]>([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [showAdd, setShowAdd]           = useState(false)
  const [newName, setNewName]           = useState('')
  const [editingCat, setEditingCat]     = useState<Category | null>(null)
  const [editName, setEditName]         = useState('')
  const [saving, setSaving]             = useState(false)
  const [deletingId, setDeletingId]     = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: cats, error: err }, { data: prods }] = await Promise.all([
      sb.from('categories').select('id, name').order('name'),
      sb.from('products').select('category').not('category', 'is', null),
    ])
    if (err) { setError(err.message); setLoading(false); return }
    const countMap: Record<string, number> = {}
    for (const p of prods ?? []) {
      if (p.category) countMap[p.category] = (countMap[p.category] ?? 0) + 1
    }
    setCategories((cats ?? []).map((c: any) => ({ id: c.id, name: c.name, product_count: countMap[c.name] ?? 0 })))
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  async function addCategory() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    const { error: err } = await sb.from('categories').insert({ name })
    setSaving(false)
    if (err) { setError(err.message); return }
    setNewName(''); setShowAdd(false); load()
  }

  async function renameCategory() {
    if (!editingCat) return
    const name = editName.trim()
    if (!name || name === editingCat.name) { setEditingCat(null); return }
    setSaving(true)
    const { error: err } = await sb.from('categories').update({ name }).eq('id', editingCat.id)
    if (!err && editingCat.product_count > 0) {
      await sb.from('products').update({ category: name }).eq('category', editingCat.name)
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    setEditingCat(null); load()
  }

  async function deleteCategory(cat: Category) {
    if (cat.product_count > 0) return
    setDeletingId(cat.id)
    await sb.from('categories').delete().eq('id', cat.id)
    setDeletingId(null)
    setCategories(prev => prev.filter(c => c.id !== cat.id))
  }

  return (
    <div className="space-y-3 mt-1">
      <div className="flex items-center justify-between">
        <p className="text-gray-900 font-bold text-base">Kategori Produk</p>
        <button
          onClick={() => { setShowAdd(f => !f); setNewName(''); setError(null) }}
          className="text-sm font-semibold px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white transition-colors"
        >
          {showAdd ? 'Batal' : '+ Tambah Kategori'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-500/30 text-red-600 px-4 py-3 rounded-xl text-base space-y-1">
          <p className="font-semibold">Gagal memuat kategori</p>
          <p className="text-red-400 text-sm font-mono">{error}</p>
          <p className="text-gray-500 text-sm">Pastikan sudah menjalankan <code className="text-amber-600">schema_patch_categories.sql</code> di Supabase SQL Editor.</p>
        </div>
      )}

      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex gap-2">
          <input
            className="flex-1 bg-gray-100 text-gray-900 placeholder-gray-400 rounded-xl px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-orange-500 border border-gray-200"
            placeholder="Nama kategori baru…"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
            autoFocus
          />
          <button
            disabled={saving || !newName.trim()}
            onClick={addCategory}
            className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-white text-base font-semibold transition-colors whitespace-nowrap"
          >
            {saving ? '...' : 'Simpan'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-center mt-12 text-base">Memuat kategori...</p>
      ) : !error && categories.length === 0 ? (
        <p className="text-gray-500 text-center mt-12 text-base">
          Belum ada kategori — jalankan <code className="text-amber-600 text-sm">schema_patch_categories.sql</code> dulu
        </p>
      ) : (
        categories.map(cat => (
          <div key={cat.id} className="bg-white border border-gray-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            {editingCat?.id === cat.id ? (
              <>
                <input
                  className="flex-1 bg-gray-100 text-gray-900 rounded-xl px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-500 border border-orange-500/50"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') renameCategory(); if (e.key === 'Escape') setEditingCat(null) }}
                  autoFocus
                />
                <button disabled={saving} onClick={renameCategory}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-40">
                  {saving ? '...' : 'Simpan'}
                </button>
                <button onClick={() => setEditingCat(null)}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                  Batal
                </button>
              </>
            ) : (
              <>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <p className="text-gray-900 text-base font-medium">{cat.name}</p>
                  <span className={`text-sm px-2 py-0.5 rounded-full font-semibold ${
                    cat.product_count > 0 ? 'bg-orange-500/15 text-orange-500' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {cat.product_count} produk
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => { setEditingCat(cat); setEditName(cat.name); setError(null) }}
                    className="px-2.5 py-1.5 rounded-lg text-sm font-semibold bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200 transition-colors">Edit</button>
                  <button
                    onClick={() => deleteCategory(cat)}
                    disabled={cat.product_count > 0 || deletingId === cat.id}
                    title={cat.product_count > 0 ? `Tidak bisa dihapus — masih ada ${cat.product_count} produk` : 'Hapus kategori'}
                    className="px-2.5 py-1.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-red-50 text-red-600 border-red-500/30 hover:bg-red-500/20"
                  >
                    {deletingId === cat.id ? '...' : 'Hapus'}
                  </button>
                </div>
              </>
            )}
          </div>
        ))
      )}
    </div>
  )
}
