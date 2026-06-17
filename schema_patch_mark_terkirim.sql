-- Patch: fungsi atomik untuk tandai surat jalan terkirim + kurangi stok
-- Jalankan sekali di Supabase SQL Editor

create or replace function mark_sj_terkirim(p_sj_id bigint)
returns void
language plpgsql security definer as $$
declare
  v_sale_id        bigint;
  v_warehouse_id   bigint;
  v_current_status delivery_status;
begin
  -- Ambil status saat ini + warehouse dari sale
  select sj.sale_id, sj.status, s.warehouse_id
    into v_sale_id, v_current_status, v_warehouse_id
    from surat_jalan sj
    join sales s on s.id = sj.sale_id
   where sj.id = p_sj_id;

  if not found then
    raise exception 'Surat jalan tidak ditemukan: %', p_sj_id;
  end if;

  -- Cegah duplikasi stok keluar jika sudah terkirim
  if v_current_status = 'terkirim' then
    raise exception 'Surat jalan % sudah berstatus terkirim', p_sj_id;
  end if;

  -- Tandai terkirim
  update surat_jalan set status = 'terkirim' where id = p_sj_id;

  -- Kurangi stok gudang (negatif = keluar)
  insert into stock_movements (product_id, warehouse_id, base_qty, type, ref_table, ref_id)
  select
    si.product_id,
    v_warehouse_id,
    -sjl.base_qty,
    'sale'::movement_type,
    'surat_jalan',
    p_sj_id
  from surat_jalan_lines sjl
  join sale_items si on si.id = sjl.sale_item_id
  where sjl.surat_jalan_id = p_sj_id;
end;
$$;

-- Izinkan authenticated user memanggil fungsi ini
grant execute on function mark_sj_terkirim(bigint) to authenticated;
