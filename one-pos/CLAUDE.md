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

## Bahasa
- Komentar & teks UI pakai Bahasa Indonesia.