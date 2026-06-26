@AGENTS.md
# Konteks Project — POS Toko Adi Jaya

## Stack
- Next.js (App Router) + React + Tailwind + shadcn/ui
- Supabase (Postgres + Auth). Client di src/lib/supabase/client.ts

## Aturan desain yang TIDAK boleh dilanggar
- Stok TIDAK PERNAH diedit langsung. Selalu lewat insert ke `stock_movements`;
  tabel `stocks` cuma cache yang digerakkan trigger.
- Checkout & operasi multi-tabel (sales + sale_items + stock_movements) HARUS
  atomik — pakai Postgres function (RPC), bukan beberapa insert dari frontend.
- Keamanan ditegakkan via RLS di database, bukan cuma di UI.
- Multi-satuan: stok dalam base unit; satuan jual punya faktor konversi.
- Login kasir: email internal (kolom email_login) + PIN via signInWithPassword.
  Identitas sejati = auth.users.id, jangan diganti.
- outlet = titik jual; warehouse = tempat stok. Beda konsep.
-  utang & piutang TIDAK disimpan sebagai angka; selalu dihitung dari faktur/sales yang belum lunas.
- apa pun yang udah pernah terpakai di transaksi, jangan pernah di-hard-delete — nonaktifin aja. Itu berlaku ke produk, kasir, customer, supplier nanti. Hard delete cuma buat data yang belum pernah dipake (salah ketik produk yang belum pernah kejual, misal).

## Bahasa
- Komentar & teks UI pakai Bahasa Indonesia.


jangan langsung commit dan push ke github untuk setiap perubahan


## Deployment / Infra
- Host: Vercel (plan Pro — ini komersial, Hobby tidak boleh dipakai).
- Tiap app = project Vercel TERPISAH (POS, pengiriman hebel nanti). Bukan monolit.
  Routing antar app lewat subdomain, bukan reverse proxy.
- Supabase plan Pro (backup harian, project tidak di-pause). Region: Singapura.
- Domain: subdomain per app (pos.*, hebel.*). HTTPS otomatis dari Vercel.
- PWA wajib: installable di Android lewat browser, tanpa Play Store.
  Butuh manifest.json + service worker (pakai next-pwa). HP/tablet-first.
- Spend cap AKTIF di Vercel & Supabase sejak awal. Mulai dari tier dasar,
  naik tier hanya kalau dashboard nunjukin tekanan nyata (reaktif, bukan antisipatif).
