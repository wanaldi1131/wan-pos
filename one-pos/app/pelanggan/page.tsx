'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────
type CustomerCategory = 'retail' | 'toko'

type CustomerRecord = {
  id: number
  name: string
  phone: string | null
  address: string | null
  category: CustomerCategory
}

// ── Constants ──────────────────────────────────────────────────
const PAGE = 50

// ── Page ───────────────────────────────────────────────────────
export default function PelangganPage() {
  const sb = createClient()

  const [userRole, setUserRole] = useState<string | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [loadingCusts, setLoadingCusts] = useState(false)
  const [search, setSearch] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Form
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CustomerRecord | null>(null)
  const [fName, setFName] = useState('')
  const [fPhone, setFPhone] = useState('')
  const [fAddress, setFAddress] = useState('')
  const [fCategory, setFCategory] = useState<CustomerCategory>('retail')
  const [saving, setSaving] = useState(false)
  const [formMsg, setFormMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── Auth ────────────────────────────────────────────────────
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      sb.from('profiles').select('role').eq('id', data.user.id).single()
        .then(({ data: profile }) => {
          setUserRole(profile?.role ?? null)
          setLoadingUser(false)
        })
    })
  }, [])

  // ── Load customers ──────────────────────────────────────────
  const loadCustomers = useCallback(async (q: string) => {
    setLoadingCusts(true)
    setCustomers([])
    setHasMore(false)
    let query = sb.from('customers')
      .select('id, name, phone, address, category')
      .order('name')
      .range(0, PAGE - 1)
    if (q.trim()) query = query.ilike('name', `%${q.trim()}%`)
    const { data } = await query
    setCustomers(data ?? [])
    setHasMore((data ?? []).length === PAGE)
    setLoadingCusts(false)
  }, [sb])

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    let query = sb.from('customers')
      .select('id, name, phone, address, category')
      .order('name')
      .range(customers.length, customers.length + PAGE - 1)
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
    const { data } = await query
    setCustomers(prev => [...prev, ...(data ?? [])])
    setHasMore((data ?? []).length === PAGE)
    setLoadingMore(false)
  }

  // Tab open
  useEffect(() => {
    if (!loadingUser) loadCustomers(search)
  }, [loadingUser])

  // Search debounce
  useEffect(() => {
    if (loadingUser) return
    const t = setTimeout(() => loadCustomers(search), 350)
    return () => clearTimeout(t)
  }, [search])

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadingMore, customers.length])

  // ── Derived ─────────────────────────────────────────────────
  const isAdmin = userRole === 'admin' || userRole === 'owner'
  const isKasir = userRole === 'kasir'

  // ── Form helpers ────────────────────────────────────────────
  function openAdd() {
    setEditing(null)
    setFName('')
    setFPhone('')
    setFAddress('')
    setFCategory('retail')
    setFormMsg(null)
    setShowForm(true)
  }

  function openEdit(c: CustomerRecord) {
    setEditing(c)
    setFName(c.name)
    setFPhone(c.phone ?? '')
    setFAddress(c.address ?? '')
    setFCategory(c.category)
    setFormMsg(null)
    setShowForm(true)
  }

  async function save() {
    if (!fName.trim()) { setFormMsg({ ok: false, text: 'Nama wajib diisi' }); return }
    setSaving(true)
    setFormMsg(null)

    const payload = {
      name: fName.trim(),
      phone: fPhone.trim() || null,
      address: fAddress.trim() || null,
      // kasir selalu retail — enforced di RLS juga
      category: isKasir ? 'retail' as CustomerCategory : fCategory,
    }

    let error
    if (editing) {
      ;({ error } = await sb.from('customers').update(payload).eq('id', editing.id))
    } else {
      ;({ error } = await sb.from('customers').insert(payload))
    }

    if (error) {
      setFormMsg({ ok: false, text: error.message })
      setSaving(false)
      return
    }

    setFormMsg({ ok: true, text: editing ? 'Customer diperbarui.' : 'Customer ditambahkan.' })
    setShowForm(false)
    loadCustomers(search)
    setSaving(false)
  }

  // ── Render ──────────────────────────────────────────────────
  if (loadingUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <span className="text-gray-500 text-base">Memuat…</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <a href="/" className="text-gray-500 hover:text-gray-900 transition-colors text-base">← POS</a>
        <span className="text-gray-400">|</span>
        <h1 className="text-gray-900 font-semibold text-base">Daftar Customer</h1>
        <div className="flex-1" />
        <button
          onClick={openAdd}
          className="bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white text-base font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          + Tambah
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">

        {/* Search */}
        <input
          type="text"
          placeholder="Cari nama customer…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 placeholder-gray-400 text-base focus:outline-none focus:border-orange-500 mb-4"
        />

        {/* Form */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
            <h2 className="text-gray-900 font-semibold text-base mb-4">
              {editing ? 'Edit Customer' : 'Tambah Customer Baru'}
            </h2>

            <label className="block text-sm text-gray-500 mb-1">Nama *</label>
            <input
              type="text"
              value={fName}
              onChange={e => setFName(e.target.value)}
              placeholder="Nama customer"
              autoFocus
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 mb-3"
            />

            <label className="block text-sm text-gray-500 mb-1">No. HP</label>
            <input
              type="tel"
              value={fPhone}
              onChange={e => setFPhone(e.target.value)}
              placeholder="081234567890"
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 mb-3"
            />

            <label className="block text-sm text-gray-500 mb-1">Alamat</label>
            <textarea
              value={fAddress}
              onChange={e => setFAddress(e.target.value)}
              placeholder="Alamat lengkap"
              rows={2}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 mb-3 resize-none"
            />

            {/* Kategori */}
            <label className="block text-sm text-gray-500 mb-2">Kategori</label>
            {isAdmin ? (
              <div className="flex gap-2 mb-4">
                {(['retail', 'toko'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setFCategory(cat)}
                    className={`flex-1 py-2 rounded-lg text-base font-medium border transition-colors ${
                      fCategory === cat
                        ? 'bg-orange-600 border-orange-500 text-white'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {cat === 'toko' ? 'Toko' : 'Retail'}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-4">
                <span className="inline-block text-base text-blue-400 bg-blue-500/15 border border-blue-500/20 rounded-lg px-3 py-1.5">
                  Retail
                </span>
              </div>
            )}

            {formMsg && (
              <p className={`text-sm mb-3 ${formMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                {formMsg.text}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg text-base border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 rounded-lg text-base bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        )}

        {/* List */}
        {loadingCusts ? (
          <p className="text-center text-gray-500 py-12 text-base">Memuat…</p>
        ) : customers.length === 0 ? (
          <p className="text-center text-gray-500 py-12 text-base">
            {search ? 'Tidak ada customer yang cocok.' : 'Belum ada customer.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {customers.map(c => (
              <div key={c.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-900 text-base font-medium">{c.name}</span>
                    <span className={`text-sm px-1.5 py-0.5 rounded font-medium shrink-0 ${
                      c.category === 'toko'
                        ? 'bg-amber-500/20 text-amber-600'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {c.category === 'toko' ? 'Toko' : 'Retail'}
                    </span>
                  </div>
                  {c.phone && (
                    <p className="text-gray-500 text-sm mt-0.5">{c.phone}</p>
                  )}
                  {c.address && (
                    <p className="text-gray-500 text-sm mt-0.5 truncate">{c.address}</p>
                  )}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => openEdit(c)}
                    className="text-gray-500 hover:text-gray-700 text-sm shrink-0 transition-colors pt-0.5"
                  >
                    Edit
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-10 flex items-center justify-center mt-2">
          {loadingMore && (
            <span className="text-gray-500 text-sm">Memuat lebih banyak…</span>
          )}
        </div>

      </div>
    </div>
  )
}
