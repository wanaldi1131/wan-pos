# Ringkasan Teknis — Adi Jaya POS

Stack: **Next.js (App Router) + Supabase (Postgres + Auth) + Tailwind CSS**

---

## 1. Struktur Halaman / Route

| Route | File | Fungsi |
|---|---|---|
| `/` | `app/page.tsx` → `_pos/PosPage.tsx` | Landing: deteksi auth → redirect ke POS atau Login |
| `/login` | `app/login/page.tsx` | Login kasir (PIN) + login admin (email + password) |
| `/` (PosPage) | `app/_pos/PosPage.tsx` | POS utama: cari produk, keranjang, checkout, pilih pelanggan & fulfillment |
| `/history` | `app/history/page.tsx` | Riwayat transaksi, detail per item, retur dengan qty picker |
| `/kas` | `app/kas/page.tsx` | Sesi kas harian: buka/tutup sesi, cash out, ringkasan tunai vs transfer |
| `/admin` | `app/admin/page.tsx` | Dashboard admin (5 tab): Pengiriman, Belum Lunas, Pendapatan, Kas Tunai, Kasir |

---

## 2. Cara Data Ditulis

### Checkout
Lewat **Postgres RPC `checkout_sale`** — satu transaksi atomik, bukan `.insert()` terpisah.

```
checkout_sale(p_cashier_id, p_customer_id, p_warehouse_id, p_fulfillment, p_pay_method, p_items)
→ returns { sale_id, code, total }
```

Di dalam satu transaksi: `sales` + `sale_items` + `stock_movements` (kalau fulfillment='ambil').

### Retur
Lewat **Postgres RPC `confirm_return`** — satu transaksi atomik.

```
confirm_return(p_sale_id, p_cashier_id, p_refund_method, p_note, p_items)
→ returns { return_id, total }
```

Di dalam satu transaksi: `sale_returns` + `return_items` + `stock_movements` (positif, stok kembali).

### Transfer Stok
Tabel `transfers` dan `transfer_lines` **sudah ada di schema**, tapi **tidak ada RPC dan tidak ada UI** untuk membuatnya. Schema orphan — belum selesai.

### Tandai Lunas (COD/Kredit)
Lewat `.update()` langsung dari admin UI — bukan RPC. Set `pay_status='lunas'` dan `paid_at=now()`.

### Surat Jalan → Terkirim
Lewat **Postgres RPC `mark_sj_terkirim`** — atomik, mencegah duplikasi.

---

## 3. Bagaimana Stok Bergerak

**Stok tidak pernah di-edit langsung.** Semua lewat insert ke `stock_movements`, lalu trigger otomatis update `stocks` (cache).

```
stock_movements (append-only ledger)
    ↓ trigger: apply_stock_movement (AFTER INSERT)
stocks (cache = sum of movements per product+warehouse)
```

| Kejadian | Tipe Movement | base_qty |
|---|---|---|
| Penjualan ambil | `sale` | negatif |
| Penjualan antar — terkirim | `sale` (via mark_sj_terkirim) | negatif |
| Retur | `sale_return` | positif |
| Pembelian (purchase) | `purchase` | positif |
| Transfer keluar/masuk | `transfer_out` / `transfer_in` | ± |
| Koreksi manual | `adjustment` | ± |

**Satuan di stok selalu base unit.** Misalnya stok "Semen" disimpan dalam satuan "sak", bukan "dus" atau "palet".

---

## 4. Harga: Dari Mana Asalnya?

**Harga TIDAK dikirim dari frontend.** Dibaca server-side di dalam `checkout_sale`.

Urutan resolusi harga di dalam RPC:
1. Baca `product_units.price` dan `product_units.price_toko` berdasarkan `unit_id`
2. Cek `customers.category` — kalau `'toko'` dan `price_toko` tidak null → pakai `price_toko`
3. Selain itu → pakai `price` (harga retail)

Ini mencegah manipulasi harga dari sisi client.

**Untuk retur:** harga diambil dari `sale_items.unit_price` (snapshot saat transaksi), bukan dari `product_units` sekarang.

---

## 5. Penjaga Retur

### Sisi Client (UI)
- Input qty diklem: `Math.min(input, max_qty)` — tidak bisa ketik angka lebih dari sisa
- Cek overLimit sebelum panggil RPC: kalau ada item melewati batas, tampilkan error dan batalkan

### Sisi Server (`confirm_return` RPC)
1. Pastikan `jsonb_array_length(p_items) > 0`
2. Per item: verifikasi `sale_item_id` benar-benar milik `sale_id` yang dimaksud
3. Per item: hitung total sudah diretur sebelumnya dari `return_items`, lalu pastikan `qty_baru ≤ (orig_qty - sudah_diretur)`
4. Kalau melanggar → `raise exception` (transaksi di-rollback seluruhnya)

### Guard Tambahan (`mark_sj_terkirim`)
- Cek `surat_jalan.status` — kalau sudah `'terkirim'`, raise exception (mencegah potong stok dua kali)

---

## 6. RLS & Auth

### Tabel yang RLS-nya Aktif
`profiles`, `products`, `product_units`, `customers`, `sales`, `sale_items`, `stocks`, `stock_movements`, `surat_jalan`, `surat_jalan_lines`, `drivers`, `sale_returns`, `return_items`, `cash_sessions`, `cash_out`

