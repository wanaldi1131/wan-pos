-- =============================================================
--  WAN POS — Schema Produksi (All-in-One)
--  Jalankan SEKALI di Supabase SQL Editor pada database baru.
--
--  ⚠️  SEBELUM MENJALANKAN:
--    • Cari section "SEED: KASIR" dan ganti nama + PIN
--      sesuai karyawan aktual.
--    • Sesuaikan seed produk & stok awal di section 11-12.
--
--  Prinsip desain:
--    1. MULTI-SATUAN  — stok disimpan dalam BASE UNIT (kg, batang…).
--       Satuan jual (sak, dus) punya faktor konversi ke base.
--    2. STOK = LEDGER — stock_movements adalah sumber kebenaran.
--       Tabel stocks hanya cache yang bergerak lewat trigger.
--    3. SPLIT DELIVERY — 1 sale bisa pecah ke banyak surat jalan.
--    4. CAPTURE CONTROL — nomor nota berurutan; lubang = sinyal.
--    5. RBAC lewat RLS Supabase, bukan cuma UI.
-- =============================================================


-- ════════════════════════════════════════════════════════════════
--  1. EXTENSIONS
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;  -- bcrypt untuk PIN kasir
create extension if not exists pg_trgm;   -- trigram index untuk pencarian cepat


-- ════════════════════════════════════════════════════════════════
--  2. ENUMS
-- ════════════════════════════════════════════════════════════════

create type user_role         as enum ('owner', 'admin', 'kasir');
create type customer_category as enum ('retail', 'toko');
create type fulfillment_type  as enum ('ambil', 'antar');
create type payment_method    as enum ('tunai', 'transfer', 'cod', 'kredit');
create type payment_status    as enum ('belum', 'lunas');
create type movement_type     as enum ('sale', 'sale_return', 'purchase', 'transfer_out', 'transfer_in', 'adjustment');
create type delivery_status   as enum ('dimuat', 'terkirim');
create type transfer_status   as enum ('in_transit', 'received');


-- ════════════════════════════════════════════════════════════════
--  3. TABEL
-- ════════════════════════════════════════════════════════════════

-- ── Profil & Peran ────────────────────────────────────────────
-- auth.users dikelola Supabase. profiles = data + role tiap user.
create table profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  full_name    text        not null,
  role         user_role   not null default 'kasir',
  active       boolean     not null default true,
  email_login  text        unique,   -- cth: staff01@adijaya.local
  staff_code   text        unique,   -- kode stabil (tidak berubah walau nama ganti)
  created_at   timestamptz not null default now()
);

-- ── Master Data ───────────────────────────────────────────────
create table warehouses (
  id      bigserial primary key,
  name    text      not null,
  is_hub  boolean   not null default false
);

create table products (
  id             bigserial   primary key,
  sku            text        unique,
  name           text        not null,
  category       text,
  base_unit      text        not null,              -- cth: 'kg', 'batang', 'kaleng'
  active         boolean     not null default true,
  is_featured    boolean     not null default false, -- tampil di tab Favorit
  display_order  int,                               -- urutan di grid Favorit (null = paling akhir)
  created_at     timestamptz not null default now()
);

-- Satuan jual + konversi. factor_to_base = berapa base unit per 1 satuan ini.
-- Contoh: Semen base='kg'; satuan 'sak' factor=50; satuan 'kg' factor=1.
-- qty di sale_items boleh desimal (0.5, 0.75, dll).
create table product_units (
  id              bigserial primary key,
  product_id      bigint    not null references products(id) on delete cascade,
  unit_name       text      not null,
  factor_to_base  numeric   not null check (factor_to_base > 0),
  price           numeric   not null check (price >= 0),   -- harga retail
  price_toko      numeric   check (price_toko > 0),        -- null = ikut harga retail
  is_default      boolean   not null default false,
  unique (product_id, unit_name)
);

create table customers (
  id        bigserial         primary key,
  name      text              not null,
  phone     text,
  address   text,
  category  customer_category not null default 'retail'
);

create table suppliers (
  id    bigserial primary key,
  name  text      not null,
  phone text
);

create table drivers (
  id     bigserial primary key,
  name   text      not null,
  active boolean   not null default true
);

