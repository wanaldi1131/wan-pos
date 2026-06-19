-- ================================================================
--  Patch: Batasan kategori customer saat insert
--
--  Jalankan SEKALI di Supabase SQL Editor.
--
--  Yang dilakukan:
--   - Update policy INSERT customers:
--       kasir  → hanya boleh tambah customer kategori 'retail'
--       admin & owner → boleh tambah semua kategori (retail & toko)
-- ================================================================

drop policy if exists "staf_tambah_pelanggan" on customers;

create policy "staf_tambah_pelanggan"
  on customers
  for insert
  to authenticated
  with check (
    (get_current_role() = 'kasir'  and category = 'retail')
    or
    get_current_role() in ('admin', 'owner')
  );
