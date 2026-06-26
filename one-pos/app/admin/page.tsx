'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import TabKategori         from './_tabs/TabKategori'
import TabProduk           from './_tabs/TabProduk'
import TabKasir            from './_tabs/TabKasir'
import TabSupplier         from './_tabs/TabSupplier'
import TabPenerimaan       from './_tabs/TabPenerimaan'
import TabReturSupplier    from './_tabs/TabReturSupplier'
import TabInvoicePembelian from './_tabs/TabInvoicePembelian'
import TabPembayaranInvoice from './_tabs/TabPembayaranInvoice'
import TabPriceLists       from './_tabs/TabPriceLists'
import TabWarehouse        from './_tabs/TabWarehouse'
import TabStok             from './_tabs/TabStok'
import TabTransfer         from './_tabs/TabTransfer'
import TabSelisihStok     from './_tabs/TabSelisihStok'
import TabRole            from './_tabs/TabRole'

type Tab = 'stok' | 'transfer' | 'produk' | 'kategori' | 'kasir'
         | 'supplier' | 'penerimaan' | 'retur_supplier' | 'invoice_pembelian'
         | 'pembayaran_invoice' | 'price_lists' | 'warehouse' | 'selisih_stok'
         | 'role'

export default function AdminPage() {
  const sb = createClient()
  const [user, setUser]         = useState<User | null | undefined>(undefined)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [tab, setTab]           = useState<Tab>('stok')

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

  const TABS: { v: Tab; label: string }[] = [
    { v: 'stok',               label: 'Stok'              },
    { v: 'transfer',           label: 'Transfer Stok'     },
    { v: 'produk',             label: 'Produk'            },
    { v: 'kategori',           label: 'Kategori'          },
    { v: 'supplier',           label: 'Supplier'          },
    { v: 'penerimaan',         label: 'Penerimaan Barang' },
    { v: 'retur_supplier',     label: 'Retur Supplier'    },
    { v: 'invoice_pembelian',  label: 'Invoice Pembelian' },
    { v: 'pembayaran_invoice', label: 'Pembayaran Invoice'},
    { v: 'price_lists',        label: 'Price Lists'       },
    { v: 'warehouse',          label: 'Gudang'            },
    { v: 'selisih_stok',      label: 'Selisih Stok'     },
    { v: 'kasir',              label: 'Kasir'             },
    { v: 'role',               label: 'Role'              },
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col select-none">

      <div className="flex gap-1.5 px-4 py-2.5 bg-gray-50 border-b border-gray-200 shrink-0 overflow-x-auto">
        {TABS.map(({ v, label }) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-base font-semibold transition-colors shrink-0 ${
              tab === v ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-2">
          {tab === 'stok'              && <TabStok              user={user} />}
          {tab === 'transfer'          && <TabTransfer          user={user} />}
          {tab === 'kategori'          && <TabKategori          user={user} />}
          {tab === 'produk'            && <TabProduk            user={user} />}
          {tab === 'kasir'             && <TabKasir             user={user} />}
          {tab === 'supplier'          && <TabSupplier          user={user} />}
          {tab === 'penerimaan'        && <TabPenerimaan        user={user} />}
          {tab === 'retur_supplier'    && <TabReturSupplier     user={user} />}
          {tab === 'invoice_pembelian' && <TabInvoicePembelian  user={user} />}
          {tab === 'pembayaran_invoice'&& <TabPembayaranInvoice user={user} />}
          {tab === 'price_lists'       && <TabPriceLists        user={user} />}
          {tab === 'warehouse'         && <TabWarehouse         user={user} />}
          {tab === 'selisih_stok'     && <TabSelisihStok      user={user} />}
          {tab === 'role'             && <TabRole             user={user} />}
        </div>
      </div>
    </div>
  )
}
