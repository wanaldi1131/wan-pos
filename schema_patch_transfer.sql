-- ================================================================
--  Patch: Transfer Stok Antar Gudang
--
--  Jalankan SEKALI di Supabase SQL Editor.
--  Prasyarat: schema_production.sql sudah dijalankan.
--
--  Yang dilakukan:
--   1. Tambah kolom carrier_id, note, received_at ke transfers
--   2. Tambah kolom unit_id, qty_in_unit ke transfer_items
--   3. RLS transfers & transfer_items
--   4. RPC create_transfer  — buat transfer + potong stok gudang asal
--   5. RPC receive_transfer — tandai diterima + tambah stok gudang tujuan
-- ================================================================

-- 1. Kolom tambahan di transfers
alter table transfers
  add column if not exists carrier_id   uuid      references profiles(id),
  add column if not exists note         text,
  add column if not exists received_at  timestamptz;

-- 2. Kolom tambahan di transfer_items (untuk display surat jalan)
alter table transfer_items
  add column if not exists unit_id      bigint  references product_units(id),
  add column if not exists qty_in_unit  numeric;

-- 3. RLS
alter table transfers      enable row level security;
alter table transfer_items enable row level security;

drop policy if exists "baca_transfers"          on transfers;
drop policy if exists "admin_kelola_transfers"  on transfers;
drop policy if exists "baca_transfer_items"     on transfer_items;
drop policy if exists "admin_kelola_transfer_items" on transfer_items;

create policy "baca_transfers"
  on transfers for select to authenticated using (true);

create policy "admin_kelola_transfers"
  on transfers for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

create policy "baca_transfer_items"
  on transfer_items for select to authenticated using (true);

create policy "admin_kelola_transfer_items"
  on transfer_items for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

-- 4. create_transfer: insert transfer + items + stock_movements transfer_out
create or replace function create_transfer(
  p_from_wh    bigint,
  p_to_wh      bigint,
  p_carrier_id uuid,
  p_created_by uuid,
  p_note       text,
  p_items      jsonb   -- [{product_id, base_qty, unit_id, qty_in_unit}]
) returns bigint
language plpgsql security definer as $$
declare
  v_id   bigint;
  v_item jsonb;
begin
  if p_from_wh = p_to_wh then
    raise exception 'Gudang asal dan tujuan tidak boleh sama';
  end if;

  insert into transfers(from_wh, to_wh, carrier_id, created_by, note)
  values (p_from_wh, p_to_wh, p_carrier_id, p_created_by, p_note)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into transfer_items(transfer_id, product_id, base_qty, unit_id, qty_in_unit)
    values (
      v_id,
      (v_item->>'product_id')::bigint,
      (v_item->>'base_qty')::numeric,
      nullif(v_item->>'unit_id', '')::bigint,
      nullif(v_item->>'qty_in_unit', '')::numeric
    );

    -- Potong stok gudang asal
    insert into stock_movements(product_id, warehouse_id, base_qty, type, ref_table, ref_id, created_by)
    values (
      (v_item->>'product_id')::bigint,
      p_from_wh,
      -(v_item->>'base_qty')::numeric,
      'transfer_out',
      'transfers',
      v_id,
      p_created_by
    );
  end loop;

  return v_id;
end;
$$;

-- 5. receive_transfer: tandai diterima + tambah stok gudang tujuan
create or replace function receive_transfer(
  p_transfer_id bigint,
  p_received_by uuid
) returns void
language plpgsql security definer as $$
declare
  v_to_wh bigint;
  v_item  record;
begin
  select to_wh into v_to_wh
  from transfers
  where id = p_transfer_id and status = 'in_transit'
  for update;

  if not found then
    raise exception 'Transfer tidak ditemukan atau sudah diterima';
  end if;

  update transfers
  set status = 'received', received_at = now()
  where id = p_transfer_id;

  for v_item in select * from transfer_items where transfer_id = p_transfer_id loop
    insert into stock_movements(product_id, warehouse_id, base_qty, type, ref_table, ref_id, created_by)
    values (
      v_item.product_id,
      v_to_wh,
      v_item.base_qty,
      'transfer_in',
      'transfers',
      p_transfer_id,
      p_received_by
    );
  end loop;
end;
$$;
