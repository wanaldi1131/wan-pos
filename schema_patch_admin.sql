-- =============================================================
--  Patch: RLS + grants untuk fitur admin (surat jalan, drivers)
--  Jalankan setelah schema_production.sql
--  Aman di-run ulang (drop policy if exists sebelum create).
-- =============================================================


-- ── Enable RLS ────────────────────────────────────────────────
alter table surat_jalan       enable row level security;
alter table surat_jalan_lines enable row level security;
alter table drivers           enable row level security;


-- ── Drivers ───────────────────────────────────────────────────
drop policy if exists "baca_driver" on drivers;
drop policy if exists "kelola_driver" on drivers;

-- Semua staf bisa baca driver (untuk dropdown di form SJ)
create policy "baca_driver" on drivers
  for select using (auth.uid() is not null);

-- Hanya admin/owner yang bisa tambah/edit driver
create policy "kelola_driver" on drivers
  for all using (get_current_role() in ('admin', 'owner'));


-- ── Surat Jalan ───────────────────────────────────────────────
drop policy if exists "baca_surat_jalan"   on surat_jalan;
drop policy if exists "catat_surat_jalan"  on surat_jalan;
drop policy if exists "update_surat_jalan" on surat_jalan;

-- Semua staf bisa lihat (untuk print di kasir juga)
create policy "baca_surat_jalan" on surat_jalan
  for select using (get_current_role() in ('kasir', 'admin', 'owner'));

-- Hanya admin/owner yang bisa buat SJ
create policy "catat_surat_jalan" on surat_jalan
  for insert with check (get_current_role() in ('admin', 'owner'));

-- Update status (dimuat → terkirim) hanya admin/owner
create policy "update_surat_jalan" on surat_jalan
  for update using (get_current_role() in ('admin', 'owner'));


-- ── Surat Jalan Lines ─────────────────────────────────────────
drop policy if exists "baca_sj_lines"  on surat_jalan_lines;
drop policy if exists "catat_sj_lines" on surat_jalan_lines;

create policy "baca_sj_lines" on surat_jalan_lines
  for select using (get_current_role() in ('kasir', 'admin', 'owner'));

create policy "catat_sj_lines" on surat_jalan_lines
  for insert with check (get_current_role() in ('admin', 'owner'));


-- ── Grants ────────────────────────────────────────────────────
grant select          on drivers             to authenticated;
grant select, insert, update on surat_jalan  to authenticated;
grant select, insert  on surat_jalan_lines   to authenticated;
grant usage, select   on sequence sj_no_seq  to authenticated;
grant usage, select   on sequence surat_jalan_id_seq       to authenticated;
grant usage, select   on sequence surat_jalan_lines_id_seq to authenticated;


-- ── Verifikasi ────────────────────────────────────────────────
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('surat_jalan', 'surat_jalan_lines', 'drivers');
