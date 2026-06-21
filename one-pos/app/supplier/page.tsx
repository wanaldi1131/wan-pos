'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// ── Types ──────────────────────────────────────────────────────
type Salesman = {
  id: number
  supplier_id: number
  name: string
  phone: string | null
  active: boolean
}

type Supplier = {
  id: number
  name: string
  address: string | null
  npwp: string | null
  phone: string | null
  supplier_salesmen: Salesman[]
}

type SalesmanRow = { rowId: string; name: string; phone: string }

// ── Page ───────────────────────────────────────────────────────
export default function SupplierPage() {
  const sb = createClient()

  const [userRole, setUserRole]   = useState<string | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading]     = useState(false)

  // Supplier form
  const [showAddForm, setShowAddForm]     = useState(false)
  const [editingId, setEditingId]         = useState<number | null>(null)
  const [fName, setFName]                 = useState('')
  const [fAddress, setFAddress]           = useState('')
  const [fNpwp, setFNpwp]                 = useState('')
  const [fPhone, setFPhone]               = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [supplierMsg, setSupplierMsg]     = useState<{ ok: boolean; text: string } | null>(null)
  // Baris salesman dalam form "Tambah Supplier"
  const [salesmanRows, setSalesmanRows]   = useState<SalesmanRow[]>([])

  // Salesman form
  const [addSalesmanFor, setAddSalesmanFor] = useState<number | null>(null)
  const [sName, setSName]                   = useState('')
  const [sPhone, setSPhone]                 = useState('')
  const [savingSalesman, setSavingSalesman] = useState(false)
  const [togglingSmId, setTogglingSmId]     = useState<number | null>(null)

  // ── Auth ──────────────────────────────────────────────────
  useEffect(() => {
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      sb.from('profiles').select('role').eq('id', data.user.id).single()
        .then(({ data: profile }) => {
          const role = profile?.role ?? null
          setUserRole(role)
          setLoadingUser(false)
          if (role !== 'admin' && role !== 'owner') {
            window.location.href = '/admin'
          }
        })
    })
  }, [])

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('suppliers')
      .select('id, name, address, npwp, phone, supplier_salesmen(id, supplier_id, name, phone, active)')
      .order('name')
    setSuppliers((data ?? []) as Supplier[])
    setLoading(false)
  }, [sb])

  useEffect(() => {
    if (!loadingUser && (userRole === 'admin' || userRole === 'owner')) load()
  }, [loadingUser])

  // ── Supplier form helpers ───────────────────────────────────
  function openAdd() {
    setEditingId(null)
    setFName(''); setFAddress(''); setFNpwp(''); setFPhone('')
    setSalesmanRows([])
    setSupplierMsg(null)
    setShowAddForm(true)
  }

  function addSmRow() {
    setSalesmanRows(r => [...r, { rowId: Math.random().toString(36).slice(2), name: '', phone: '' }])
  }
  function removeSmRow(rowId: string) {
    setSalesmanRows(r => r.filter(x => x.rowId !== rowId))
  }
  function updateSmRow(rowId: string, field: 'name' | 'phone', value: string) {
    setSalesmanRows(r => r.map(x => x.rowId === rowId ? { ...x, [field]: value } : x))
  }

  function openEdit(s: Supplier) {
    setShowAddForm(false)
    setEditingId(s.id)
    setFName(s.name)
    setFAddress(s.address ?? '')
    setFNpwp(s.npwp ?? '')
    setFPhone(s.phone ?? '')
    setSupplierMsg(null)
  }

  function cancelForm() {
    setShowAddForm(false)
    setEditingId(null)
    setSupplierMsg(null)
  }

  async function saveSupplier() {
    if (!fName.trim()) { setSupplierMsg({ ok: false, text: 'Nama wajib diisi' }); return }
    setSavingSupplier(true)
    setSupplierMsg(null)
    const payload = {
      name:    fName.trim(),
      address: fAddress.trim() || null,
      npwp:    fNpwp.trim()    || null,
      phone:   fPhone.trim()   || null,
    }
    if (editingId !== null) {
      const { error } = await sb.from('suppliers').update(payload).eq('id', editingId)
      if (error) { setSupplierMsg({ ok: false, text: error.message }); setSavingSupplier(false); return }
    } else {
      const { data: newSup, error } = await sb.from('suppliers').insert(payload).select('id').single()
      if (error || !newSup) { setSupplierMsg({ ok: false, text: error?.message ?? 'Gagal menyimpan' }); setSavingSupplier(false); return }
      const validRows = salesmanRows.filter(r => r.name.trim())
      if (validRows.length > 0) {
        const { error: smErr } = await sb.from('supplier_salesmen').insert(
          validRows.map(r => ({ supplier_id: newSup.id, name: r.name.trim(), phone: r.phone.trim() || null }))
        )
        if (smErr) { setSupplierMsg({ ok: false, text: smErr.message }); setSavingSupplier(false); return }
      }
    }
    cancelForm()
    load()
    setSavingSupplier(false)
  }

  // ── Salesman helpers ────────────────────────────────────────
  function openAddSalesman(supplierId: number) {
    setAddSalesmanFor(supplierId)
    setSName(''); setSPhone('')
  }

  async function saveSalesman() {
    if (!sName.trim() || addSalesmanFor === null) return
    setSavingSalesman(true)
    await sb.from('supplier_salesmen').insert({
      supplier_id: addSalesmanFor,
      name:  sName.trim(),
      phone: sPhone.trim() || null,
    })
    setAddSalesmanFor(null)
    setSName(''); setSPhone('')
    load()
    setSavingSalesman(false)
  }

  async function toggleSalesman(id: number, currentActive: boolean) {
    setTogglingSmId(id)
    await sb.from('supplier_salesmen').update({ active: !currentActive }).eq('id', id)
    setTogglingSmId(null)
    load()
  }

  // ── Render ──────────────────────────────────────────────────
  if (loadingUser) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
        <span className="text-gray-500 text-sm">Memuat…</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white pb-24">

      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0f0f0f]/95 backdrop-blur border-b border-white/8 px-4 py-3 flex items-center gap-3">
        <a href="/admin" className="text-gray-500 hover:text-white transition-colors text-sm">← Admin</a>
        <span className="text-white/15">|</span>
        <h1 className="text-white font-semibold text-sm">Supplier</h1>
        <div className="flex-1" />
        <button
          onClick={openAdd}
          className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          + Tambah
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">

        {/* Form tambah supplier baru */}
        {showAddForm && (
          <SupplierForm
            title="Tambah Supplier"
            fName={fName} setFName={setFName}
            fAddress={fAddress} setFAddress={setFAddress}
            fNpwp={fNpwp} setFNpwp={setFNpwp}
            fPhone={fPhone} setFPhone={setFPhone}
            saving={savingSupplier}
            msg={supplierMsg}
            onSave={saveSupplier}
            onCancel={cancelForm}
            salesmanRows={salesmanRows}
            onAddRow={addSmRow}
            onRemoveRow={removeSmRow}
            onUpdateRow={updateSmRow}
          />
        )}

        {/* Daftar supplier */}
        {loading ? (
          <p className="text-center text-gray-600 py-12 text-sm">Memuat…</p>
        ) : suppliers.length === 0 && !showAddForm ? (
          <p className="text-center text-gray-600 py-12 text-sm">Belum ada supplier.</p>
        ) : (
          suppliers.map(s => {
            const activeSalesmen   = s.supplier_salesmen.filter(sm => sm.active)
            const inactiveSalesmen = s.supplier_salesmen.filter(sm => !sm.active)
            const isEditing        = editingId === s.id

            return (
              <div key={s.id} className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">

                {/* Supplier edit form (inline) */}
                {isEditing ? (
                  <div className="p-4">
                    <SupplierForm
                      title={`Edit — ${s.name}`}
                      fName={fName} setFName={setFName}
                      fAddress={fAddress} setFAddress={setFAddress}
                      fNpwp={fNpwp} setFNpwp={setFNpwp}
                      fPhone={fPhone} setFPhone={setFPhone}
                      saving={savingSupplier}
                      msg={supplierMsg}
                      onSave={saveSupplier}
                      onCancel={cancelForm}
                    />
                  </div>
                ) : (
                  <>
                    {/* Header supplier */}
                    <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm">{s.name}</p>
                        {s.npwp && (
                          <p className="text-gray-500 text-xs mt-0.5">NPWP: {s.npwp}</p>
                        )}
                        {s.phone && (
                          <p className="text-gray-500 text-xs mt-0.5">Telp: {s.phone}</p>
                        )}
                        {s.address && (
                          <p className="text-gray-600 text-xs mt-0.5">{s.address}</p>
                        )}
                      </div>
                      <button
                        onClick={() => openEdit(s)}
                        className="text-gray-600 hover:text-gray-300 text-xs shrink-0 transition-colors"
                      >
                        Edit
                      </button>
                    </div>

                    {/* Salesmen */}
                    <div className="border-t border-white/8 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">Salesman</span>
                        <button
                          onClick={() => openAddSalesman(s.id)}
                          className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors"
                        >
                          + Tambah
                        </button>
                      </div>

                      {/* Active salesmen */}
                      {activeSalesmen.length === 0 && inactiveSalesmen.length === 0 && (
                        <p className="text-gray-700 text-xs py-1">Belum ada salesman.</p>
                      )}
                      {activeSalesmen.map(sm => (
                        <div key={sm.id} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                          <div>
                            <span className="text-white text-sm">{sm.name}</span>
                            {sm.phone && (
                              <span className="text-gray-500 text-xs ml-2">{sm.phone}</span>
                            )}
                          </div>
                          <button
                            onClick={() => toggleSalesman(sm.id, true)}
                            disabled={togglingSmId === sm.id}
                            className="text-gray-600 hover:text-red-400 text-xs transition-colors disabled:opacity-40"
                          >
                            {togglingSmId === sm.id ? '…' : 'Hapus'}
                          </button>
                        </div>
                      ))}

                      {/* Inline form tambah salesman */}
                      {addSalesmanFor === s.id && (
                        <div className="mt-3 pt-3 border-t border-white/8">
                          <p className="text-xs text-gray-400 mb-2">Tambah Salesman</p>
                          <input
                            type="text"
                            value={sName}
                            onChange={e => setSName(e.target.value)}
                            placeholder="Nama salesman *"
                            autoFocus
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 mb-2"
                          />
                          <input
                            type="tel"
                            value={sPhone}
                            onChange={e => setSPhone(e.target.value)}
                            placeholder="No. HP salesman"
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 mb-2"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setAddSalesmanFor(null)}
                              className="flex-1 py-1.5 rounded-lg text-xs border border-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                              Batal
                            </button>
                            <button
                              onClick={saveSalesman}
                              disabled={savingSalesman || !sName.trim()}
                              className="flex-1 py-1.5 rounded-lg text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-40"
                            >
                              {savingSalesman ? 'Menyimpan…' : 'Simpan'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Supplier Form (shared untuk add & edit) ────────────────────
function SupplierForm({
  title,
  fName, setFName,
  fAddress, setFAddress,
  fNpwp, setFNpwp,
  fPhone, setFPhone,
  saving, msg,
  onSave, onCancel,
  salesmanRows, onAddRow, onRemoveRow, onUpdateRow,
}: {
  title: string
  fName: string; setFName: (v: string) => void
  fAddress: string; setFAddress: (v: string) => void
  fNpwp: string; setFNpwp: (v: string) => void
  fPhone: string; setFPhone: (v: string) => void
  saving: boolean
  msg: { ok: boolean; text: string } | null
  onSave: () => void
  onCancel: () => void
  // opsional — hanya di-pass saat tambah supplier baru
  salesmanRows?: SalesmanRow[]
  onAddRow?: () => void
  onRemoveRow?: (rowId: string) => void
  onUpdateRow?: (rowId: string, field: 'name' | 'phone', value: string) => void
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <h2 className="text-white font-semibold text-sm mb-4">{title}</h2>

      <label className="block text-xs text-gray-400 mb-1">Nama Supplier *</label>
      <input
        type="text"
        value={fName}
        onChange={e => setFName(e.target.value)}
        placeholder="PT Contoh Supplier"
        autoFocus
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 mb-3"
      />

      <label className="block text-xs text-gray-400 mb-1">NPWP</label>
      <input
        type="text"
        value={fNpwp}
        onChange={e => setFNpwp(e.target.value)}
        placeholder="01.234.567.8-901.000"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 mb-3"
      />

      <label className="block text-xs text-gray-400 mb-1">No. Telp Kantor</label>
      <input
        type="tel"
        value={fPhone}
        onChange={e => setFPhone(e.target.value)}
        placeholder="021-1234567"
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 mb-3"
      />

      <label className="block text-xs text-gray-400 mb-1">Alamat</label>
      <textarea
        value={fAddress}
        onChange={e => setFAddress(e.target.value)}
        placeholder="Jl. Contoh No. 1, Jakarta"
        rows={2}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500 mb-4 resize-none"
      />

      {/* Salesman — hanya saat tambah supplier baru */}
      {salesmanRows !== undefined && (
        <div className="border-t border-white/8 pt-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400 font-medium">
              Salesman <span className="text-gray-600 font-normal">(opsional)</span>
            </span>
            <button
              type="button"
              onClick={onAddRow}
              className="text-indigo-400 hover:text-indigo-300 text-xs transition-colors"
            >
              + Tambah baris
            </button>
          </div>

          {salesmanRows.length === 0 ? (
            <p className="text-gray-700 text-xs py-1">
              Klik "+ Tambah baris" untuk langsung daftarkan salesman.
            </p>
          ) : (
            <div className="space-y-2">
              {salesmanRows.map((row, i) => (
                <div key={row.rowId} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={row.name}
                    onChange={e => onUpdateRow?.(row.rowId, 'name', e.target.value)}
                    placeholder={`Nama salesman ${i + 1} *`}
                    autoFocus={i === salesmanRows.length - 1}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="tel"
                    value={row.phone}
                    onChange={e => onUpdateRow?.(row.rowId, 'phone', e.target.value)}
                    placeholder="No. HP"
                    className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveRow?.(row.rowId)}
                    className="text-gray-600 hover:text-red-400 text-sm leading-none transition-colors shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {msg && (
        <p className={`text-xs mb-3 ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg text-sm border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-colors"
        >
          Batal
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 py-2 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  )
}
