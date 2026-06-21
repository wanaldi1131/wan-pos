-- ================================================================
--  Patch: Tabel suppliers + supplier_salesmen
--
--  Jalankan SEKALI di Supabase SQL Editor.
--
--  Yang dilakukan:
--   1. Buat tabel suppliers (id, name, address, npwp, phone)
--   2. Buat tabel supplier_salesmen (id, supplier_id, name, phone, active)
--   3. Aktifkan RLS: hanya admin/owner yang bisa akses
-- ================================================================

create table if not exists suppliers (
  id         bigserial    primary key,
  name       text         not null,
  address    text,
  npwp       text,
  phone      text,
  created_at timestamptz  not null default now()
);

-- Salesman bisa lebih dari 1 per supplier, soft-delete via active
create table if not exists supplier_salesmen (
  id          bigserial    primary key,
  supplier_id bigint       not null references suppliers(id) on delete cascade,
  name        text         not null,
  phone       text,
  active      boolean      not null default true,
  created_at  timestamptz  not null default now()
);

-- RLS
alter table suppliers         enable row level security;
alter table supplier_salesmen enable row level security;

drop policy if exists "admin_baca_supplier"   on suppliers;
drop policy if exists "admin_kelola_supplier" on suppliers;
drop policy if exists "admin_baca_salesman"   on supplier_salesmen;
drop policy if exists "admin_kelola_salesman" on supplier_salesmen;

-- Hanya admin/owner yang bisa lihat
create policy "admin_baca_supplier"
  on suppliers for select to authenticated
  using (get_current_role() in ('admin', 'owner'));

-- Hanya admin/owner yang bisa tambah/edit (bukan hard-delete via API)
create policy "admin_kelola_supplier"
  on suppliers for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

create policy "admin_baca_salesman"
  on supplier_salesmen for select to authenticated
  using (get_current_role() in ('admin', 'owner'));

create policy "admin_kelola_salesman"
  on supplier_salesmen for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));
