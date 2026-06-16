-- =============================================================
--  WAN POS — Schema Lengkap (All-in-One)
--  Jalankan di Supabase SQL Editor pada database BARU / KOSONG.
--
--  ⚠️  SEBELUM MENJALANKAN:
--    • Cari section "SEED: KASIR" dan isi nama + PIN karyawan aktual.
--    • Hapus atau sesuaikan seed produk di section 12-13 jika perlu.
-- =============================================================


-- ════════════════════════════════════════════════════════════════
--  1. EXTENSIONS
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;  -- bcrypt untuk PIN kasir
create extension if not exists pg_trgm;   -- trigram index untuk pencarian cepat


-- ════════════════════════════════════════════════════════════════
--  2. ENUMS
-- ════════════════════════════════════════════════════════════════

do $$ begin create type user_role         as enum ('owner', 'admin', 'kasir');          exception when duplicate_object then null; end $$;
do $$ begin create type customer_category as enum ('retail', 'toko');                   exception when duplicate_object then null; end $$;
do $$ begin create type fulfillment_type  as enum ('ambil', 'antar');                   exception when duplicate_object then null; end $$;
do $$ begin create type payment_method    as enum ('tunai', 'transfer', 'cod', 'kredit'); exception when duplicate_object then null; end $$;
do $$ begin create type payment_status    as enum ('belum', 'lunas');                   exception when duplicate_object then null; end $$;
do $$ begin create type movement_type     as enum ('sale', 'sale_return', 'purchase', 'transfer_out', 'transfer_in', 'adjustment'); exception when duplicate_object then null; end $$;
do $$ begin create type delivery_status   as enum ('dimuat', 'terkirim');               exception when duplicate_object then null; end $$;
do $$ begin create type transfer_status   as enum ('in_transit', 'received');           exception when duplicate_object then null; end $$;


-- ════════════════════════════════════════════════════════════════
--  3. TABEL UTAMA
-- ════════════════════════════════════════════════════════════════

create table if not exists profiles (
  id           uuid        primary key references auth.users(id) on delete cascade,
  full_name    text        not null,
  role         user_role   not null default 'kasir',
  active       boolean     not null default true,
  email_login  text        unique,
  staff_code   text        unique,
  created_at   timestamptz not null default now()
);

create table if not exists warehouses (
  id      bigserial primary key,
  name    text      not null,
  is_hub  boolean   not null default false
);

create table if not exists products (
  id             bigserial   primary key,
  sku            text        unique,
  name           text        not null,
  category       text,
  base_unit      text        not null,
  active         boolean     not null default true,
  is_featured    boolean     not null default false,
  display_order  int,
  created_at     timestamptz not null default now()
);

create table if not exists product_units (
  id              bigserial primary key,
  product_id      bigint    not null references products(id) on delete cascade,
  unit_name       text      not null,
  factor_to_base  numeric   not null check (factor_to_base > 0),
  price           numeric   not null check (price >= 0),
  price_toko      numeric   check (price_toko > 0),
  is_default      boolean   not null default false,
  unique (product_id, unit_name)
);

create table if not exists customers (
  id        bigserial         primary key,
  name      text              not null,
  phone     text,
  address   text,
  category  customer_category not null default 'retail'
);

create table if not exists suppliers (
  id    bigserial primary key,
  name  text      not null,
  phone text
);

create table if not exists drivers (
  id     bigserial primary key,
  name   text      not null,
  active boolean   not null default true
);

create table if not exists stock_movements (
  id            bigserial     primary key,
  product_id    bigint        not null references products(id),
  warehouse_id  bigint        not null references warehouses(id),
  base_qty      numeric       not null,
  type          movement_type not null,
  ref_table     text,
  ref_id        bigint,
  note          text,
  created_by    uuid          references profiles(id),
  created_at    timestamptz   not null default now()
);

create table if not exists stocks (
  product_id    bigint  not null references products(id),
  warehouse_id  bigint  not null references warehouses(id),
  base_qty      numeric not null default 0,
  primary key (product_id, warehouse_id)
);

