'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────

type Action = 'view' | 'create' | 'edit'
type Perms  = Record<string, boolean>

type Role = { id: number; name: string; permissions: Perms }

type Resource = { key: string; label: string; group: string; actions: Action[] }

// ── Constants ──────────────────────────────────────────────────

const ACTION_LABELS: Record<Action, string> = {
  view:   'Lihat',
  create: 'Buat',
  edit:   'Edit',
}

const RESOURCES: Resource[] = [
  { key: 'pos',                      label: 'POS',                group: 'Halaman Utama', actions: ['view'] },
  { key: 'dashboard',                label: 'Dashboard',          group: 'Halaman Utama', actions: ['view'] },
  { key: 'kas',                      label: 'Kas',                group: 'Halaman Utama', actions: ['view', 'create'] },
  { key: 'pelanggan',                label: 'Pelanggan',          group: 'Halaman Utama', actions: ['view', 'create', 'edit'] },
  { key: 'history',                  label: 'Riwayat',            group: 'Halaman Utama', actions: ['view'] },
  { key: 'admin.stok',               label: 'Stok',               group: 'Tab Admin',     actions: ['view'] },
  { key: 'admin.transfer',           label: 'Transfer Stok',      group: 'Tab Admin',     actions: ['view', 'create'] },
  { key: 'admin.penerimaan',         label: 'Penerimaan Barang',  group: 'Tab Admin',     actions: ['view', 'create'] },
  { key: 'admin.selisih_stok',       label: 'Selisih Stok',       group: 'Tab Admin',     actions: ['view'] },
  { key: 'admin.produk',             label: 'Produk',             group: 'Tab Admin',     actions: ['view', 'create', 'edit'] },
  { key: 'admin.kategori',           label: 'Kategori',           group: 'Tab Admin',     actions: ['view', 'create', 'edit'] },
  { key: 'admin.supplier',           label: 'Supplier',           group: 'Tab Admin',     actions: ['view', 'create', 'edit'] },
  { key: 'admin.retur_supplier',     label: 'Retur Supplier',     group: 'Tab Admin',     actions: ['view', 'create'] },
  { key: 'admin.invoice_pembelian',  label: 'Invoice Pembelian',  group: 'Tab Admin',     actions: ['view', 'create', 'edit'] },
  { key: 'admin.pembayaran_invoice', label: 'Pembayaran Invoice', group: 'Tab Admin',     actions: ['view', 'create'] },
  { key: 'admin.price_lists',        label: 'Price Lists',        group: 'Tab Admin',     actions: ['view', 'create', 'edit'] },
  { key: 'admin.warehouse',          label: 'Gudang',             group: 'Tab Admin',     actions: ['view', 'edit'] },
  { key: 'admin.kasir',              label: 'Kasir',              group: 'Tab Admin',     actions: ['view', 'create', 'edit'] },
  { key: 'admin.role',               label: 'Role',               group: 'Tab Admin',     actions: ['view', 'create', 'edit'] },
]

const GROUPS = ['Halaman Utama', 'Tab Admin']

// ── Helpers ────────────────────────────────────────────────────

function permKey(resourceKey: string, action: Action) {
  return `${resourceKey}.${action}`
}

function applyToggle(perms: Perms, resourceKey: string, action: Action, value: boolean): Perms {
  const next = { ...perms }
  next[permKey(resourceKey, action)] = value

  if (value && action !== 'view') {
    // centang create/edit → otomatis centang view
    next[permKey(resourceKey, 'view')] = true
  }
  if (!value && action === 'view') {
    // hapus centang view → hapus semua action resource ini
    next[permKey(resourceKey, 'create')] = false
    next[permKey(resourceKey, 'edit')]   = false
  }
  return next
}

// ── Component ──────────────────────────────────────────────────