### Role yang Ada
`owner` · `admin` · `kasir` (enum di Postgres)

### Fungsi Penentu Role
`get_current_role()` — membaca `profiles.role` berdasarkan `auth.uid()`. Dipakai di semua policy RLS.

### Ringkasan Policy
| Aktor | Bisa apa |
|---|---|
| Kasir | CRUD sales/sale_items/retur/kas milik sendiri saja |
| Admin/Owner | Lihat & kelola semua + surat jalan, driver, profil kasir |
| Kasir | **Tidak bisa** baca `stock_movements` (hanya admin/owner) |
| Anon | Bisa baca profil kasir aktif (untuk tampilan pilih kasir di login) |

### Pembuatan Akun Kasir
Lewat RPC `create_kasir(p_name, p_staff_code, p_pin)`:
1. Cek apakah email `{staff_code}@adijaya.com` sudah ada di `auth.users`
2. Kalau ada dan aktif → reuse ID; kalau sudah dihapus → buat UUID baru
3. Insert ke `auth.users` dengan PIN di-hash bcrypt
4. Upsert ke `profiles` dengan role='kasir', active=true

---

## 7. Daftar Postgres RPC / Function

| Function | Singkatan Fungsi |
|---|---|
| `get_current_role()` | Ambil role user yang sedang login |
| `get_unit_price(p_unit_id, p_category)` | Ambil harga satuan sesuai kategori customer |
| `get_default_products(p_limit)` | Produk featured + terlaris dengan agregasi sold_qty |
| `create_kasir(p_name, p_staff_code, p_pin)` | Buat akun kasir baru (auth + profile) secara atomik |
| `checkout_sale(...)` | Checkout atomik: sales + sale_items + stock_movements + paid_at |
| `confirm_return(...)` | Retur atomik + validasi server-side qty + stock_movements |
| `mark_sj_terkirim(p_sj_id)` | Tandai surat jalan terkirim + potong stok, guard duplikasi |
| `apply_stock_movement` | Trigger (bukan RPC): setiap insert ke stock_movements → update stocks |

---

## 8. Bagian yang Paling Berisiko / Belum Lengkap

### A. Tidak Ada Cek Ketersediaan Stok saat Checkout
`checkout_sale` langsung insert stock_movement negatif tanpa cek dulu apakah `stocks.base_qty` cukup. Stok bisa jadi negatif kalau ada data yang tidak sinkron.

### B. Penjualan `antar` — Stok "Melayang"
Kalau fulfillment='antar':
- Stok **tidak dipotong saat checkout**
- Dipotong baru saat surat jalan ditandai terkirim
- Selama masa pengiriman, stok di sistem masih terlihat tersedia (padahal sudah dipesan)
- Tidak ada mekanisme "stok reserved"

### C. Transfer Stok Belum Selesai
Tabel `transfers` dan `transfer_lines` sudah ada di schema production, tapi tidak ada RPC, tidak ada UI, dan tidak ada policy RLS yang lengkap untuk fitur ini.

### D. Tandai Lunas via `.update()` Langsung (Bukan RPC)
Tidak atomik — kalau koneksi terputus setelah update tapi sebelum UI selesai, `paid_at` mungkin tidak ter-set dengan benar. Tidak ada validasi server-side untuk transisi status.

### E. Refund Method `nota` Tidak Punya Efek Kas
`refund_method='nota'` tersimpan di DB tapi tidak mengurangi kas tunai/transfer di laporan manapun — konsisten, tapi perlu dipastikan ini memang desain yang disengaja.

### F. Warehouse Hardcoded = 1
Semua operasi (checkout, surat jalan, retur) pakai `warehouse_id=1`. Schema mendukung multi-gudang tapi logikanya belum diimplementasi.

---

## 9. Fitur yang Sudah Ada tapi Mungkin Tidak Terlihat

| Fitur | Di mana |
|---|---|
| **Retur bertahap** | Bisa retur item yang sama berkali-kali di transaksi terpisah, sistem akumulasi otomatis |
| **Harga dua tier** | Per `product_unit` ada `price` (retail) dan `price_toko` (agen), dipilih otomatis saat checkout |
| **Infinite scroll riwayat** | History load 30 per halaman, IntersectionObserver trigger load-more |
| **Surat jalan cetak** | Generate HTML print-friendly dari admin tab Pengiriman |
| **Kas harian buka/tutup sesi** | `/kas` punya `cash_sessions` dengan saldo awal, total in/out, selisih |
| **Cash out non-penjualan** | `/kas` catat pengeluaran kas (bukan retur) via `cash_out` |
| **Pendapatan net per metode** | Tab Pendapatan admin: breakdown tunai/transfer/COD/kredit + retur per hari |
| **Kas tunai dengan retur keluar** | Tab Kas Tunai admin: inflow dan retur outflow dipisah per metode, total neto |
| **Toggle aktif/nonaktif kasir** | Admin bisa suspend kasir tanpa hapus akun |
| **Pelanggan kategori toko** | Customer bisa punya `category='toko'` untuk dapat harga toko otomatis |
| **Fulfillment picker** | Kasir pilih ambil vs antar saat checkout, menentukan kapan stok dipotong |

---

*Dokumen ini dibuat berdasarkan pembacaan codebase pada commit `c4bda78` (18 Juni 2026).*
