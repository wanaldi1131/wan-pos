'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import TabAntaran          from './_tabs/TabAntaran'
import TabBelumLunas       from './_tabs/TabBelumLunas'
import TabPendapatan       from './_tabs/TabPendapatan'
import TabKasTunai         from './_tabs/TabKasTunai'
import TabKategori         from './_tabs/TabKategori'
import TabProduk           from './_tabs/TabProduk'
import TabKasir            from './_tabs/TabKasir'
import TabSupplier              from './_tabs/TabSupplier'
import TabPenerimaan            from './_tabs/TabPenerimaan'
import TabReturSupplier         from './_tabs/TabReturSupplier'
import TabInvoicePembelian      from './_tabs/TabInvoicePembelian'
import TabPembayaranInvoice     from './_tabs/TabPembayaranInvoice'

type Tab = 'antaran' | 'belum_lunas' | 'pendapatan' | 'kas_tunai' | 'produk' | 'kategori' | 'kasir'
         | 'supplier' | 'penerimaan' | 'retur_supplier' | 'invoice_pembelian' | 'pembayaran_invoice'

export default function AdminPage() {
  const sb = createClient()
  const [user, setUser]         = useState<User | null | undefined>(undefined)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [tab, setTab]           = useState<Tab>('antaran')
  const [antaranCount, setAntaranCount]     = useState(0)
  const [belumLunasCount, setBelumLunasCount] = useState(0)

  useEffect(() => {
    sb.auth.getUser().then(async ({ data }) => {
      setUser(data.user ?? null)
      if (data.user) {
        const { data: profile } = await sb.from('profiles').select('role').eq('id', data.user.id).single()
        setUserRole(profile?.role ?? null)
      }
    })
  }, [sb])

  useEffect(() => {
    if (user === null) window.location.href = '/'
  }, [user])

  if (user === undefined || user === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-base">Memuat...</p>
      </div>
    )
  }

  const isAdmin = userRole === 'admin' || userRole === 'owner'

  const TABS: { v: Tab; label: string; count?: number; badgeCls?: string }[] = [
    { v: 'antaran',     label: 'Pengiriman',  count: antaranCount,     badgeCls: 'bg-amber-500 text-black' },
    { v: 'belum_lunas', label: 'Belum Lunas', count: belumLunasCount,  badgeCls: 'bg-red-500 text-white' },
    { v: 'pendapatan',  label: 'Pendapatan' },
    { v: 'kas_tunai',   label: 'Kas Tunai' },
    ...(isAdmin ? [
      { v: 'produk'            as Tab, label: 'Produk' },
      { v: 'kategori'          as Tab, label: 'Kategori' },
      { v: 'supplier'             as Tab, label: 'Supplier' },
      { v: 'penerimaan'           as Tab, label: 'Penerimaan Barang' },
      { v: 'retur_supplier'       as Tab, label: 'Retur Supplier' },
      { v: 'invoice_pembelian'    as Tab, label: 'Invoice Pembelian' },
      { v: 'pembayaran_invoice'   as Tab, label: 'Pembayaran Invoice' },
    ] : []),
    { v: 'kasir', label: 'Kasir' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col select-none">
      <div className="flex items-center px-4 py-3 bg-white border-b border-gray-200 shrink-0 gap-4">
        <a href="/" className="text-gray-500 hover:text-gray-900 text-base font-medium transition-colors">← POS</a>
        <span className="text-gray-900 font-bold text-base flex-1">Dashboard Admin</span>
        <a href="/history" className="text-gray-500 hover:text-gray-900 text-base font-medium transition-colors">Riwayat</a>
      </div>

      <div className="flex gap-1.5 px-4 py-2.5 bg-gray-50 border-b border-gray-200 shrink-0 overflow-x-auto">
        {TABS.map(({ v, label, count, badgeCls }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-base font-semibold transition-colors shrink-0 ${
              tab === v ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {label}
            {!!count && count > 0 && (
              <span className={`text-sm font-bold px-1.5 py-0.5 rounded-full ${badgeCls}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-2">
          {tab === 'antaran'          && <TabAntaran          user={user} isAdmin={isAdmin} onCountChange={setAntaranCount} />}
          {tab === 'belum_lunas'      && <TabBelumLunas       user={user} isAdmin={isAdmin} onCountChange={setBelumLunasCount} />}
          {tab === 'pendapatan'       && <TabPendapatan       user={user} />}
          {tab === 'kas_tunai'        && <TabKasTunai         user={user} />}
          {tab === 'kategori'         && <TabKategori         user={user} />}
          {tab === 'produk'           && <TabProduk           user={user} />}
          {tab === 'kasir'            && <TabKasir            user={user} />}
          {tab === 'supplier'          && <TabSupplier          user={user} />}
          {tab === 'penerimaan'        && <TabPenerimaan        user={user} />}
          {tab === 'retur_supplier'    && <TabReturSupplier     user={user} />}
          {tab === 'invoice_pembelian' && <TabInvoicePembelian  user={user} />}
          {tab === 'pembayaran_invoice'&& <TabPembayaranInvoice user={user} />}
        </div>
      </div>
    </div>
  )
}