export default function TabRole({ user: _user }: { user: User }) {
  const sb = createClient()

  const [roles, setRoles]           = useState<Role[]>([])
  const [userCounts, setUserCounts] = useState<Record<string, number>>({})
  const [loading, setLoading]       = useState(false)
  const [selected, setSelected]     = useState<Role | null>(null)

  // Form tambah role baru
  const [showNew, setShowNew]     = useState(false)
  const [newName, setNewName]     = useState('')
  const [creating, setCreating]   = useState(false)

  // Edit nama role
  const [editingName, setEditingName] = useState(false)
  const [editName, setEditName]       = useState('')
  const [savingName, setSavingName]   = useState(false)

  // Permission state (local, optimistic)
  const [localPerms, setLocalPerms] = useState<Perms>({})
  const [saving, setSaving]         = useState(false)
  const [saveErr, setSaveErr]       = useState<string | null>(null)

  // ── Load ─────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: rs }, { data: profs }] = await Promise.all([
      sb.from('roles').select('id, name, permissions').order('name'),
      sb.from('profiles').select('role').eq('active', true),
    ])
    setRoles((rs ?? []) as Role[])
    const counts: Record<string, number> = {}
    for (const p of profs ?? []) {
      const r = p.role as string
      counts[r] = (counts[r] ?? 0) + 1
    }
    setUserCounts(counts)
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  // ── Actions ───────────────────────────────────────────────────

  function openRole(role: Role) {
    setSelected(role)
    setLocalPerms(role.permissions ?? {})
    setEditName(role.name)
    setEditingName(false)
    setSaveErr(null)
  }

  async function createRole() {
    if (!newName.trim()) return
    setCreating(true)
    const emptyPerms: Perms = {}
    RESOURCES.forEach(r => r.actions.forEach(a => { emptyPerms[permKey(r.key, a)] = false }))
    const { error } = await sb.from('roles').insert({ name: newName.trim(), permissions: emptyPerms })
    if (error) { alert(error.message); setCreating(false); return }
    setNewName(''); setShowNew(false); setCreating(false); load()
  }

  async function savePermissions(perms: Perms) {
    if (!selected) return
    setSaving(true); setSaveErr(null)
    const { error } = await sb.from('roles')
      .update({ permissions: perms })
      .eq('id', selected.id)
    if (error) {
      setSaveErr(error.message)
      setLocalPerms(selected.permissions) // revert
    } else {
      setSelected(prev => prev ? { ...prev, permissions: perms } : prev)
      setRoles(prev => prev.map(r => r.id === selected.id ? { ...r, permissions: perms } : r))
    }
    setSaving(false)
  }

  function onToggle(resourceKey: string, action: Action, value: boolean) {
    const next = applyToggle(localPerms, resourceKey, action, value)
    setLocalPerms(next)
    savePermissions(next)
  }

  async function saveName() {
    if (!selected || !editName.trim()) return
    setSavingName(true)
    const { error } = await sb.from('roles').update({ name: editName.trim() }).eq('id', selected.id)
    if (error) { alert(error.message); setSavingName(false); return }
    setSelected(prev => prev ? { ...prev, name: editName.trim() } : prev)
    setRoles(prev => prev.map(r => r.id === selected.id ? { ...r, name: editName.trim() } : r))
    setSavingName(false); setEditingName(false)
  }

  async function deleteRole() {
    if (!selected) return
    const count = userCounts[selected.name] ?? 0
    if (count > 0) {
      alert(`Role "${selected.name}" masih digunakan oleh ${count} karyawan. Pindahkan mereka ke role lain dulu.`)
      return
    }
    if (!confirm(`Hapus role "${selected.name}"?`)) return
    await sb.from('roles').delete().eq('id', selected.id)
    setSelected(null); load()
  }

  // ── Render: detail role ───────────────────────────────────────

  if (selected) {
    const userCount = userCounts[selected.name] ?? 0

    return (
      <div className="pb-8">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => { setSelected(null); load() }}
            className="text-gray-500 hover:text-gray-900 text-sm transition-colors">← Kembali</button>
          <p className="text-gray-900 font-bold text-base flex-1">{selected.name}</p>
          {saving && <span className="text-gray-400 text-xs">Menyimpan…</span>}
        </div>

        {saveErr && (
          <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-2 mb-3">{saveErr}</p>
        )}

        {/* Nama + hapus */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-3 space-y-3">
          <div>
            <p className="text-sm text-gray-500 mb-1">Nama Role</p>
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
                  className="text-orange-600 hover:text-orange-700 text-sm font-medium transition-colors">Ubah</button>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              {userCount > 0 ? `Digunakan oleh ${userCount} karyawan` : 'Belum ada karyawan dengan role ini'}
            </p>
            <button onClick={deleteRole}
              className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors">
              Hapus Role
            </button>
          </div>
        </div>

        {/* Permission matrix */}
        {GROUPS.map(group => {
          const resources = RESOURCES.filter(r => r.group === group)
          return (
            <div key={group} className="bg-white border border-gray-200 rounded-2xl p-4 mb-3">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">{group}</p>
              <div className="space-y-1">
                {/* Header kolom */}
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <span className="flex-1 text-xs text-gray-400">Fitur</span>
                  {(['view', 'create', 'edit'] as Action[]).map(a => (
                    <span key={a} className="w-12 text-center text-xs text-gray-400">{ACTION_LABELS[a]}</span>
                  ))}
                </div>

                {resources.map(res => (
                  <div key={res.key} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                    <span className="flex-1 text-gray-800 text-sm">{res.label}</span>
                    {(['view', 'create', 'edit'] as Action[]).map(action => {
                      const hasAction  = res.actions.includes(action)
                      const pk         = permKey(res.key, action)
                      const checked    = !!localPerms[pk]
                      return (
                        <div key={action} className="w-12 flex justify-center">
                          {hasAction ? (
                            <button
                              onClick={() => onToggle(res.key, action, !checked)}
                              disabled={saving}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors disabled:opacity-50 ${
                                checked
                                  ? 'bg-orange-600 border-orange-600'
                                  : 'bg-white border-gray-300 hover:border-orange-400'
                              }`}
                            >
                              {checked && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </button>
                          ) : (
                            <span className="w-5 h-5 flex items-center justify-center text-gray-200 text-xs">—</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Render: list ──────────────────────────────────────────────

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-900 font-bold text-base">Role & Akses</p>
        <button onClick={() => setShowNew(v => !v)}
          className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors">
          + Buat Role
        </button>
      </div>

      {showNew && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4">
          <label className="block text-sm text-gray-500 mb-1">Nama Role</label>
          <div className="flex gap-2">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createRole()}
              placeholder="cth: Supervisor, Gudang"
              className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
            <button onClick={() => { setShowNew(false); setNewName('') }}
              className="px-3 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors">Batal</button>
            <button onClick={createRole} disabled={creating || !newName.trim()}
              className="px-3 py-2 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40">
              {creating ? '…' : 'Simpan'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-500 py-12 text-base">Memuat…</p>
      ) : roles.length === 0 ? (
        <p className="text-center text-gray-500 py-12 text-base">Belum ada role.</p>
      ) : (
        <div className="space-y-2">
          {roles.map(role => {
            const count     = userCounts[role.name] ?? 0
            const granted   = Object.values(role.permissions ?? {}).filter(Boolean).length
            const total     = RESOURCES.reduce((s, r) => s + r.actions.length, 0)
            return (
              <button key={role.id} onClick={() => openRole(role)}
                className="w-full bg-white border border-gray-200 hover:border-orange-300 rounded-2xl px-4 py-3 text-left transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-gray-900 font-semibold text-base">{role.name}</p>
                    <p className="text-gray-400 text-sm mt-0.5">
                      {count > 0 ? `${count} karyawan` : 'Belum ada karyawan'}
                      <span className="mx-1.5">·</span>
                      {granted}/{total} akses aktif
                    </p>
                  </div>
                  <div className="shrink-0">
                    {/* Mini permission bar */}
                    <div className="flex gap-0.5">
                      {RESOURCES.slice(0, 8).map(r => {
                        const hasAny = r.actions.some(a => role.permissions?.[permKey(r.key, a)])
                        return (
                          <div key={r.key}
                            className={`w-2 h-6 rounded-sm ${hasAny ? 'bg-orange-400' : 'bg-gray-200'}`}
                            title={r.label}
                          />
                        )
                      })}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
