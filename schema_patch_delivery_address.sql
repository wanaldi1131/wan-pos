-- ================================================================
--  Patch: Alamat pengiriman per pesanan (delivery_address)
--
--  Jalankan SEKALI di Supabase SQL Editor.
--
--  Yang dilakukan:
--   1. Tambah kolom delivery_address (text, nullable) ke tabel sales
--   2. Drop fungsi checkout_sale lama (signature 6 param)
--   3. Buat ulang checkout_sale dengan param baru p_delivery_address
-- ================================================================

-- 1. Kolom baru di sales
alter table sales add column if not exists delivery_address text;

-- 2. Drop overload lama supaya CREATE OR REPLACE bisa mengganti tanda tangan
drop function if exists checkout_sale(uuid, bigint, bigint, text, text, jsonb);

-- 3. Fungsi checkout_sale dengan delivery_address
create or replace function checkout_sale(
  p_cashier_id       uuid,
  p_customer_id      bigint,
  p_warehouse_id     bigint,
  p_fulfillment      text,
  p_pay_method       text,
  p_items            jsonb,           -- [{unit_id: bigint, qty: numeric}]
  p_delivery_address text default null
) returns jsonb
language plpgsql security definer as $$
declare
  v_sale_id      bigint;
  v_code         text;
  v_total        numeric := 0;
  v_pay_status   text;
  v_cust_cat     text;
  v_item         jsonb;
  v_unit_id      bigint;
  v_product_id   bigint;
  v_product_name text;
  v_product_unit text;
  v_qty          numeric;
  v_factor       numeric;
  v_price        numeric;
  v_price_toko   numeric;
  v_unit_price   numeric;
  v_base_qty     numeric;
  v_available    numeric;
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

  if p_customer_id is not null then
    select category::text into v_cust_cat from customers where id = p_customer_id;
  end if;
  v_cust_cat := coalesce(v_cust_cat, 'retail');

  -- Pass 1: validasi, hitung total, dan cek stok tersedia
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_unit_id := (v_item->>'unit_id')::bigint;
    v_qty     := (v_item->>'qty')::numeric;
    if v_qty <= 0 then raise exception 'qty harus lebih dari 0'; end if;

    select pu.product_id, pu.factor_to_base, pu.price, pu.price_toko,
           p.name, p.base_unit
      into v_product_id, v_factor, v_price, v_price_toko,
           v_product_name, v_product_unit
    from product_units pu
    join products p on p.id = pu.product_id
    where pu.id = v_unit_id;

    if not found then raise exception 'unit_id tidak ditemukan: %', v_unit_id; end if;

    v_unit_price := case
      when v_cust_cat = 'toko' and v_price_toko is not null then v_price_toko
      else v_price
    end;

    v_base_qty := v_qty * v_factor;
    v_total    := v_total + (v_qty * v_unit_price);

    select coalesce(base_qty, 0) - coalesce(reserved_qty, 0)
      into v_available
    from stocks
    where product_id = v_product_id and warehouse_id = p_warehouse_id;

    if coalesce(v_available, 0) < v_base_qty then
      raise exception 'Stok tidak cukup untuk "%". Tersedia: % %, dibutuhkan: % %',
        v_product_name,
        greatest(coalesce(v_available, 0), 0), v_product_unit,
        v_base_qty, v_product_unit;
    end if;
  end loop;

  v_pay_status := case
    when p_pay_method in ('tunai', 'transfer') then 'lunas' else 'belum'
  end;

  insert into sales (
    cashier_id, customer_id, warehouse_id,
    fulfillment, pay_method, pay_status,
    total, paid_at, delivery_address
  )
  values (
    p_cashier_id, p_customer_id, p_warehouse_id,
    p_fulfillment::fulfillment_type,
    p_pay_method::payment_method,
    v_pay_status::payment_status,
    v_total,
    case when p_pay_method in ('tunai', 'transfer') then now() else null end,
    p_delivery_address
  )
  returning id, code into v_sale_id, v_code;

  -- Pass 2: insert sale_items + movements
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_unit_id := (v_item->>'unit_id')::bigint;
    v_qty     := (v_item->>'qty')::numeric;

    select pu.product_id, pu.factor_to_base, pu.price, pu.price_toko
      into v_product_id, v_factor, v_price, v_price_toko
    from product_units pu
    where pu.id = v_unit_id;

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
    else
      insert into stock_movements (product_id, warehouse_id, base_qty, type, ref_table, ref_id, created_by)
      values (v_product_id, p_warehouse_id, v_base_qty, 'reserve', 'sales', v_sale_id, p_cashier_id);
    end if;
  end loop;

  return jsonb_build_object('sale_id', v_sale_id, 'code', v_code, 'total', v_total);
end;
$$;

grant execute on function checkout_sale(uuid, bigint, bigint, text, text, jsonb, text) to authenticated;
