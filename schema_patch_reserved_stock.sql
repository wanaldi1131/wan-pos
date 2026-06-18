-- ================================================================
--  Patch: Reserved Stock + Partial Surat Jalan
--
--  Masalah yang ditutup:
--   1. Penjualan "antar" tidak memotong stok → overselling mungkin terjadi
--   2. Surat jalan harus mencakup semua item sekaligus
--
--  Jalankan SEKALI di Supabase SQL Editor, SETELAH:
--    - schema_patch_atomic_ops.sql
--    - schema_patch_paid_at.sql
--
--  Urutan eksekusi dalam file ini:
--   1. Enum tambahan: reserve, unreserve
--   2. Kolom reserved_qty di stocks
--   3. Recreate trigger apply_stock_movement
--   4. Recreate checkout_sale (cek available + reserve untuk antar)
--   5. Recreate mark_sj_terkirim (unreserve + sale)
--   6. Fungsi baru: create_surat_jalan (atomik, validasi sisa per item)
--   7. Backfill reserve untuk antar sales yang sudah ada
--
--  GAP yang belum ditangani (belum ada alur di app):
--   - Pembatalan order antar: belum ada RPC cancel_antar_sale.
--     Jika sale antar dibatalkan/di-void, reserved_qty TIDAK dibebaskan.
--     Perlu dibuat cancel_antar_sale(p_sale_id) yang insert unreserve movement.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
--  1. Tambah nilai enum movement_type
-- ────────────────────────────────────────────────────────────────

alter type movement_type add value if not exists 'reserve';
alter type movement_type add value if not exists 'unreserve';


-- ────────────────────────────────────────────────────────────────
--  2. Tambah kolom reserved_qty di stocks
--
--  available = base_qty - reserved_qty
--  reserved_qty naik saat order antar dibuat (tipe: reserve)
--  reserved_qty turun saat surat jalan terkirim (tipe: unreserve)
-- ────────────────────────────────────────────────────────────────

alter table stocks add column if not exists reserved_qty numeric not null default 0;


-- ────────────────────────────────────────────────────────────────
--  3. Recreate trigger apply_stock_movement
--
--  reserve / unreserve → gerakkan reserved_qty
--  semua tipe lain      → gerakkan base_qty (perilaku lama)
--
--  Konvensi tanda di kolom base_qty pada stock_movements:
--    reserve   +N → reserved_qty naik (stok dikunci)
--    unreserve −N → reserved_qty turun (kunci dilepas)
--    sale      −N → base_qty turun (stok fisik keluar)
--    sale_return +N → base_qty naik (stok fisik kembali)
-- ────────────────────────────────────────────────────────────────

create or replace function apply_stock_movement() returns trigger
language plpgsql as $$
begin
  if new.type in ('reserve', 'unreserve') then
    insert into stocks (product_id, warehouse_id, base_qty, reserved_qty)
    values (new.product_id, new.warehouse_id, 0, new.base_qty)
    on conflict (product_id, warehouse_id)
    do update set reserved_qty = stocks.reserved_qty + new.base_qty;
  else
    insert into stocks (product_id, warehouse_id, base_qty, reserved_qty)
    values (new.product_id, new.warehouse_id, new.base_qty, 0)
    on conflict (product_id, warehouse_id)
    do update set base_qty = stocks.base_qty + new.base_qty;
  end if;
  return new;
end;
$$;