create sequence if not exists sale_no_seq;

create table if not exists sales (
  id            bigserial        primary key,
  no_nota       bigint           not null default nextval('sale_no_seq'),
  code          text             generated always as ('INV-' || lpad(no_nota::text, 5, '0')) stored,
  cashier_id    uuid             references profiles(id),
  customer_id   bigint           references customers(id),
  warehouse_id  bigint           not null references warehouses(id),
  fulfillment   fulfillment_type not null default 'ambil',
  pay_method    payment_method   not null,
  pay_status    payment_status   not null default 'belum',
  cod_settled   boolean,
  total         numeric          not null default 0,
  voided        boolean          not null default false,
  created_at    timestamptz      not null default now()
);

create table if not exists sale_items (
  id          bigserial primary key,
  sale_id     bigint    not null references sales(id) on delete cascade,
  product_id  bigint    not null references products(id),
  unit_id     bigint    not null references product_units(id),
  qty         numeric   not null check (qty > 0),
  base_qty    numeric   not null,
  unit_price  numeric   not null,
  subtotal    numeric   not null
);

create sequence if not exists sj_no_seq;

create table if not exists surat_jalan (
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

create table if not exists surat_jalan_lines (
  id              bigserial primary key,
  surat_jalan_id  bigint    not null references surat_jalan(id) on delete cascade,
  sale_item_id    bigint    not null references sale_items(id),
  base_qty        numeric   not null check (base_qty > 0)
);

create table if not exists transfers (
  id          bigserial       primary key,
  from_wh     bigint          not null references warehouses(id),
  to_wh       bigint          not null references warehouses(id),
  status      transfer_status not null default 'in_transit',
  created_by  uuid            references profiles(id),
  created_at  timestamptz     not null default now(),
  check (from_wh <> to_wh)
);

create table if not exists transfer_items (
  id           bigserial primary key,
  transfer_id  bigint    not null references transfers(id) on delete cascade,
  product_id   bigint    not null references products(id),
  base_qty     numeric   not null check (base_qty > 0)
);


-- ════════════════════════════════════════════════════════════════
--  4. TABEL RETUR
-- ════════════════════════════════════════════════════════════════

create table if not exists sale_returns (
  id             bigserial   primary key,
  sale_id        bigint      not null references sales(id),
  cashier_id     uuid        references profiles(id),
  note           text,
  total          numeric     not null default 0,
  refund_method  text        not null default 'tunai'
                 check (refund_method in ('tunai', 'transfer', 'nota')),
  created_at     timestamptz not null default now()
);

create table if not exists return_items (
  id            bigserial primary key,
  return_id     bigint    not null references sale_returns(id) on delete cascade,
  sale_item_id  bigint    not null references sale_items(id),
  qty           numeric   not null check (qty > 0),
  base_qty      numeric   not null,
  unit_price    numeric   not null,
  subtotal      numeric   not null
);


-- ════════════════════════════════════════════════════════════════
--  5. TABEL KAS HARIAN
-- ════════════════════════════════════════════════════════════════

create table if not exists cash_sessions (
  id               bigserial    primary key,
  cashier_id       uuid         not null references profiles(id),
  warehouse_id     int          not null default 1 references warehouses(id),
  opened_at        timestamptz  not null default now(),
  closed_at        timestamptz,
  opening_balance  numeric      not null default 0,
  closing_balance  numeric,
  notes            text,
  status           text         not null default 'open'
                   check (status in ('open', 'closed'))
);

create table if not exists cash_out (
  id           bigserial    primary key,
  session_id   bigint       not null references cash_sessions(id) on delete cascade,
  cashier_id   uuid         not null references profiles(id),
  amount       numeric      not null check (amount > 0),
  description  text         not null,
  created_at   timestamptz  not null default now()
);


-- ════════════════════════════════════════════════════════════════
--  6. TRIGGER — Ledger Stok
-- ════════════════════════════════════════════════════════════════

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

drop trigger if exists trg_apply_stock_movement on stock_movements;
create trigger trg_apply_stock_movement
  after insert on stock_movements
  for each row execute function apply_stock_movement();


-- ════════════════════════════════════════════════════════════════
--  7. FUNCTIONS
-- ════════════════════════════════════════════════════════════════

create or replace function get_current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

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
    (case when p.is_featured then 0 else 1 end),
    p.display_order nulls last,
    coalesce(sa.sold_qty, 0) desc,
    p.name
  limit p_limit;
$$;

-- Buat akun kasir: insert auth.users + profiles dalam 1 transaksi.
-- Kalau email sudah ada (active), langsung pakai ID-nya dan update profile.
-- PIN 6 digit di-hash bcrypt sebelum disimpan.
create or replace function create_kasir(
  p_name        text,
  p_staff_code  text,
  p_pin         text
) returns uuid
language plpgsql security definer set search_path = extensions, public, auth as $$
declare
  v_id    uuid;
  v_email text := p_staff_code || '@adijaya.com';
begin
  -- Cek apakah auth user sudah ada (dan belum dihapus)
  select id into v_id
  from auth.users
  where email = v_email and deleted_at is null;

  if v_id is null then
    v_id := gen_random_uuid();
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
  end if;

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
--  8. INDEXES
-- ════════════════════════════════════════════════════════════════

create index if not exists idx_products_name_trgm      on products using gin (name gin_trgm_ops);
create index if not exists idx_products_sku_trgm       on products using gin (sku gin_trgm_ops);
create index if not exists idx_products_category       on products (category) where active = true;
create index if not exists idx_products_featured       on products (display_order nulls last) where is_featured = true and active = true;
create index if not exists idx_sales_cashier_created   on sales (cashier_id, created_at desc);
create index if not exists idx_sales_customer          on sales (customer_id) where customer_id is not null;
create index if not exists idx_sales_created           on sales (created_at desc);
create index if not exists idx_sale_items_sale         on sale_items (sale_id);
create index if not exists idx_cash_sessions_cashier   on cash_sessions (cashier_id, status);
create index if not exists idx_cash_out_session        on cash_out (session_id);


-- ════════════════════════════════════════════════════════════════
--  9. ROW LEVEL SECURITY — enable
-- ════════════════════════════════════════════════════════════════

alter table profiles          enable row level security;
alter table products          enable row level security;
alter table product_units     enable row level security;
alter table customers         enable row level security;
alter table sales             enable row level security;
alter table sale_items        enable row level security;
alter table stocks            enable row level security;
alter table stock_movements   enable row level security;
alter table surat_jalan       enable row level security;
alter table surat_jalan_lines enable row level security;
alter table drivers           enable row level security;
alter table sale_returns      enable row level security;
alter table return_items      enable row level security;
alter table cash_sessions     enable row level security;
alter table cash_out          enable row level security;


-- ════════════════════════════════════════════════════════════════
--  10. POLICIES
-- ════════════════════════════════════════════════════════════════

-- ── Profiles ──────────────────────────────────────────────────
drop policy if exists "login_baca_kasir_aktif"      on profiles;
drop policy if exists "baca_profil_sendiri"         on profiles;
drop policy if exists "owneradmin_baca_semua_profil" on profiles;
drop policy if exists "owneradmin_kelola_profil"    on profiles;

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
drop policy if exists "staf_baca_produk"         on products;
drop policy if exists "owneradmin_kelola_produk" on products;

create policy "staf_baca_produk" on products
  for select to authenticated using (true);

create policy "owneradmin_kelola_produk" on products
  for all to authenticated
  using    (get_current_role() in ('owner', 'admin'))
  with check (get_current_role() in ('owner', 'admin'));

-- ── Product Units ─────────────────────────────────────────────
drop policy if exists "staf_baca_product_units"         on product_units;
drop policy if exists "owneradmin_kelola_product_units" on product_units;

create policy "staf_baca_product_units" on product_units
  for select to authenticated using (true);

create policy "owneradmin_kelola_product_units" on product_units
  for all to authenticated
  using    (get_current_role() in ('owner', 'admin'))
  with check (get_current_role() in ('owner', 'admin'));

-- ── Customers ─────────────────────────────────────────────────
drop policy if exists "staf_baca_pelanggan"      on customers;
drop policy if exists "staf_tambah_pelanggan"    on customers;
drop policy if exists "owneradmin_kelola_pelanggan" on customers;

create policy "staf_baca_pelanggan" on customers
  for select to authenticated using (true);

create policy "staf_tambah_pelanggan" on customers
  for insert with check (get_current_role() in ('kasir', 'admin', 'owner'));

create policy "owneradmin_kelola_pelanggan" on customers
  for update using (get_current_role() in ('admin', 'owner'));

-- ── Sales ─────────────────────────────────────────────────────
drop policy if exists "catat_penjualan" on sales;
drop policy if exists "lihat_penjualan" on sales;
drop policy if exists "void_penjualan"  on sales;

create policy "catat_penjualan" on sales
  for insert with check (get_current_role() in ('kasir', 'admin', 'owner'));

create policy "lihat_penjualan" on sales
  for select using (
    get_current_role() in ('admin', 'owner')
    or cashier_id = auth.uid()
  );

create policy "void_penjualan" on sales
  for update using (get_current_role() in ('admin', 'owner'));

-- ── Sale Items ────────────────────────────────────────────────
drop policy if exists "catat_item_penjualan" on sale_items;
drop policy if exists "lihat_item_penjualan" on sale_items;

create policy "catat_item_penjualan" on sale_items
  for insert with check (get_current_role() in ('kasir', 'admin', 'owner'));

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
drop policy if exists "staf_baca_stok" on stocks;

create policy "staf_baca_stok" on stocks
  for select using (get_current_role() in ('kasir', 'admin', 'owner'));

-- ── Stock Movements ───────────────────────────────────────────
drop policy if exists "catat_pergerakan_stok"    on stock_movements;
drop policy if exists "owneradmin_baca_movements" on stock_movements;

create policy "catat_pergerakan_stok" on stock_movements
  for insert with check (get_current_role() in ('kasir', 'admin', 'owner'));

create policy "owneradmin_baca_movements" on stock_movements
  for select using (get_current_role() in ('admin', 'owner'));

-- ── Drivers ───────────────────────────────────────────────────
drop policy if exists "baca_driver"   on drivers;
drop policy if exists "kelola_driver" on drivers;

create policy "baca_driver" on drivers
  for select using (auth.uid() is not null);

create policy "kelola_driver" on drivers
  for all using (get_current_role() in ('admin', 'owner'));

-- ── Surat Jalan ───────────────────────────────────────────────
drop policy if exists "baca_surat_jalan"   on surat_jalan;
drop policy if exists "catat_surat_jalan"  on surat_jalan;
drop policy if exists "update_surat_jalan" on surat_jalan;

create policy "baca_surat_jalan" on surat_jalan
  for select using (get_current_role() in ('kasir', 'admin', 'owner'));

create policy "catat_surat_jalan" on surat_jalan
  for insert with check (get_current_role() in ('admin', 'owner'));

create policy "update_surat_jalan" on surat_jalan
  for update using (get_current_role() in ('admin', 'owner'));

-- ── Surat Jalan Lines ─────────────────────────────────────────
drop policy if exists "baca_sj_lines"  on surat_jalan_lines;
drop policy if exists "catat_sj_lines" on surat_jalan_lines;

create policy "baca_sj_lines" on surat_jalan_lines
  for select using (get_current_role() in ('kasir', 'admin', 'owner'));

create policy "catat_sj_lines" on surat_jalan_lines
  for insert with check (get_current_role() in ('admin', 'owner'));

-- ── Retur ─────────────────────────────────────────────────────
drop policy if exists "catat_retur"        on sale_returns;
drop policy if exists "lihat_retur"        on sale_returns;
drop policy if exists "catat_return_items" on return_items;
drop policy if exists "lihat_return_items" on return_items;

create policy "catat_retur" on sale_returns
  for insert with check (get_current_role() in ('kasir', 'admin', 'owner'));

create policy "lihat_retur" on sale_returns
  for select using (
    get_current_role() in ('admin', 'owner')
    or cashier_id = auth.uid()
  );

create policy "catat_return_items" on return_items
  for insert with check (get_current_role() in ('kasir', 'admin', 'owner'));

create policy "lihat_return_items" on return_items
  for select using (
    get_current_role() in ('admin', 'owner')
    or exists (
      select 1 from sale_returns r
      where r.id = return_items.return_id
        and r.cashier_id = auth.uid()
    )
  );

-- ── Kas Harian ────────────────────────────────────────────────
drop policy if exists "lihat_sesi_kas"   on cash_sessions;
drop policy if exists "buka_sesi_kas"    on cash_sessions;
drop policy if exists "tutup_sesi_kas"   on cash_sessions;
drop policy if exists "lihat_kas_keluar" on cash_out;
drop policy if exists "catat_kas_keluar" on cash_out;

create policy "lihat_sesi_kas" on cash_sessions
  for select using (
    get_current_role() in ('admin', 'owner')
    or cashier_id = auth.uid()
  );

create policy "buka_sesi_kas" on cash_sessions
  for insert with check (
    get_current_role() in ('kasir', 'admin', 'owner')
    and cashier_id = auth.uid()
  );

create policy "tutup_sesi_kas" on cash_sessions
  for update using (
    get_current_role() in ('kasir', 'admin', 'owner')
    and cashier_id = auth.uid()
  ) with check (
    get_current_role() in ('kasir', 'admin', 'owner')
    and cashier_id = auth.uid()
  );

create policy "lihat_kas_keluar" on cash_out
  for select using (
    get_current_role() in ('admin', 'owner')
    or cashier_id = auth.uid()
  );

create policy "catat_kas_keluar" on cash_out
  for insert with check (
    get_current_role() in ('kasir', 'admin', 'owner')
    and cashier_id = auth.uid()
  );


-- ════════════════════════════════════════════════════════════════
--  11. GRANTS
-- ════════════════════════════════════════════════════════════════

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;

grant execute on function get_default_products(int) to authenticated;

grant select, insert, update on sales             to authenticated;
grant select, insert         on sale_items        to authenticated;
grant select, insert         on stock_movements   to authenticated;
grant select, insert         on customers         to authenticated;
grant select                 on drivers           to authenticated;
grant select, insert, update on surat_jalan       to authenticated;
grant select, insert         on surat_jalan_lines to authenticated;
grant select, insert         on sale_returns      to authenticated;
grant select, insert         on return_items      to authenticated;
grant select, insert, update on cash_sessions     to authenticated;
grant select, insert         on cash_out          to authenticated;

grant usage, select on sequence sale_no_seq               to authenticated;
grant usage, select on sequence sj_no_seq                 to authenticated;
grant usage, select on sequence cash_sessions_id_seq      to authenticated;
grant usage, select on sequence cash_out_id_seq           to authenticated;
grant usage, select on sequence surat_jalan_id_seq        to authenticated;
grant usage, select on sequence surat_jalan_lines_id_seq  to authenticated;
grant usage, select on sequence sale_returns_id_seq       to authenticated;
grant usage, select on sequence return_items_id_seq       to authenticated;


-- ════════════════════════════════════════════════════════════════
--  12. SEED — GUDANG
-- ════════════════════════════════════════════════════════════════

insert into warehouses (name, is_hub) values ('Hub Utama', true)
on conflict do nothing;


-- ════════════════════════════════════════════════════════════════
--  13. SEED — KASIR
--  ⚠️  GANTI nama dan PIN sebelum menjalankan!
--  Format email otomatis: staff_code@adijaya.local
-- ════════════════════════════════════════════════════════════════

select create_kasir('Nama Kasir 1', 'staff01', '111111');
select create_kasir('Nama Kasir 2', 'staff02', '222222');
-- select create_kasir('Nama Kasir 3', 'staff03', '333333');

-- Verifikasi kasir
select full_name, staff_code, email_login, active from profiles where role = 'kasir' order by staff_code;
