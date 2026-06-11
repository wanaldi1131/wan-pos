-- =============================================================
--  Wan Pos — Skema Database v1 (Postgres / Supabase)
--  Fase 1 fondasi. Jalankan di Supabase SQL Editor.
--
--  Prinsip desain yang dikunci sepanjang diskusi:
--   1. MULTI-SATUAN: stok disimpan dalam BASE UNIT. Satuan jual
--      (sak, dus, lusin) punya faktor konversi ke base.
--   2. STOK = HASIL LEDGER, bukan angka yang diedit manual.
--      stock_movements = sumber kebenaran. Tabel stocks cuma cache
--      yang HANYA berubah lewat trigger dari movements.
--   3. SPLIT DELIVERY: 1 sale bisa pecah ke banyak surat jalan.
--      Stok keluar gudang dicatat per surat jalan (untuk antar).
--   4. CAPTURE CONTROL: nomor nota berurutan -> lubang ketahuan.
--   5. RBAC ditegakkan di DATABASE (RLS), bukan cuma di UI.
-- =============================================================

-- ---------- ENUM ----------
create type user_role        as enum ('owner', 'admin', 'kasir');
create type fulfillment_type as enum ('ambil', 'antar');
create type payment_method   as enum ('tunai', 'transfer', 'cod', 'kredit');
create type payment_status   as enum ('belum', 'lunas');
create type movement_type    as enum ('sale', 'sale_return', 'purchase', 'transfer_out', 'transfer_in', 'adjustment');
create type delivery_status  as enum ('dimuat', 'terkirim');
create type transfer_status  as enum ('in_transit', 'received');

-- ---------- PROFIL & PERAN ----------
-- auth.users dikelola Supabase. profiles = data + peran tiap user.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  role        user_role not null default 'kasir',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Helper: ambil peran user yang sedang login (dipakai di policy RLS).
create or replace function get_current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- ---------- MASTER ----------
create table warehouses (
  id    bigserial primary key,
  name  text not null,
  is_hub boolean not null default false
);

