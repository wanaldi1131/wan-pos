-- ================================================================
--  Patch: Tracking Pembayaran Invoice Supplier
--
--  Jalankan SEKALI di Supabase SQL Editor.
--  Prasyarat: schema_patch_purchase_invoice.sql sudah dijalankan.
--
--  Yang dilakukan:
--   1. Kolom paid_at di purchase_invoices (NULL = belum/sebagian lunas)
--   2. Tabel purchase_invoice_payments (riwayat bayar per invoice)
--   3. RLS untuk purchase_invoice_payments
--   4. RPC record_pi_payment — atomik: insert pembayaran + auto paid_at
-- ================================================================

-- 1. Tambah paid_at ke invoice header
alter table purchase_invoices
  add column if not exists paid_at timestamptz;

-- 2. Tabel pembayaran
create table if not exists purchase_invoice_payments (
  id                    bigserial    primary key,
  purchase_invoice_id   bigint       not null references purchase_invoices(id) on delete cascade,
  amount                numeric      not null check (amount > 0),
  paid_at               timestamptz  not null default now(),
  pay_method            text         not null default 'transfer'
                          check (pay_method in ('tunai', 'transfer')),
  note                  text,
  created_by            uuid         references profiles(id),
  created_at            timestamptz  not null default now()
);

-- 3. RLS
alter table purchase_invoice_payments enable row level security;

drop policy if exists "baca_pi_payments"         on purchase_invoice_payments;
drop policy if exists "admin_kelola_pi_payments"  on purchase_invoice_payments;

create policy "baca_pi_payments"
  on purchase_invoice_payments for select to authenticated
  using (get_current_role() in ('admin', 'owner', 'kasir'));

create policy "admin_kelola_pi_payments"
  on purchase_invoice_payments for all to authenticated
  using    (get_current_role() in ('admin', 'owner'))
  with check (get_current_role() in ('admin', 'owner'));

-- 4. RPC: catat pembayaran, auto-tandai lunas jika sudah penuh
create or replace function record_pi_payment(
  p_invoice_id  bigint,
  p_amount      numeric,
  p_pay_method  text,
  p_note        text,
  p_created_by  uuid
) returns jsonb
language plpgsql security definer as $$
declare
  v_total     numeric;
  v_paid_sum  numeric;
  v_remaining numeric;
begin
  select total into v_total from purchase_invoices where id = p_invoice_id;
  if not found then raise exception 'Invoice tidak ditemukan'; end if;

  insert into purchase_invoice_payments
    (purchase_invoice_id, amount, pay_method, note, created_by)
  values
    (p_invoice_id, p_amount, p_pay_method,
     nullif(trim(coalesce(p_note, '')), ''), p_created_by);

  select coalesce(sum(amount), 0) into v_paid_sum
  from purchase_invoice_payments where purchase_invoice_id = p_invoice_id;

  v_remaining := v_total - v_paid_sum;

  if v_remaining <= 0 then
    update purchase_invoices set paid_at = now() where id = p_invoice_id;
  end if;

  return jsonb_build_object(
    'total_paid', v_paid_sum,
    'remaining',  greatest(0, v_remaining),
    'is_paid',    v_remaining <= 0
  );
end;
$$;

grant execute on function record_pi_payment(bigint, numeric, text, text, uuid) to authenticated;
