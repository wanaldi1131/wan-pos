'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

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

const fmtRp = (n: number) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n)

export default function TabSupplier({ user }: { user: User }) {
  const sb = createClient()

  const [suppliers, setSuppliers]   = useState<Supplier[]>([])
  const [loading, setLoading]       = useState(false)
  const [debtMap, setDebtMap]       = useState<Record<number, number>>({})

  const [showAddForm, setShowAddForm]       = useState(false)
  const [editingId, setEditingId]           = useState<number | null>(null)
  const [fName, setFName]                   = useState('')
  const [fAddress, setFAddress]             = useState('')
  const [fNpwp, setFNpwp]                   = useState('')
  const [fPhone, setFPhone]                 = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [supplierMsg, setSupplierMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const [salesmanRows, setSalesmanRows]     = useState<SalesmanRow[]>([])

  const [addSalesmanFor, setAddSalesmanFor] = useState<number | null>(null)
  const [sName, setSName]                   = useState('')
  const [sPhone, setSPhone]                 = useState('')
  const [savingSalesman, setSavingSalesman] = useState(false)
  const [togglingSmId, setTogglingSmId]     = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: supData }, { data: piData }] = await Promise.all([
      sb.from('suppliers')
        .select('id, name, address, npwp, phone, supplier_salesmen(id, supplier_id, name, phone, active)')
        .order('name'),
      sb.from('purchase_invoices')
        .select('supplier_id, total, purchase_invoice_payments(amount)')
        .is('paid_at', null),
    ])
    setSuppliers((supData ?? []) as Supplier[])

    const map: Record<number, number> = {}
    for (const pi of (piData ?? []) as any[]) {
      const paid      = (pi.purchase_invoice_payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0)
      const remaining = Math.max(0, Number(pi.total) - paid)
      if (remaining > 0) map[pi.supplier_id] = (map[pi.supplier_id] ?? 0) + remaining
    }
    setDebtMap(map)
    setLoading(false)
  }, [sb])

  useEffect(() => { load() }, [load])

  function addSmRow() {
    setSalesmanRows(r => [...r, { rowId: Math.random().toString(36).slice(2), name: '', phone: '' }])
  }
  function removeSmRow(rowId: string) {
    setSalesmanRows(r => r.filter(x => x.rowId !== rowId))
  }
  function updateSmRow(rowId: string, field: 'name' | 'phone', value: string) {
    setSalesmanRows(r => r.map(x => x.rowId === rowId ? { ...x, [field]: value } : x))
  }

  function openAdd() {
    setEditingId(null)
    setFName(''); setFAddress(''); setFNpwp(''); setFPhone('')
    setSalesmanRows([])
    setSupplierMsg(null)
    setShowAddForm(true)
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

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-gray-900 font-bold text-base">Daftar Supplier</p>
        <button
          onClick={openAdd}
          className="bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          + Tambah
        </button>
      </div>

      <div className="space-y-3">
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

        {loading ? (
          <p className="text-center text-gray-500 py-12 text-base">Memuat…</p>
        ) : suppliers.length === 0 && !showAddForm ? (
          <p className="text-center text-gray-500 py-12 text-base">Belum ada supplier.</p>
        ) : (
          suppliers.map(s => {
            const activeSalesmen   = s.supplier_salesmen.filter(sm => sm.active)
            const inactiveSalesmen = s.supplier_salesmen.filter(sm => !sm.active)
            const isEditing        = editingId === s.id
            const debt             = debtMap[s.id] ?? 0

            return (
              <div key={s.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
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
                    <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-900 font-semibold text-base">{s.name}</p>
                        {s.npwp    && <p className="text-gray-500 text-sm mt-0.5">NPWP: {s.npwp}</p>}
                        {s.phone   && <p className="text-gray-500 text-sm mt-0.5">Telp: {s.phone}</p>}
                        {s.address && <p className="text-gray-500 text-sm mt-0.5">{s.address}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {debt > 0 ? (
                          <span className="text-red-600 text-sm font-semibold">{fmtRp(debt)}</span>
                        ) : (
                          <span className="text-green-600 text-xs font-medium">Lunas</span>
                        )}
                        <button
                          onClick={() => openEdit(s)}
                          className="text-gray-500 hover:text-gray-700 text-sm transition-colors"
                        >
                          Edit
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-gray-200 px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-500 text-sm font-medium uppercase tracking-wide">Salesman</span>
                        <button
                          onClick={() => openAddSalesman(s.id)}
                          className="text-orange-400 hover:text-orange-600 text-sm transition-colors"
                        >
                          + Tambah
                        </button>
                      </div>

                      {activeSalesmen.length === 0 && inactiveSalesmen.length === 0 && (
                        <p className="text-gray-700 text-sm py-1">Belum ada salesman.</p>
                      )}
                      {activeSalesmen.map(sm => (
                        <div key={sm.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                          <div>
                            <span className="text-gray-900 text-base">{sm.name}</span>
                            {sm.phone && <span className="text-gray-500 text-sm ml-2">{sm.phone}</span>}
                          </div>
                          <button
                            onClick={() => toggleSalesman(sm.id, true)}
                            disabled={togglingSmId === sm.id}
                            className="text-gray-500 hover:text-red-600 text-sm transition-colors disabled:opacity-40"
                          >
                            {togglingSmId === sm.id ? '…' : 'Hapus'}
                          </button>
                        </div>
                      ))}

                      {addSalesmanFor === s.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-sm text-gray-500 mb-2">Tambah Salesman</p>
                          <input
                            type="text" value={sName} onChange={e => setSName(e.target.value)}
                            placeholder="Nama salesman *" autoFocus
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 mb-2"
                          />
                          <input
                            type="tel" value={sPhone} onChange={e => setSPhone(e.target.value)}
                            placeholder="No. HP salesman"
                            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 mb-2"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setAddSalesmanFor(null)}
                              className="flex-1 py-1.5 rounded-lg text-sm border border-gray-200 text-gray-500 hover:text-gray-900 transition-colors">
                              Batal
                            </button>
                            <button onClick={saveSalesman} disabled={savingSalesman || !sName.trim()}
                              className="flex-1 py-1.5 rounded-lg text-sm bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors disabled:opacity-40">
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

function SupplierForm({
  title, fName, setFName, fAddress, setFAddress, fNpwp, setFNpwp, fPhone, setFPhone,
  saving, msg, onSave, onCancel,
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
  salesmanRows?: SalesmanRow[]
  onAddRow?: () => void
  onRemoveRow?: (rowId: string) => void
  onUpdateRow?: (rowId: string, field: 'name' | 'phone', value: string) => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <h2 className="text-gray-900 font-semibold text-base mb-4">{title}</h2>

      <label className="block text-sm text-gray-500 mb-1">Nama Supplier *</label>
      <input type="text" value={fName} onChange={e => setFName(e.target.value)}
        placeholder="PT Contoh Supplier" autoFocus
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 mb-3" />

      <label className="block text-sm text-gray-500 mb-1">NPWP</label>
      <input type="text" value={fNpwp} onChange={e => setFNpwp(e.target.value)}
        placeholder="01.234.567.8-901.000"
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 mb-3" />

      <label className="block text-sm text-gray-500 mb-1">No. Telp Kantor</label>
      <input type="tel" value={fPhone} onChange={e => setFPhone(e.target.value)}
        placeholder="021-1234567"
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 mb-3" />

      <label className="block text-sm text-gray-500 mb-1">Alamat</label>
      <textarea value={fAddress} onChange={e => setFAddress(e.target.value)}
        placeholder="Jl. Contoh No. 1, Jakarta" rows={2}
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500 mb-4 resize-none" />

      {salesmanRows !== undefined && (
        <div className="border-t border-gray-200 pt-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500 font-medium">Salesman <span className="font-normal">(opsional)</span></span>
            <button type="button" onClick={onAddRow}
              className="text-orange-400 hover:text-orange-600 text-sm transition-colors">
              + Tambah baris
            </button>
          </div>
          {salesmanRows.length === 0 ? (
            <p className="text-gray-700 text-sm py-1">Klik "+ Tambah baris" untuk langsung daftarkan salesman.</p>
          ) : (
            <div className="space-y-2">
              {salesmanRows.map((row, i) => (
                <div key={row.rowId} className="flex gap-2 items-center">
                  <input type="text" value={row.name}
                    onChange={e => onUpdateRow?.(row.rowId, 'name', e.target.value)}
                    placeholder={`Nama salesman ${i + 1} *`}
                    autoFocus={i === salesmanRows.length - 1}
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
                  <input type="tel" value={row.phone}
                    onChange={e => onUpdateRow?.(row.rowId, 'phone', e.target.value)}
                    placeholder="No. HP"
                    className="w-32 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-base placeholder-gray-400 focus:outline-none focus:border-orange-500" />
                  <button type="button" onClick={() => onRemoveRow?.(row.rowId)}
                    className="text-gray-500 hover:text-red-600 text-base leading-none transition-colors shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {msg && (
        <p className={`text-sm mb-3 ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>
      )}

      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 py-2 rounded-lg text-base border border-gray-200 text-gray-500 hover:text-gray-900 hover:border-gray-300 transition-colors">
          Batal
        </button>
        <button onClick={onSave} disabled={saving}
          className="flex-1 py-2 rounded-lg text-base bg-orange-600 hover:bg-orange-500 text-white font-medium transition-colors disabled:opacity-50">
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
      </div>
    </div>
  )
}
