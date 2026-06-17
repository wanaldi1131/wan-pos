-- ================================================================
--  Patch: checkout_sale + confirm_return — operasi atomik
--  Jalankan sekali di Supabase SQL Editor.
--
--  Fix yang ditutup:
--   1. Checkout tidak atomik (3 insert terpisah dari frontend)
--   2. Harga dikirim dari client — sekarang dibaca dari DB
--   3. Retur tidak atomik + tidak ada validasi server-side
-- ================================================================


-- ────────────────────────────────────────────────────────────────
--  1. checkout_sale
--
--  Satu transaksi: insert sales + sale_items + stock_movements.
--  Harga selalu dibaca dari product_units di server.
--  Harga toko dipakai jika customer.category = 'toko' dan
--  price_toko tidak null; selainnya pakai price normal.
-- ────────────────────────────────────────────────────────────────

create or replace function checkout_sale(
  p_cashier_id   uuid,
  p_customer_id  bigint,
  p_warehouse_id bigint,
  p_fulfillment  text,
  p_pay_method   text,
  p_items        jsonb   -- [{unit_id: bigint, qty: numeric}]
) returns jsonb
language plpgsql security definer as $$
declare
  v_sale_id    bigint;
  v_code       text;
  v_total      numeric := 0;
  v_pay_status text;
  v_cust_cat   text;
  v_item       jsonb;
  v_unit_id    bigint;
  v_product_id bigint;
  v_qty        numeric;
  v_factor     numeric;
  v_price      numeric;
  v_price_toko numeric;
  v_unit_price numeric;
  v_base_qty   numeric;
begin
  if p_fulfillment not in ('ambil', 'antar') then
    raise exception 'fulfillment tidak valid: %', p_fulfillment;
  end if;
  if p_pay_method not in ('tunai', 'transfer', 'cod', 'kredit') then
    raise exception 'metode bayar tidak valid: %', p_pay_method;
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang tidak boleh kosong';
  end if;

  -- Kategori customer → menentukan harga retail vs toko
  if p_customer_id is not null then
    select category::text into v_cust_cat from customers where id = p_customer_id;
  end if;
  v_cust_cat := coalesce(v_cust_cat, 'retail');

  -- Pass 1: validasi item + hitung total dari DB (bukan dari client)
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_unit_id := (v_item->>'unit_id')::bigint;
    v_qty     := (v_item->>'qty')::numeric;

    if v_qty <= 0 then
      raise exception 'qty harus lebih dari 0';
    end if;

    select price, price_toko
      into v_price, v_price_toko
    from product_units
    where id = v_unit_id;

    if not found then
      raise exception 'unit_id tidak ditemukan: %', v_unit_id;
    end if;

    v_unit_price := case
      when v_cust_cat = 'toko' and v_price_toko is not null then v_price_toko
      else v_price
    end;

    v_total := v_total + (v_qty * v_unit_price);
  end loop;

  v_pay_status := case
    when p_pay_method in ('tunai', 'transfer') then 'lunas'
    else 'belum'
  end;

  -- Insert sale (total sudah dihitung server-side)
  insert into sales (cashier_id, customer_id, warehouse_id, fulfillment, pay_method, pay_status, total)
  values (
    p_cashier_id,
    p_customer_id,
    p_warehouse_id,
    p_fulfillment::fulfillment_type,
    p_pay_method::payment_method,
    v_pay_status::payment_status,
    v_total
  )
  returning id, code into v_sale_id, v_code;

  -- Pass 2: insert sale_items + (jika ambil) potong stok
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_unit_id := (v_item->>'unit_id')::bigint;
    v_qty     := (v_item->>'qty')::numeric;

    select product_id, factor_to_base, price, price_toko
      into v_product_id, v_factor, v_price, v_price_toko
    from product_units
    where id = v_unit_id;

    v_unit_price := case
      when v_cust_cat = 'toko' and v_price_toko is not null then v_price_toko
      else v_price
    end;
    v_base_qty := v_qty * v_factor;

    insert into sale_items (sale_id, product_id, unit_id, qty, base_qty, unit_price, subtotal)
    values (v_sale_id, v_product_id, v_unit_id, v_qty, v_base_qty, v_unit_price, v_qty * v_unit_price);

    if p_fulfillment = 'ambil' then
      insert into stock_movements (product_id, warehouse_id, base_qty, type, ref_table, ref_id, created_by)
      values (v_product_id, p_warehouse_id, -v_base_qty, 'sale', 'sales', v_sale_id, p_cashier_id);
    end if;
  end loop;

  return jsonb_build_object('sale_id', v_sale_id, 'code', v_code, 'total', v_total);
