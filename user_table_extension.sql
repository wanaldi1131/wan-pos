-- =============================================================
--  Migration: Login karyawan (PIN-pad) + RLS
--  Jalankan di Supabase SQL Editor. Aman di-run ulang (idempotent).
--
--  Keputusan desain:
--   - Kita PERLUAS tabel `profiles` yang sudah ada, BUKAN bikin tabel baru.
--     profiles sudah = tabel identitas (link auth.users, nama, role, active).
--   - email_login = KOLOM DATA, bukan ditebak dari nama. Pas migrasi ke
--     email domain nanti, cukup update kolom ini -> kode tak perlu diubah.
--   - Identitas sejati = auth.users.id (UUID). Tak pernah berubah walau
--     email diganti. Itu yang bikin audit trail tetap nyambung selamanya.
-- =============================================================

-- ---------- 1. Helper peran (pastikan ada) ----------
-- security definer = fungsi ini bypass RLS saat baca profiles,
-- jadi tidak terjadi rekursi tak hingga saat dipakai di policy profiles.
create or replace function get_current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- ---------- 2. Perluas profiles ----------
alter table profiles
  add column if not exists email_login text unique,
  add column if not exists staff_code  text unique;

comment on column profiles.email_login is
  'Email internal utk login PIN-pad (cth staff01@adijaya.local). Hanya LABEL; identitas sejati = auth.users.id. Dimigrasi nanti tanpa ganti id.';
comment on column profiles.staff_code is
  'Kode staf stabil (cth staff01). Tak berubah walau nama panggilan ganti.';

-- ---------- 3. RLS untuk profiles ----------
alter table profiles enable row level security;

-- (a) LAYAR LOGIN: user masih ANON (belum login) butuh baca daftar kasir aktif
--     -> nama buat ditampilkan + email_login buat dikirim ke signInWithPassword.
--     PENTING: PIN TIDAK ada di tabel ini. PIN = password, tersimpan ter-hash
--     di auth.users. Jadi walau baris ini kebaca anon, PIN tetap aman.
drop policy if exists "login_baca_kasir_aktif" on profiles;
create policy "login_baca_kasir_aktif"
  on profiles for select
  to anon, authenticated
  using (role = 'kasir' and active = true);

-- (b) Tiap user boleh baca profil dirinya sendiri.
drop policy if exists "baca_profil_sendiri" on profiles;
create policy "baca_profil_sendiri"
  on profiles for select
  to authenticated
  using (id = auth.uid());

-- (c) Owner/admin boleh baca SEMUA profil + kelola (tambah/ubah karyawan).
drop policy if exists "owneradmin_baca_semua_profil" on profiles;
create policy "owneradmin_baca_semua_profil"
  on profiles for select
  to authenticated
  using (get_current_role() in ('owner','admin'));

drop policy if exists "owneradmin_kelola_profil" on profiles;
create policy "owneradmin_kelola_profil"
  on profiles for all
  to authenticated
  using (get_current_role() in ('owner','admin'))
  with check (get_current_role() in ('owner','admin'));

-- ---------- 4. Master data: products (pola yang sama dipakai tabel master lain) ----------
-- Aturan master: yang sudah LOGIN boleh baca; cuma owner/admin boleh ubah.
-- Catatan: setelah ini, halaman tes lo (yang akses sbg ANON) akan KOSONG
-- untuk products -> itu BENAR & disengaja. Produk baru muncul setelah lo LOGIN.
alter table products enable row level security;

drop policy if exists "master_baca_login" on products;
create policy "master_baca_login"
  on products for select
  to authenticated
  using (true);

drop policy if exists "master_kelola_owneradmin" on products;
create policy "master_kelola_owneradmin"
  on products for all
  to authenticated
  using (get_current_role() in ('owner','admin'))
  with check (get_current_role() in ('owner','admin'));

-- Tabel master lain (product_units, warehouses, customers, suppliers, drivers)
-- pakai DUA policy yang sama persis — tinggal ganti nama tabelnya.
-- Kita pasang nanti pas wiring app, atau lo bisa ulang pola di atas sekarang.

-- ---------- 5. Grant (aman di-run ulang) ----------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;