-- ================================================================
--  Patch: Retur Barang ke Supplier
--
--  Jalankan SEKALI di Supabase SQL Editor.
--  Prasyarat: schema_patch_goods_receipt.sql sudah dijalankan.
--
--  Yang dilakukan:
--   1. Tambah nilai enum movement_type: 'purchase_return'
--   2. Tabel supplier_returns (header SR, kode otomatis SR-XXXXX)
--   3. Tabel supplier_return_items (detail per barang)
--   4. RLS: admin/owner full CRUD, kasir read-only
--   5. RPC return_to_supplier — atomik: insert SR + items + stock_movements
-- ================================================================

-- 1. Enum nilai baru untuk stok keluar ke supplier
--    (aman digabung dengan CREATE FUNCTION karena body lazy-compiled)
alter type movement_type add value if not exists 'purchase_return';

-- 2. Sequence + header SR
create sequence if not exists sr_no_seq;

create table if not exists supplier_returns (
  id           bigserial    primary key,
  no_sr        bigint       not null default nextval('sr_no_seq'),
  code         text         generated always as ('SR-' || lpad(no_sr::text, 5, '0')) stored,
  supplier_id  bigint       not null references suppliers(id),
  warehouse_id bigint       not null references warehouses(id),
  returned_at  date         not null default current_date,
  note         text,
  created_by   uuid         references profiles(id),
  created_at   timestamptz  not null default now()
);

-- 3. Detail items per SR
create table if not exists supplier_return_items (
  id                 bigserial  primary key,
  supplier_return_id bigint     not null references supplier_returns(id) on delete cascade,
  product_id         bigint     not null references products(id),
  unit_id            bigint     not null references product_units(id),
  qty                numeric    not null check (qty > 0),
  base_qty           numeric    not null,
  reason             text
);

-- 4. RLS
alter table supplier_returns      enable row level security;
alter table supplier_return_items enable row level security;

drop policy if exists "baca_supplier_returns"         on supplier_returns;
drop policy if exists "admin_kelola_supplier_returns" on supplier_returns;
drop policy if exists "baca_sr_items"                 on supplier_return_items;
drop policy if exists "admin_kelola_sr_items"         on supplier_return_items;

create policy "baca_supplier_returns"
  on supplier_returns for select to authenticated
  using (get_current_role() in ('admin', 'owner', 'kasir'));

create policy "admin_kelola_supplier_returns"
  on supplier_returns for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

create policy "baca_sr_items"
  on supplier_return_items for select to authenticated
  using (get_current_role() in ('admin', 'owner', 'kasir'));

create policy "admin_kelola_sr_items"
  on supplier_return_items for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

-- 5. RPC atomik
--    Stok turun (base_qty negatif) dengan type = 'purchase_return'
--    Hanya produk yang pernah diterima dari supplier ini yang boleh diretur
create or replace function return_to_supplier(
  p_supplier_id   bigint,
  p_warehouse_id  bigint,
  p_returned_at   date,
  p_note          text,
  p_created_by    uuid,
  p_items         jsonb   -- [{unit_id, qty, reason}]
) returns jsonb
language plpgsql security definer as $$
declare
  v_sr_id    bigint;
  v_code     text;
  v_item     jsonb;
  v_unit_id  bigint;
  v_qty      numeric;
  v_factor   numeric;
  v_prod_id  bigint;
  v_base_qty numeric;
  v_reason   text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal 1 barang harus diisi';
  end if;

  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'Supplier tidak ditemukan';
  end if;

  -- Header SR
  insert into supplier_returns (supplier_id, warehouse_id, returned_at, note, created_by)
  values (
    p_supplier_id, p_warehouse_id, p_returned_at,
    nullif(trim(coalesce(p_note, '')), ''),
    p_created_by
  )
  returning id, code into v_sr_id, v_code;

  -- Items + stock movements
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_unit_id := (v_item->>'unit_id')::bigint;
    v_qty     := (v_item->>'qty')::numeric;
    v_reason  := nullif(trim(coalesce(v_item->>'reason', '')), '');

    if v_qty <= 0 then
      raise exception 'Qty harus lebih dari 0';
    end if;

    select pu.product_id, pu.factor_to_base
      into v_prod_id, v_factor
    from product_units pu
    where pu.id = v_unit_id;

    if not found then
      raise exception 'Unit tidak ditemukan: %', v_unit_id;
    end if;

    -- Validasi: produk ini harus pernah diterima dari supplier ini
    if not exists (
      select 1
      from goods_receipt_items gri
      join goods_receipts gr on gr.id = gri.goods_receipt_id
      where gr.supplier_id = p_supplier_id
        and gri.product_id = v_prod_id
    ) then
      raise exception 'Produk ini belum pernah diterima dari supplier ini';
    end if;

    v_base_qty := v_qty * v_factor;

    insert into supplier_return_items (supplier_return_id, product_id, unit_id, qty, base_qty, reason)
    values (v_sr_id, v_prod_id, v_unit_id, v_qty, v_base_qty, v_reason);

    -- Stok turun: negatif, type = 'purchase_return'
    insert into stock_movements (product_id, warehouse_id, base_qty, type, ref_table, ref_id, created_by)
    values (v_prod_id, p_warehouse_id, -v_base_qty, 'purchase_return', 'supplier_returns', v_sr_id, p_created_by);
  end loop;

  return jsonb_build_object('id', v_sr_id, 'code', v_code);
end;
$$;

grant execute on function return_to_supplier(bigint, bigint, date, text, uuid, jsonb) to authenticated;