-- ────────────────────────────────────────────────────────────────
--  4. Recreate checkout_sale
--
--  Perubahan dari versi sebelumnya:
--   Pass 1 diperluas: baca product_id + factor di sini, cek available
--   Pass 2: ambil → movement sale (sama), antar → movement reserve (baru)
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
  -- Semua cek dilakukan sebelum tulis apapun ke DB.
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

    -- Cek stok: available = base_qty - reserved_qty
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

  insert into sales (cashier_id, customer_id, warehouse_id, fulfillment, pay_method, pay_status, total, paid_at)
  values (
    p_cashier_id, p_customer_id, p_warehouse_id,
    p_fulfillment::fulfillment_type,
    p_pay_method::payment_method,
    v_pay_status::payment_status,
    v_total,
    case when p_pay_method in ('tunai', 'transfer') then now() else null end
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
      -- Ambil: potong stok langsung
      insert into stock_movements (product_id, warehouse_id, base_qty, type, ref_table, ref_id, created_by)
      values (v_product_id, p_warehouse_id, -v_base_qty, 'sale', 'sales', v_sale_id, p_cashier_id);
    else
      -- Antar: kunci stok (reserved_qty naik, base_qty belum berubah)
      -- Stok baru dipotong saat surat jalan ditandai terkirim
      insert into stock_movements (product_id, warehouse_id, base_qty, type, ref_table, ref_id, created_by)
      values (v_product_id, p_warehouse_id, v_base_qty, 'reserve', 'sales', v_sale_id, p_cashier_id);
    end if;
  end loop;

  return jsonb_build_object('sale_id', v_sale_id, 'code', v_code, 'total', v_total);
end;
$$;

grant execute on function checkout_sale(uuid, bigint, bigint, text, text, jsonb) to authenticated;


-- ────────────────────────────────────────────────────────────────
--  5. Recreate mark_sj_terkirim
--
--  Saat terkirim: insert unreserve (reserved turun) DAN sale (base turun)
--  Hanya untuk qty di surat jalan INI → partial SJ otomatis benar.
--  Guard anti-duplikasi dipertahankan.
-- ────────────────────────────────────────────────────────────────

create or replace function mark_sj_terkirim(p_sj_id bigint)
returns void
language plpgsql security definer as $$
declare
  v_sale_id        bigint;
  v_warehouse_id   bigint;
  v_current_status delivery_status;
begin
  select sj.sale_id, sj.status, s.warehouse_id
    into v_sale_id, v_current_status, v_warehouse_id
    from surat_jalan sj
    join sales s on s.id = sj.sale_id
   where sj.id = p_sj_id;

  if not found then
    raise exception 'Surat jalan tidak ditemukan: %', p_sj_id;
  end if;

  if v_current_status = 'terkirim' then
    raise exception 'Surat jalan % sudah berstatus terkirim', p_sj_id;
  end if;

  update surat_jalan set status = 'terkirim' where id = p_sj_id;

  -- Unreserve: lepaskan reserved_qty (negatif = reserved turun)
  insert into stock_movements (product_id, warehouse_id, base_qty, type, ref_table, ref_id)
  select
    si.product_id,
    v_warehouse_id,
    -sjl.base_qty,
    'unreserve'::movement_type,
    'surat_jalan',
    p_sj_id
  from surat_jalan_lines sjl
  join sale_items si on si.id = sjl.sale_item_id
  where sjl.surat_jalan_id = p_sj_id;

  -- Sale: potong base_qty (stok fisik keluar)
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

grant execute on function mark_sj_terkirim(bigint) to authenticated;


-- ────────────────────────────────────────────────────────────────
--  6. Fungsi baru: create_surat_jalan
--
--  Validasi server-side:
--   - Sale harus fulfillment='antar' dan tidak void
--   - Setiap item harus milik sale ini
--   - Total qty yang diminta tidak boleh melebihi sisa belum masuk SJ
--     (semua SJ, semua status dihitung)
--
--  Insert atomik: surat_jalan + surat_jalan_lines dalam satu transaksi.
--
--  p_items: [{sale_item_id: bigint, base_qty: numeric}]
--  base_qty dalam satuan dasar (sama dengan surat_jalan_lines.base_qty)
-- ────────────────────────────────────────────────────────────────

create or replace function create_surat_jalan(
  p_sale_id    bigint,
  p_driver_id  bigint,
  p_plat       text,
  p_created_by uuid,
  p_items      jsonb
) returns jsonb
language plpgsql security definer as $$
declare
  v_sj_id          bigint;
  v_code           text;
  v_fulfillment    text;
  v_item           jsonb;
  v_si_id          bigint;
  v_req_base_qty   numeric;
  v_orig_base_qty  numeric;
  v_dispatched_qty numeric;
  v_remaining      numeric;
  v_product_name   text;
begin
  select fulfillment::text into v_fulfillment
  from sales where id = p_sale_id and voided = false;

  if not found then
    raise exception 'Transaksi tidak ditemukan: %', p_sale_id;
  end if;
  if v_fulfillment <> 'antar' then
    raise exception 'Surat jalan hanya untuk penjualan antar';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Pilih minimal satu item untuk surat jalan';
  end if;

  -- Validasi per item
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_si_id        := (v_item->>'sale_item_id')::bigint;
    v_req_base_qty := (v_item->>'base_qty')::numeric;

    if v_req_base_qty <= 0 then
      raise exception 'qty harus lebih dari 0';
    end if;

    select si.base_qty, p.name
      into v_orig_base_qty, v_product_name
    from sale_items si
    join products p on p.id = si.product_id
    where si.id = v_si_id and si.sale_id = p_sale_id;

    if not found then
      raise exception 'Item % bukan bagian dari transaksi %', v_si_id, p_sale_id;
    end if;

    -- Hitung total yang sudah masuk ke SJ manapun (semua status termasuk dimuat)
    select coalesce(sum(sjl.base_qty), 0)
      into v_dispatched_qty
    from surat_jalan_lines sjl
    where sjl.sale_item_id = v_si_id;

    v_remaining := v_orig_base_qty - v_dispatched_qty;

    if v_req_base_qty > v_remaining then
      raise exception 'Item "%" kelebihan qty. Sisa belum masuk SJ: %, diminta: %',
        v_product_name, v_remaining, v_req_base_qty;
    end if;
  end loop;

  -- Insert surat jalan
  insert into surat_jalan (sale_id, driver_id, plat, status, created_by)
  values (p_sale_id, p_driver_id, p_plat, 'dimuat', p_created_by)
  returning id, code into v_sj_id, v_code;

  -- Insert lines
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_si_id        := (v_item->>'sale_item_id')::bigint;
    v_req_base_qty := (v_item->>'base_qty')::numeric;

    insert into surat_jalan_lines (surat_jalan_id, sale_item_id, base_qty)
    values (v_sj_id, v_si_id, v_req_base_qty);
  end loop;

  return jsonb_build_object('sj_id', v_sj_id, 'code', v_code);
end;
$$;

grant execute on function create_surat_jalan(bigint, bigint, text, uuid, jsonb) to authenticated;


-- ────────────────────────────────────────────────────────────────
--  7. Backfill: reserve movements untuk antar sales yang sudah ada
--
--  Logika:
--   - Hanya sale fulfillment='antar', tidak void, belum punya reserve movement
--   - Per sale_item: reserved = base_qty - qty_yang_sudah_terkirim
--     (item yang sudah terkirim penuh → 0, tidak diinsert)
--
--  Jalankan sekali. Aman untuk dijalankan ulang (kondisi "belum punya reserve"
--  memastikan tidak dobel).
--
--  CATATAN TEKNIS: dibungkus DO $$ karena PostgreSQL melarang penggunaan
--  nilai enum baru ('reserve') dalam SQL statement biasa pada transaksi
--  yang sama tempat ALTER TYPE dijalankan. PL/pgSQL dikompile lazy
--  (saat dipanggil, bukan saat di-parse) sehingga lolos pembatasan ini.
--  Perbandingan sm.type::text = 'reserve' dipakai di WHERE untuk alasan
--  yang sama.
-- ────────────────────────────────────────────────────────────────

do $$
begin
  insert into stock_movements (product_id, warehouse_id, base_qty, type, ref_table, ref_id, note)
  select
    si.product_id,
    s.warehouse_id,
    si.base_qty
      - coalesce(
          (select sum(sjl.base_qty)
           from surat_jalan_lines sjl
           join surat_jalan sj on sj.id = sjl.surat_jalan_id
           where sjl.sale_item_id = si.id
             and sj.status = 'terkirim'),
          0
        ),
    'reserve'::movement_type,
    'sales',
    s.id,
    'backfill: reserved-stock patch'
  from sales s
  join sale_items si on si.sale_id = s.id
  where s.fulfillment = 'antar'
    and s.voided = false
    and not exists (
      select 1 from stock_movements sm
      where sm.ref_table = 'sales'
        and sm.ref_id    = s.id
        and sm.type::text = 'reserve'   -- cast ke text: hindari enum-in-same-txn error
    )
    and (
      si.base_qty
      - coalesce(
          (select sum(sjl.base_qty)
           from surat_jalan_lines sjl
           join surat_jalan sj on sj.id = sjl.surat_jalan_id
           where sjl.sale_item_id = si.id
             and sj.status = 'terkirim'),
          0
        )
    ) > 0;
end;
$$;