-- ── Inventory ─────────────────────────────────────────────────
-- LEDGER: sumber kebenaran. base_qty bertanda (+ masuk / - keluar).
create table stock_movements (
  id            bigserial     primary key,
  product_id    bigint        not null references products(id),
  warehouse_id  bigint        not null references warehouses(id),
  base_qty      numeric       not null,   -- signed
  type          movement_type not null,
  ref_table     text,                     -- 'sales' | 'surat_jalan' | 'transfers' …
  ref_id        bigint,
  note          text,
  created_by    uuid          references profiles(id),
  created_at    timestamptz   not null default now()
);

-- CACHE stok berjalan. JANGAN diupdate manual — hanya lewat trigger.
create table stocks (
  product_id    bigint  not null references products(id),
  warehouse_id  bigint  not null references warehouses(id),
  base_qty      numeric not null default 0,
  primary key (product_id, warehouse_id)
);

-- ── Penjualan ─────────────────────────────────────────────────
-- Nomor nota berurutan = kontrol capture. Lubang di urutan = sinyal.
create sequence sale_no_seq;

create table sales (
  id            bigserial        primary key,
  no_nota       bigint           not null default nextval('sale_no_seq'),
  code          text             generated always as ('INV-' || lpad(no_nota::text, 5, '0')) stored,
  cashier_id    uuid             references profiles(id),
  customer_id   bigint           references customers(id),
  warehouse_id  bigint           not null references warehouses(id),
  fulfillment   fulfillment_type not null default 'ambil',
  pay_method    payment_method   not null,
  pay_status    payment_status   not null default 'belum',
  cod_settled   boolean,                  -- null kalau bukan COD
  total         numeric          not null default 0,
  voided        boolean          not null default false,
  created_at    timestamptz      not null default now()
);

create table sale_items (
  id          bigserial primary key,
  sale_id     bigint    not null references sales(id) on delete cascade,
  product_id  bigint    not null references products(id),
  unit_id     bigint    not null references product_units(id),
  qty         numeric   not null check (qty > 0),   -- satuan jual, boleh desimal (0.5, 0.75…)
  base_qty    numeric   not null,                   -- qty * factor_to_base
  unit_price  numeric   not null,
  subtotal    numeric   not null
);

-- ── Pengiriman (Split Delivery) ───────────────────────────────
create sequence sj_no_seq;

create table surat_jalan (
  id          bigserial       primary key,
  no_sj       bigint          not null default nextval('sj_no_seq'),
  code        text            generated always as ('SJ-' || lpad(no_sj::text, 5, '0')) stored,
  sale_id     bigint          not null references sales(id),
  driver_id   bigint          references drivers(id),
  plat        text,
  status      delivery_status not null default 'dimuat',
  created_by  uuid            references profiles(id),
  created_at  timestamptz     not null default now()
);

-- "sisa belum dimuat" = sale_items.base_qty - sum(surat_jalan_lines.base_qty)
create table surat_jalan_lines (
  id              bigserial primary key,
  surat_jalan_id  bigint    not null references surat_jalan(id) on delete cascade,
  sale_item_id    bigint    not null references sale_items(id),
  base_qty        numeric   not null check (base_qty > 0)
);

-- ── Transfer Antar Gudang ─────────────────────────────────────
create table transfers (
  id          bigserial       primary key,
  from_wh     bigint          not null references warehouses(id),
  to_wh       bigint          not null references warehouses(id),
  status      transfer_status not null default 'in_transit',
  created_by  uuid            references profiles(id),
  created_at  timestamptz     not null default now(),
  check (from_wh <> to_wh)
);

create table transfer_items (
  id           bigserial primary key,
  transfer_id  bigint    not null references transfers(id) on delete cascade,
  product_id   bigint    not null references products(id),
  base_qty     numeric   not null check (base_qty > 0)
);


-- ════════════════════════════════════════════════════════════════
--  4. TRIGGER — Ledger Stok
-- ════════════════════════════════════════════════════════════════

-- Tiap movement insert → stocks ikut bergerak. Stok tidak bisa diubah tanpa jejak.
create or replace function apply_stock_movement() returns trigger
language plpgsql as $$
begin
  insert into stocks (product_id, warehouse_id, base_qty)
  values (new.product_id, new.warehouse_id, new.base_qty)
  on conflict (product_id, warehouse_id)
  do update set base_qty = stocks.base_qty + new.base_qty;
  return new;
end;
$$;

create trigger trg_apply_stock_movement
  after insert on stock_movements
  for each row execute function apply_stock_movement();