end;
$$;

grant execute on function checkout_sale(uuid, bigint, bigint, text, text, jsonb) to authenticated;


-- ────────────────────────────────────────────────────────────────
--  2. confirm_return
--
--  Satu transaksi: validasi server-side (qty tidak melebihi sisa,
--  item benar-benar milik sale ini) + insert sale_returns +
--  return_items + stock_movements.
--  Harga diambil dari sale_items (harga saat dijual), bukan
--  dari product_units (harga sekarang).
-- ────────────────────────────────────────────────────────────────

create or replace function confirm_return(
  p_sale_id       bigint,
  p_cashier_id    uuid,
  p_refund_method text,
  p_note          text,
  p_items         jsonb   -- [{sale_item_id: bigint, qty: numeric}]
) returns jsonb
language plpgsql security definer as $$
declare
  v_return_id    bigint;
  v_total        numeric := 0;
  v_warehouse_id bigint;
  v_item         jsonb;
  v_sale_item_id bigint;
  v_qty          numeric;
  v_orig_qty     numeric;
  v_already      numeric;
  v_unit_price   numeric;
  v_factor       numeric;
  v_product_id   bigint;
begin
  if p_refund_method not in ('tunai', 'transfer', 'nota') then
    raise exception 'refund_method tidak valid: %', p_refund_method;
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Tidak ada item yang diretur';
  end if;

  select warehouse_id into v_warehouse_id from sales where id = p_sale_id;
  if not found then
    raise exception 'Transaksi tidak ditemukan: %', p_sale_id;
  end if;

  -- Pass 1: validasi semua item + hitung total
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sale_item_id := (v_item->>'sale_item_id')::bigint;
    v_qty          := (v_item->>'qty')::numeric;

    if v_qty <= 0 then
      raise exception 'qty retur harus lebih dari 0';
    end if;

    -- Pastikan item milik sale ini + ambil data
    select si.qty, si.unit_price, pu.factor_to_base, si.product_id
      into v_orig_qty, v_unit_price, v_factor, v_product_id
    from sale_items si
    join product_units pu on pu.id = si.unit_id
    where si.id = v_sale_item_id and si.sale_id = p_sale_id;

    if not found then
      raise exception 'Item % bukan bagian dari transaksi %', v_sale_item_id, p_sale_id;
    end if;

    -- Cek total yang sudah pernah diretur sebelumnya
    select coalesce(sum(ri.qty), 0) into v_already
    from return_items ri
    where ri.sale_item_id = v_sale_item_id;

    if v_qty > (v_orig_qty - v_already) then
      raise exception 'Qty retur (%) melebihi sisa yang bisa diretur (%) untuk item %',
        v_qty, (v_orig_qty - v_already), v_sale_item_id;
    end if;

    v_total := v_total + (v_qty * v_unit_price);
  end loop;

  -- Buat sale_return
  insert into sale_returns (sale_id, cashier_id, note, total, refund_method)
  values (p_sale_id, p_cashier_id, p_note, v_total, p_refund_method)
  returning id into v_return_id;

  -- Pass 2: insert return_items + kembalikan stok
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_sale_item_id := (v_item->>'sale_item_id')::bigint;
    v_qty          := (v_item->>'qty')::numeric;

    select si.unit_price, pu.factor_to_base, si.product_id
      into v_unit_price, v_factor, v_product_id
    from sale_items si
    join product_units pu on pu.id = si.unit_id
    where si.id = v_sale_item_id;

    insert into return_items (return_id, sale_item_id, qty, base_qty, unit_price, subtotal)
    values (v_return_id, v_sale_item_id, v_qty, v_qty * v_factor, v_unit_price, v_qty * v_unit_price);

    insert into stock_movements (product_id, warehouse_id, base_qty, type, ref_table, ref_id, created_by)
    values (v_product_id, v_warehouse_id, v_qty * v_factor, 'sale_return', 'sale_returns', v_return_id, p_cashier_id);
  end loop;

  return jsonb_build_object('return_id', v_return_id, 'total', v_total);
end;
$$;

grant execute on function confirm_return(bigint, uuid, text, text, jsonb) to authenticated;