create table products (
  id         bigserial primary key,
  sku        text unique,
  name       text not null,
  category   text,
  base_unit  text not null,          -- cth: 'kg', 'batang', 'kaleng'
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Satuan jual + konversi. factor_to_base = berapa base unit per 1 satuan ini.
-- cth: Semen base 'kg'; satuan 'sak' factor 50; satuan 'kg' factor 1.
create table product_units (
  id            bigserial primary key,
  product_id    bigint not null references products(id) on delete cascade,
  unit_name     text not null,
  factor_to_base numeric not null check (factor_to_base > 0),
  price         numeric not null check (price >= 0),
  is_default    boolean not null default false,
  unique (product_id, unit_name)
);

create table customers (
  id        bigserial primary key,
  name      text not null,
  phone     text,
  address   text,
  is_kontraktor boolean not null default false
);

create table suppliers (
  id     bigserial primary key,
  name   text not null,
  phone  text
);

create table drivers (
  id     bigserial primary key,
  name   text not null,
  active boolean not null default true
);

-- ---------- INVENTORY ----------
-- LEDGER: sumber kebenaran. base_qty bertanda (+masuk / -keluar).
create table stock_movements (
  id          bigserial primary key,
  product_id  bigint not null references products(id),
  warehouse_id bigint not null references warehouses(id),
  base_qty    numeric not null,            -- signed
  type        movement_type not null,
  ref_table   text,                        -- 'sales' | 'surat_jalan' | 'transfers' ...
  ref_id      bigint,
  note        text,
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- CACHE stok berjalan. JANGAN diupdate manual — hanya lewat trigger di bawah.
create table stocks (
  product_id  bigint not null references products(id),
  warehouse_id bigint not null references warehouses(id),
  base_qty    numeric not null default 0,
  primary key (product_id, warehouse_id)
);

-- Trigger: tiap movements masuk -> stocks ikut bergerak. Itu yang bikin
-- stok TIDAK BISA diubah tanpa jejak.
create or replace function apply_stock_movement() returns trigger
language plpgsql as $$
begin
  insert into stocks (product_id, warehouse_id, base_qty)
  values (new.product_id, new.warehouse_id, new.base_qty)
  on conflict (product_id, warehouse_id)
  do update set base_qty = stocks.base_qty + new.base_qty;
  return new;
end; $$;

create trigger trg_apply_stock_movement
  after insert on stock_movements
  for each row execute function apply_stock_movement();

-- ---------- PENJUALAN ----------
-- Nomor nota berurutan = kontrol capture. Lubang di urutan = sinyal.
create sequence sale_no_seq;

create table sales (
  id             bigserial primary key,
  no_nota        bigint not null default nextval('sale_no_seq'),
  code           text generated always as ('INV-' || lpad(no_nota::text, 5, '0')) stored,
  cashier_id     uuid references profiles(id),
  customer_id    bigint references customers(id),
  warehouse_id   bigint not null references warehouses(id),
  fulfillment    fulfillment_type not null default 'ambil',
  pay_method     payment_method not null,
  pay_status     payment_status not null default 'belum',
  cod_settled    boolean,                 -- null kalau bukan COD
  total          numeric not null default 0,
  voided         boolean not null default false,
  created_at     timestamptz not null default now()
);

create table sale_items (
  id          bigserial primary key,
  sale_id     bigint not null references sales(id) on delete cascade,
  product_id  bigint not null references products(id),
  unit_id     bigint not null references product_units(id),
  qty         numeric not null check (qty > 0),    -- dalam satuan jual
  base_qty    numeric not null,                    -- qty * factor_to_base
  unit_price  numeric not null,
  subtotal    numeric not null
);

-- ---------- PENGIRIMAN (SPLIT) ----------
create sequence sj_no_seq;

create table surat_jalan (
  id         bigserial primary key,
  no_sj      bigint not null default nextval('sj_no_seq'),
  code       text generated always as ('SJ-' || lpad(no_sj::text, 5, '0')) stored,
  sale_id    bigint not null references sales(id),
  driver_id  bigint references drivers(id),
  plat       text,
  status     delivery_status not null default 'dimuat',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Tiap baris = sebagian dari 1 item sale yang naik mobil ini.
-- "sisa belum dimuat" = sale_items.base_qty - sum(surat_jalan_lines.base_qty).
create table surat_jalan_lines (
  id            bigserial primary key,
  surat_jalan_id bigint not null references surat_jalan(id) on delete cascade,
  sale_item_id  bigint not null references sale_items(id),
  base_qty      numeric not null check (base_qty > 0)
);

-- ---------- TRANSFER ANTAR CABANG ----------
-- Status in_transit (barang keluar tapi belum diterima) -> received.
create table transfers (
  id          bigserial primary key,
  from_wh     bigint not null references warehouses(id),
  to_wh       bigint not null references warehouses(id),
  status      transfer_status not null default 'in_transit',
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  check (from_wh <> to_wh)
);

create table transfer_items (
  id          bigserial primary key,
  transfer_id bigint not null references transfers(id) on delete cascade,
  product_id  bigint not null references products(id),
  base_qty    numeric not null check (base_qty > 0)
);

-- =============================================================
--  RLS — contoh kebijakan (BUKAN lengkap; ini pola dasar Fase 1)
-- =============================================================
alter table profiles        enable row level security;
alter table sales           enable row level security;
alter table sale_items      enable row level security;
alter table stocks          enable row level security;
alter table stock_movements enable row level security;

-- Semua user terautentikasi boleh baca profil sendiri.
create policy "baca profil sendiri" on profiles
  for select using (id = auth.uid());

-- Kasir & admin & owner boleh CATAT penjualan.
create policy "catat penjualan" on sales
  for insert with check (get_current_role() in ('kasir','admin','owner'));

-- Kasir cuma boleh lihat transaksi yang DIA buat hari ini.
-- Admin & owner lihat semua. (laporan = ranah owner)
create policy "lihat penjualan sesuai peran" on sales
  for select using (
    get_current_role() in ('admin','owner')
    or (cashier_id = auth.uid() and created_at::date = now()::date)
  );

-- Hanya owner/admin yang boleh VOID (tandai batal) transaksi.
create policy "void hanya admin/owner" on sales
  for update using (get_current_role() in ('admin','owner'));

-- Stok: semua staf boleh BACA, tapi pergerakan stok hanya boleh
-- lahir dari proses (insert movements), bukan diedit manual oleh siapa pun.
create policy "baca stok" on stocks
  for select using (get_current_role() in ('kasir','admin','owner'));

create policy "catat pergerakan stok" on stock_movements
  for insert with check (get_current_role() in ('kasir','admin','owner'));

create policy "baca pergerakan stok" on stock_movements
  for select using (get_current_role() in ('admin','owner'));

-- Catatan: stocks & stock_movements TIDAK punya policy UPDATE/DELETE
-- untuk siapa pun -> default-deny. Stok tak bisa "dirapikan" diam-diam.
-- Penyesuaian stok (opname) dilakukan dengan INSERT movement type 'adjustment',
-- jadi tetap meninggalkan jejak.

-- =============================================================
--  SEED minimal (buat nyoba)
-- =============================================================
insert into warehouses (name, is_hub) values ('Hub Utama', true), ('Cabang Tomang', false);

insert into products (sku, name, category, base_unit) values
  ('SMN-TR50', 'Semen Tiga Roda 50kg', 'Semen & Cor', 'kg'),
  ('BSI-10',   'Besi Beton 10mm',      'Besi & Logam', 'batang'),
  ('CAT-AV1',  'Cat Avian Putih 1kg',  'Cat', 'kaleng');

insert into product_units (product_id, unit_name, factor_to_base, price, is_default) values
  (1, 'sak', 50, 62000, true), (1, 'kg', 1, 1400, false),
  (2, 'batang', 1, 78000, true),
  (3, 'kaleng', 1, 95000, true), (3, 'dus (isi 6)', 6, 540000, false);

-- Stok awal lewat movement (bukan insert langsung ke stocks!)
insert into stock_movements (product_id, warehouse_id, base_qty, type, note) values
  (1, 1, 12000, 'adjustment', 'stok awal'),
  (2, 1, 520,   'adjustment', 'stok awal'),
  (3, 1, 60,    'adjustment', 'stok awal');
