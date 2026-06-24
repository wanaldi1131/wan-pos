-- ================================================================
--  Patch: RLS untuk tabel warehouses
--
--  Jalankan SEKALI di Supabase SQL Editor.
--  Prasyarat: schema_production.sql sudah dijalankan.
-- ================================================================

alter table warehouses enable row level security;

drop policy if exists "baca_warehouses"         on warehouses;
drop policy if exists "admin_kelola_warehouses"  on warehouses;

-- Semua user yang login bisa baca (dibutuhkan POS saat load price list)
create policy "baca_warehouses"
  on warehouses for select to authenticated using (true);

-- Hanya admin/owner yang bisa tambah & ubah
create policy "admin_kelola_warehouses"
  on warehouses for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));
