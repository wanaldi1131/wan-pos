-- =============================================================
--  Migration: Retur Penjualan per Item
--  Jalankan setelah schema_production.sql
--  Aman di-run ulang (idempotent).
--
--  Fitur:
--    - Retur sebagian item dari 1 penjualan
--    - Qty retur bisa desimal (0.5, 0.75, dll)
--    - Stok otomatis bertambah kembali lewat stock_movements
--    - Riwayat retur tersimpan lengkap (tidak menghapus sale_items)
-- =============================================================


-- ── Tabel utama retur ─────────────────────────────────────────
create table if not exists sale_returns (
  id          bigserial   primary key,
  sale_id     bigint      not null references sales(id),
  cashier_id  uuid        references profiles(id),
  note        text,
  total       numeric     not null default 0,
  created_at  timestamptz not null default now()
);

-- ── Detail item yang diretur ──────────────────────────────────
-- Tiap baris = sebagian (atau semua) dari 1 sale_item yang dikembalikan.
-- Bisa ada beberapa retur untuk 1 sale_item (retur bertahap).
create table if not exists return_items (
  id            bigserial primary key,
  return_id     bigint    not null references sale_returns(id) on delete cascade,
  sale_item_id  bigint    not null references sale_items(id),
  qty           numeric   not null check (qty > 0),   -- dalam satuan jual
  base_qty      numeric   not null,                   -- qty × factor_to_base
  unit_price    numeric   not null,
  subtotal      numeric   not null
);

-- ── RLS ───────────────────────────────────────────────────────
alter table sale_returns enable row level security;
alter table return_items  enable row level security;

-- Kasir yang melakukan retur (atau admin/owner) bisa lihat & catat
drop policy if exists "catat_retur"       on sale_returns;
drop policy if exists "lihat_retur"       on sale_returns;
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

-- Grant baca untuk authenticated (dibutuhkan startRetur query)
grant select on sale_returns, return_items to authenticated;
grant insert on sale_returns, return_items to authenticated;


-- ── Verifikasi ────────────────────────────────────────────────
select
  table_name,
  (select count(*) from information_schema.columns c2
   where c2.table_name = t.table_name and c2.table_schema = 'public') as kolom
from information_schema.tables t
where table_schema = 'public'
  and table_name in ('sale_returns', 'return_items')
order by table_name;
