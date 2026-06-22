-- ================================================================
--  Patch: Invoice Pembelian (dari Supplier)
--
--  Jalankan SEKALI di Supabase SQL Editor.
--  Prasyarat: schema_patch_goods_receipt.sql sudah dijalankan.
--
--  Yang dilakukan:
--   1. Tabel purchase_invoices (header PI, kode otomatis PI-XXXXX)
--   2. Tabel purchase_invoice_items (detail per barang + harga)
--   3. RLS: admin/owner full CRUD, kasir read-only
--   4. RPC save_purchase_invoice — atomik: insert PI + items
-- ================================================================

-- 1. Sequence + header PI
create sequence if not exists pi_no_seq;

create table if not exists purchase_invoices (
  id                bigserial    primary key,
  no_pi             bigint       not null default nextval('pi_no_seq'),
  code              text         generated always as ('PI-' || lpad(no_pi::text, 5, '0')) stored,
  supplier_id       bigint       not null references suppliers(id),
  goods_receipt_id  bigint       references goods_receipts(id),
  invoice_date      date         not null default current_date,
  due_date          date,
  note              text,
  subtotal          numeric      not null default 0,
  discount_amount   numeric      not null default 0,
  total             numeric      not null default 0,
  created_by        uuid         references profiles(id),
  created_at        timestamptz  not null default now()
);

-- 2. Detail items
create table if not exists purchase_invoice_items (
  id                    bigserial  primary key,
  purchase_invoice_id   bigint     not null references purchase_invoices(id) on delete cascade,
  product_id            bigint     not null references products(id),
  unit_id               bigint     not null references product_units(id),
  qty                   numeric    not null check (qty > 0),
  unit_price            numeric    not null default 0,
  discount_str          text,
  discount_type         text       not null default 'percent' check (discount_type in ('percent', 'amount')),
  discount_amount       numeric    not null default 0,
  subtotal              numeric    not null default 0,
  total                 numeric    not null default 0
);

-- 3. RLS
alter table purchase_invoices      enable row level security;
alter table purchase_invoice_items enable row level security;

drop policy if exists "baca_purchase_invoices"         on purchase_invoices;
drop policy if exists "admin_kelola_purchase_invoices" on purchase_invoices;
drop policy if exists "baca_pi_items"                  on purchase_invoice_items;
drop policy if exists "admin_kelola_pi_items"          on purchase_invoice_items;

create policy "baca_purchase_invoices"
  on purchase_invoices for select to authenticated
  using (get_current_role() in ('admin', 'owner', 'kasir'));

create policy "admin_kelola_purchase_invoices"
  on purchase_invoices for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

create policy "baca_pi_items"
  on purchase_invoice_items for select to authenticated
  using (get_current_role() in ('admin', 'owner', 'kasir'));

create policy "admin_kelola_pi_items"
  on purchase_invoice_items for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

-- 4. RPC atomik
create or replace function save_purchase_invoice(
  p_supplier_id       bigint,
  p_goods_receipt_id  bigint,
  p_invoice_date      date,
  p_due_date          date,
  p_note              text,
  p_created_by        uuid,
  p_items             jsonb   -- [{product_id, unit_id, qty, unit_price, discount_str, discount_type, discount_amount, subtotal, total}]
) returns jsonb
language plpgsql security definer as $$
declare
  v_pi_id        bigint;
  v_code         text;
  v_item         jsonb;
  v_sub_sum      numeric := 0;
  v_disc_sum     numeric := 0;
  v_total_sum    numeric := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Minimal 1 barang harus diisi';
  end if;

  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'Supplier tidak ditemukan';
  end if;

  insert into purchase_invoices (
    supplier_id, goods_receipt_id, invoice_date, due_date, note, created_by,
    subtotal, discount_amount, total
  ) values (
    p_supplier_id,
    p_goods_receipt_id,
    p_invoice_date,
    p_due_date,
    nullif(trim(coalesce(p_note, '')), ''),
    p_created_by,
    0, 0, 0
  )
  returning id, code into v_pi_id, v_code;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    declare
      v_sub   numeric := (v_item->>'subtotal')::numeric;
      v_disc  numeric := (v_item->>'discount_amount')::numeric;
      v_tot   numeric := (v_item->>'total')::numeric;
    begin
      insert into purchase_invoice_items (
        purchase_invoice_id, product_id, unit_id, qty,
        unit_price, discount_str, discount_type, discount_amount,
        subtotal, total
      ) values (
        v_pi_id,
        (v_item->>'product_id')::bigint,
        (v_item->>'unit_id')::bigint,
        (v_item->>'qty')::numeric,
        (v_item->>'unit_price')::numeric,
        nullif(trim(coalesce(v_item->>'discount_str', '')), ''),
        coalesce(v_item->>'discount_type', 'percent'),
        v_disc, v_sub, v_tot
      );
      v_sub_sum   := v_sub_sum   + v_sub;
      v_disc_sum  := v_disc_sum  + v_disc;
      v_total_sum := v_total_sum + v_tot;
    end;
  end loop;

  update purchase_invoices
  set subtotal = v_sub_sum, discount_amount = v_disc_sum, total = v_total_sum
  where id = v_pi_id;

  return jsonb_build_object('id', v_pi_id, 'code', v_code);
end;
$$;

grant execute on function save_purchase_invoice(bigint, bigint, date, date, text, uuid, jsonb) to authenticated;
