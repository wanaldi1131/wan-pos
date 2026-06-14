-- =============================================================
--  Migration v3: Featured Products + Default Homepage
--  Jalankan setelah schema_v2_pricing.sql
--  Aman di-run ulang (idempotent).
--
--  Apa yang ditambah:
--   1. products.is_featured   → tandai manual oleh admin
--   2. products.display_order → urutan di grid favorit
--   3. get_default_products() → RPC gabungan favorit + terlaris
-- =============================================================


-- ---------- 1. Kolom baru di products ----------
alter table products
  add column if not exists is_featured   boolean not null default false,
  add column if not exists display_order int;

comment on column products.is_featured is
  'Tampil di tab Semua tanpa search. Diatur manual oleh admin/owner.';
comment on column products.display_order is
  'Urutan tampil di grid Favorit. NULL = paling akhir (urut nama).';

-- Index cepat untuk query favorit
create index if not exists idx_products_featured
  on products (display_order nulls last)
  where is_featured = true and active = true;


-- ---------- 2. RPC: default products (favorit lalu terlaris) ----------
-- Logika:
--   • Baris is_featured=true → section "favorit", urut display_order
--   • Baris is_featured=false dengan setidaknya 1 penjualan → section "terlaris"
--   • Produk yang tidak pernah dijual dan tidak di-featured → tidak muncul
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
    p.id,
    p.sku,
    p.name,
    p.category,
    p.base_unit,
    p.is_featured,
    p.display_order,
    coalesce(sa.sold_qty, 0) as sold_qty,
    case when p.is_featured then 'favorit' else 'terlaris' end as section
  from products p
  left join sales_agg sa on sa.product_id = p.id
  where p.active = true
    and (p.is_featured = true or sa.sold_qty > 0)
  order by
    -- Favorit dulu (0), terlaris belakang (1)
    (case when p.is_featured then 0 else 1 end),
    -- Dalam favorit: urut display_order
    p.display_order nulls last,
    -- Dalam terlaris: urut qty terbanyak
    coalesce(sa.sold_qty, 0) desc,
    -- Tiebreaker: nama
    p.name
  limit p_limit;
$$;

grant execute on function get_default_products(int) to authenticated;


-- ---------- 3. Seed: tandai produk contoh sebagai favorit ----------
-- Ganti/tambah sesuai SKU aktual di toko.
-- display_order menentukan urutan tampil di grid.
update products set is_featured = true, display_order = 1 where sku = 'SMN-TR50';
update products set is_featured = true, display_order = 2 where sku = 'BSI-10';
update products set is_featured = true, display_order = 3 where sku = 'CAT-AV1';


-- ---------- Verifikasi ----------
select
  id,
  name,
  sku,
  is_featured,
  display_order,
  active
from products
order by is_featured desc, display_order nulls last, name;