-- ════════════════════════════════════════════════════════════════
--  5. FUNCTIONS
-- ════════════════════════════════════════════════════════════════

-- Ambil role user yang sedang login (dipakai di policy RLS).
-- security definer supaya tidak rekursi saat policy profiles membaca profiles.
create or replace function get_current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- Hitung harga satuan sesuai tier pelanggan.
create or replace function get_unit_price(
  p_unit_id   bigint,
  p_category  customer_category default 'retail'
) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when p_category = 'toko' and price_toko is not null then price_toko
    else price
  end
  from product_units
  where id = p_unit_id;
$$;

-- Produk default untuk homepage POS: favorit (manual) lalu terlaris (dari penjualan).
create or replace function get_default_products(p_limit int default 48)
returns table (
  id            bigint,
  sku           text,
  name          text,
  category      text,
  base_unit     text,
  is_featured   boolean,
  display_order int,
  sold_qty      bigint,
  section       text
)
language sql stable security definer set search_path = public as $$
  with sales_agg as (
    select product_id, sum(qty)::bigint as sold_qty
    from sale_items
    group by product_id
  )
  select
    p.id, p.sku, p.name, p.category, p.base_unit,
    p.is_featured, p.display_order,
    coalesce(sa.sold_qty, 0) as sold_qty,
    case when p.is_featured then 'favorit' else 'terlaris' end as section
  from products p
  left join sales_agg sa on sa.product_id = p.id
  where p.active = true
    and (p.is_featured = true or sa.sold_qty > 0)
  order by
    (case when p.is_featured then 0 else 1 end),  -- favorit dulu
    p.display_order nulls last,                    -- urut display_order
    coalesce(sa.sold_qty, 0) desc,                 -- terlaris terbanyak
    p.name
  limit p_limit;
$$;

grant execute on function get_default_products(int) to authenticated;

-- Buat akun kasir (auth user + profil) dalam 1 pemanggilan.
create or replace function create_kasir(
  p_name        text,
  p_staff_code  text,
  p_pin         text   -- PIN 6 digit, akan di-hash bcrypt
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_id    uuid := gen_random_uuid();
  v_email text := p_staff_code || '@adijaya.local';
begin
  insert into auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, confirmation_token, recovery_token
  ) values (
    v_id, 'authenticated', 'authenticated',
    v_email, crypt(p_pin, gen_salt('bf')), now(),
    now(), now(),
    '{"provider":"email","providers":["email"]}', '{}',
    false, '', ''
  );

  insert into profiles (id, full_name, role, active, email_login, staff_code)
  values (v_id, p_name, 'kasir', true, v_email, p_staff_code)
  on conflict (id) do update
    set full_name   = excluded.full_name,
        role        = 'kasir',
        active      = true,
        email_login = excluded.email_login,
        staff_code  = excluded.staff_code;

  return v_id;
end;
$$;


-- ════════════════════════════════════════════════════════════════
--  6. INDEXES
-- ════════════════════════════════════════════════════════════════

create index if not exists idx_products_name_trgm
  on products using gin (name gin_trgm_ops);

create index if not exists idx_products_sku_trgm
  on products using gin (sku gin_trgm_ops);

create index if not exists idx_products_category
  on products (category) where active = true;

create index if not exists idx_products_featured
  on products (display_order nulls last)
  where is_featured = true and active = true;

create index if not exists idx_sales_cashier_created
  on sales (cashier_id, created_at desc);

create index if not exists idx_sales_customer
  on sales (customer_id) where customer_id is not null;

create index if not exists idx_sales_created
  on sales (created_at desc);

create index if not exists idx_sale_items_sale
  on sale_items (sale_id);


-- ════════════════════════════════════════════════════════════════
--  7. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════

alter table profiles        enable row level security;
alter table products        enable row level security;
alter table product_units   enable row level security;
alter table customers       enable row level security;
alter table sales           enable row level security;
alter table sale_items      enable row level security;
alter table stocks          enable row level security;
alter table stock_movements enable row level security;

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

-- ── Profiles ──────────────────────────────────────────────────
-- Layar login (anon) perlu baca daftar kasir untuk tampilkan nama di PIN-pad.
-- PIN tidak ada di tabel ini → aman dibaca anon.
create policy "login_baca_kasir_aktif" on profiles
  for select to anon, authenticated
  using (role = 'kasir' and active = true);

