-- ================================================================
--  Patch: Tabel categories
--
--  Jalankan SEKALI di Supabase SQL Editor.
--  Tidak ada prasyarat — bisa dijalankan kapan saja.
--
--  Yang dilakukan:
--   1. Buat tabel categories (id, name unique, created_at)
--   2. Migrasi data: import nama kategori unik dari products.category
--   3. Aktifkan RLS: semua authenticated bisa baca, hanya admin/owner bisa ubah
-- ================================================================

create table if not exists categories (
  id         bigserial    primary key,
  name       text         not null unique,
  created_at timestamptz  not null default now()
);

-- Migrasi kategori yang sudah ada di products
insert into categories (name)
select distinct category
from products
where category is not null and trim(category) <> ''
on conflict (name) do nothing;

-- RLS
alter table categories enable row level security;

drop policy if exists "read categories" on categories;
drop policy if exists "admin write categories" on categories;

create policy "read categories"
  on categories for select
  to authenticated
  using (true);

create policy "admin write categories"
  on categories for all
  to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));
