-- ================================================================
--  Patch: Penerimaan Barang (goods_receipts + goods_receipt_items)
--
--  Jalankan SEKALI di Supabase SQL Editor.
--  Prasyarat: schema_patch_suppliers.sql sudah dijalankan.
--
--  Yang dilakukan:
--   1. Tabel goods_receipts (header GR, kode otomatis GR-XXXXX)
--   2. Tabel goods_receipt_items (detail per barang)
--   3. RLS: admin/owner full CRUD, kasir read-only
--   4. RPC receive_goods — atomik: insert GR + items + stock_movements
-- ================================================================

-- 1. Sequence + header GR
create sequence if not exists gr_no_seq;

create table if not exists goods_receipts (
  id           bigserial    primary key,
  no_gr        bigint       not null default nextval('gr_no_seq'),
  code         text         generated always as ('GR-' || lpad(no_gr::text, 5, '0')) stored,
  supplier_id  bigint       not null references suppliers(id),
  checker_id   uuid         not null references profiles(id),
  warehouse_id bigint       not null references warehouses(id),
  received_at  date         not null default current_date,
  note         text,
  created_by   uuid         references profiles(id),
  created_at   timestamptz  not null default now()
);

-- 2. Detail items per GR
create table if not exists goods_receipt_items (
  id               bigserial  primary key,
  goods_receipt_id bigint     not null references goods_receipts(id) on delete cascade,
  product_id       bigint     not null references products(id),
  unit_id          bigint     not null references product_units(id),
  qty              numeric    not null check (qty > 0),
  base_qty         numeric    not null
);

-- 3. RLS
alter table goods_receipts      enable row level security;
alter table goods_receipt_items enable row level security;

drop policy if exists "baca_goods_receipt"         on goods_receipts;
drop policy if exists "admin_kelola_goods_receipt" on goods_receipts;
drop policy if exists "baca_gr_items"              on goods_receipt_items;
drop policy if exists "admin_kelola_gr_items"      on goods_receipt_items;

-- Kasir bisa baca (mungkin perlu lihat GR yang mereka jadi checker-nya)
create policy "baca_goods_receipt"
  on goods_receipts for select to authenticated
  using (get_current_role() in ('admin', 'owner', 'kasir'));

create policy "admin_kelola_goods_receipt"
  on goods_receipts for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

create policy "baca_gr_items"
  on goods_receipt_items for select to authenticated
  using (get_current_role() in ('admin', 'owner', 'kasir'));

create policy "admin_kelola_gr_items"
  on goods_receipt_items for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

-- 4. RPC atomik: insert GR + items + stock_movements sekaligus
create or replace function receive_goods(
  p_supplier_id   bigint,
  p_checker_id    uuid,
  p_warehouse_id  bigint,
  p_received_at   date,
  p_note          text,
  p_created_by    uuid,
  p_items         jsonb   -- [{unit_id: bigint, qty: numeric}]
) returns jsonb
language plpgsql security definer as $$
declare
  v_gr_id    bigint;
  v_code     text;
  v_item     jsonb;
  v_unit_id  bigint;
  v_qty      numeric;
  v_factor   numeric;
  v_prod_id  bigint;
  v_base_qty numeric;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal 1 barang harus diisi';
  end if;

  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'Supplier tidak ditemukan';
  end if;

  if not exists (
    select 1 from profiles
    where id = p_checker_id and role = 'kasir' and active = true
  ) then
    raise exception 'Checker tidak valid atau tidak aktif';
  end if;

  -- Header GR
  insert into goods_receipts (
    supplier_id, checker_id, warehouse_id, received_at, note, created_by
  )
  values (
    p_supplier_id, p_checker_id, p_warehouse_id,
    p_received_at,
    nullif(trim(coalesce(p_note, '')), ''),
    p_created_by
  )
  returning id, code into v_gr_id, v_code;

  -- Items + stock movements
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_unit_id := (v_item->>'unit_id')::bigint;
    v_qty     := (v_item->>'qty')::numeric;

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

    v_base_qty := v_qty * v_factor;

    insert into goods_receipt_items (goods_receipt_id, product_id, unit_id, qty, base_qty)
    values (v_gr_id, v_prod_id, v_unit_id, v_qty, v_base_qty);

    -- Stok masuk: base_qty positif, type = 'purchase'
    insert into stock_movements (product_id, warehouse_id, base_qty, type, ref_table, ref_id, created_by)
    values (v_prod_id, p_warehouse_id, v_base_qty, 'purchase', 'goods_receipts', v_gr_id, p_created_by);
  end loop;

  return jsonb_build_object('id', v_gr_id, 'code', v_code);
end;
$$;

grant execute on function receive_goods(bigint, uuid, bigint, date, text, uuid, jsonb) to authenticated;