create policy "baca_profil_sendiri" on profiles
  for select to authenticated
  using (id = auth.uid());

create policy "owneradmin_baca_semua_profil" on profiles
  for select to authenticated
  using (get_current_role() in ('owner', 'admin'));

create policy "owneradmin_kelola_profil" on profiles
  for all to authenticated
  using    (get_current_role() in ('owner', 'admin'))
  with check (get_current_role() in ('owner', 'admin'));

-- ── Products ──────────────────────────────────────────────────
create policy "staf_baca_produk" on products
  for select to authenticated using (true);

create policy "owneradmin_kelola_produk" on products
  for all to authenticated
  using    (get_current_role() in ('owner', 'admin'))
  with check (get_current_role() in ('owner', 'admin'));

-- ── Product Units ─────────────────────────────────────────────
create policy "staf_baca_product_units" on product_units
  for select to authenticated using (true);

create policy "owneradmin_kelola_product_units" on product_units
  for all to authenticated
  using    (get_current_role() in ('owner', 'admin'))
  with check (get_current_role() in ('owner', 'admin'));

-- ── Customers ─────────────────────────────────────────────────
create policy "staf_baca_pelanggan" on customers
  for select to authenticated using (true);

create policy "staf_tambah_pelanggan" on customers
  for insert with check (get_current_role() in ('kasir', 'admin', 'owner'));

create policy "owneradmin_kelola_pelanggan" on customers
  for update using (get_current_role() in ('admin', 'owner'));

-- ── Sales ─────────────────────────────────────────────────────
create policy "catat_penjualan" on sales
  for insert with check (get_current_role() in ('kasir', 'admin', 'owner'));

-- Kasir boleh lihat semua transaksi miliknya (termasuk riwayat).
-- Admin/owner lihat semua transaksi.
create policy "lihat_penjualan" on sales
  for select using (
    get_current_role() in ('admin', 'owner')
    or cashier_id = auth.uid()
  );

create policy "void_penjualan" on sales
  for update using (get_current_role() in ('admin', 'owner'));

-- ── Sale Items ────────────────────────────────────────────────
create policy "catat_item_penjualan" on sale_items
  for insert with check (get_current_role() in ('kasir', 'admin', 'owner'));

-- Kasir lihat items dari transaksi miliknya (semua waktu, bukan cuma hari ini).
create policy "lihat_item_penjualan" on sale_items
  for select using (
    get_current_role() in ('admin', 'owner')
    or exists (
      select 1 from sales
      where sales.id = sale_items.sale_id
        and sales.cashier_id = auth.uid()
    )
  );

-- ── Stocks ────────────────────────────────────────────────────
create policy "staf_baca_stok" on stocks
  for select using (get_current_role() in ('kasir', 'admin', 'owner'));

-- Stocks TIDAK punya policy update/delete → default-deny.
-- Stok hanya bergerak lewat trigger dari stock_movements.

-- ── Stock Movements ───────────────────────────────────────────
create policy "catat_pergerakan_stok" on stock_movements
  for insert with check (get_current_role() in ('kasir', 'admin', 'owner'));

create policy "owneradmin_baca_movements" on stock_movements
  for select using (get_current_role() in ('admin', 'owner'));


-- ════════════════════════════════════════════════════════════════
--  8. SEED — GUDANG
-- ════════════════════════════════════════════════════════════════

insert into warehouses (name, is_hub) values
  ('Hub Utama', true);
  -- ('Cabang Tomang', false);  -- aktifkan jika ada cabang lain


-- ════════════════════════════════════════════════════════════════
--  9. SEED — KASIR
--  ⚠️  GANTI nama dan PIN sebelum menjalankan!
--  Format email otomatis: staff_code@adijaya.local
-- ════════════════════════════════════════════════════════════════

select create_kasir('Budi Santoso', 'staff01', '111111');
select create_kasir('Sari Dewi',    'staff02', '222222');
-- select create_kasir('Andi Pratama', 'staff03', '333333');

-- Verifikasi kasir berhasil dibuat
select id, full_name, staff_code, email_login, role, active
from profiles
where role = 'kasir'
order by staff_code;


-- ════════════════════════════════════════════════════════════════
--  10. SEED — PELANGGAN AWAL (contoh; ganti/tambah sesuai data aktual)
-- ════════════════════════════════════════════════════════════════

insert into customers (name, phone, address, category) values
  -- Retail
  ('Ahmad Fauzi',         '08121100001', 'Jl. Kemanggisan No. 12, Jakarta',        'retail'),
  ('Siti Rahayu',         '08121100002', 'Jl. Anggrek Raya No. 5, Tangerang',      'retail'),
  ('Benny Wijaya',        '08121100003', 'Jl. Merpati No. 33, Jakarta Barat',      'retail'),
  ('Dewi Kusuma',         '08121100004', 'Perum Taman Sari Blok B3, Depok',        'retail'),
  ('Hendra Santoso',      '08121100005', 'Jl. Pala Raya No. 17, Bekasi',           'retail'),
  -- Toko / reseller
  ('Toko Maju Jaya',      '02155500001', 'Jl. Raya Pasar Minggu No. 88, Jakarta',  'toko'),
  ('UD Sumber Makmur',    '02155500002', 'Jl. Industri No. 14, Tangerang',         'toko'),
  ('Toko Besi Rejeki',    '02155500003', 'Jl. Besi Raya No. 7, Bekasi',            'toko'),
  ('CV Bangun Sejahtera', '02155500004', 'Jl. Raya Bogor KM 22, Depok',            'toko'),
  ('Toko Material Abadi', '02155500005', 'Jl. Fatmawati No. 101, Jakarta Selatan', 'toko')
on conflict do nothing;


-- ════════════════════════════════════════════════════════════════
--  11. SEED — PRODUK CONTOH (hapus/ganti dengan SKU aktual)
--
--  Kolom is_featured = true  → tampil di tab Favorit POS
--  display_order             → urutan di grid (angka kecil = duluan)
--  price_toko = null         → harga toko sama dengan retail
-- ════════════════════════════════════════════════════════════════

insert into products (sku, name, category, base_unit, is_featured, display_order) values
  ('SMN-TR50', 'Semen Tiga Roda 50kg',  'Semen & Cor',  'kg',     true, 1),
  ('BSI-10',   'Besi Beton 10mm',       'Besi & Logam', 'batang', true, 2),
  ('CAT-AV1',  'Cat Avian Putih 1kg',   'Cat',          'kaleng', true, 3);

-- Satuan jual per produk.
-- factor_to_base = konversi ke base_unit produk.
--   Semen: 1 sak = 50 kg → factor 50. 1 kg = 1 kg → factor 1.
--   Cat:   1 dus isi 6 kaleng → factor 6.
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default)
select p.id, u.unit_name, u.factor, u.price, u.price_toko, u.is_default
from products p
join (values
  ('SMN-TR50', 'sak',        50,  62000, 59000, true),
  ('SMN-TR50', 'kg',          1,   1400,  1300, false),
  ('BSI-10',   'batang',      1,  78000, 72000, true),
  ('CAT-AV1',  'kaleng',      1,  95000, 88000, true),
  ('CAT-AV1',  'dus (isi 6)', 6, 540000,498000, false)
) as u(sku, unit_name, factor, price, price_toko, is_default)
  on p.sku = u.sku;


-- ════════════════════════════════════════════════════════════════
--  12. SEED — STOK AWAL
--  Selalu gunakan stock_movements untuk input stok.
--  base_qty harus dalam BASE UNIT produk (bukan satuan jual).
--  Contoh: 500 sak semen → 500 × 50 kg = 25000 kg.
-- ════════════════════════════════════════════════════════════════

insert into stock_movements (product_id, warehouse_id, base_qty, type, note)
select p.id, 1, s.base_qty, 'adjustment', 'stok awal'
from products p
join (values
  ('SMN-TR50', 25000),   -- 500 sak × 50 kg
  ('BSI-10',     500),   -- 500 batang
  ('CAT-AV1',     60)    -- 60 kaleng
) as s(sku, base_qty) on p.sku = s.sku;


-- ════════════════════════════════════════════════════════════════
--  VERIFIKASI (jalankan setelah semua di atas berhasil)
-- ════════════════════════════════════════════════════════════════

select
  p.name                            as produk,
  pu.unit_name                      as satuan,
  pu.price                          as harga_retail,
  coalesce(pu.price_toko, pu.price) as harga_toko,
  pu.is_default
from product_units pu
join products p on p.id = pu.product_id
order by p.name, pu.is_default desc;

select p.name, s.base_qty, p.base_unit
from stocks s
join products p on p.id = s.product_id;
