-- =============================================================
--  Migration: Kas Harian (Sesi Kasir)
--  Jalankan setelah schema_production.sql + schema_retur.sql
--  Aman di-run ulang (idempotent).
--
--  Fitur:
--    - Kasir buka/tutup sesi dengan saldo awal & akhir
--    - Catat pengeluaran kas (non-penjualan) selama sesi
--    - Summary otomatis: tunai masuk, transfer, pengeluaran, selisih
-- =============================================================


-- ── Tabel sesi kas ─────────────────────────────────────────────
create table if not exists cash_sessions (
  id               bigserial    primary key,
  cashier_id       uuid         not null references profiles(id),
  warehouse_id     int          not null default 1 references warehouses(id),
  opened_at        timestamptz  not null default now(),
  closed_at        timestamptz,
  opening_balance  numeric      not null default 0,
  closing_balance  numeric,                          -- null sampai sesi ditutup
  notes            text,
  status           text         not null default 'open'
                   check (status in ('open', 'closed'))
);

-- ── Tabel pengeluaran kas ────────────────────────────────────────
-- Kas keluar yang bukan dari retur penjualan (beli alat, makan, dll)
create table if not exists cash_out (
  id           bigserial    primary key,
  session_id   bigint       not null references cash_sessions(id) on delete cascade,
  cashier_id   uuid         not null references profiles(id),
  amount       numeric      not null check (amount > 0),
  description  text         not null,
  created_at   timestamptz  not null default now()
);

-- ── Index ───────────────────────────────────────────────────────
create index if not exists idx_cash_sessions_cashier on cash_sessions(cashier_id, status);
create index if not exists idx_cash_out_session      on cash_out(session_id);

-- ── RLS ─────────────────────────────────────────────────────────
alter table cash_sessions enable row level security;
alter table cash_out       enable row level security;

drop policy if exists "lihat_sesi_kas"   on cash_sessions;
drop policy if exists "buka_sesi_kas"    on cash_sessions;
drop policy if exists "tutup_sesi_kas"   on cash_sessions;
drop policy if exists "lihat_kas_keluar" on cash_out;
drop policy if exists "catat_kas_keluar" on cash_out;

-- Kasir lihat sesi milik sendiri; admin/owner lihat semua
create policy "lihat_sesi_kas" on cash_sessions
  for select using (
    get_current_role() in ('admin', 'owner')
    or cashier_id = auth.uid()
  );

create policy "buka_sesi_kas" on cash_sessions
  for insert with check (
    get_current_role() in ('kasir', 'admin', 'owner')
    and cashier_id = auth.uid()
  );

-- Update hanya untuk tutup sesi sendiri
create policy "tutup_sesi_kas" on cash_sessions
  for update using (
    (get_current_role() in ('kasir', 'admin', 'owner'))
    and cashier_id = auth.uid()
  ) with check (
    (get_current_role() in ('kasir', 'admin', 'owner'))
    and cashier_id = auth.uid()
  );

create policy "lihat_kas_keluar" on cash_out
  for select using (
    get_current_role() in ('admin', 'owner')
    or cashier_id = auth.uid()
  );

create policy "catat_kas_keluar" on cash_out
  for insert with check (
    get_current_role() in ('kasir', 'admin', 'owner')
    and cashier_id = auth.uid()
  );

-- Grant untuk role authenticated
grant select, insert, update on cash_sessions to authenticated;
grant select, insert         on cash_out       to authenticated;
grant usage, select on sequence cash_sessions_id_seq to authenticated;
grant usage, select on sequence cash_out_id_seq      to authenticated;


-- ── Verifikasi ────────────────────────────────────────────────────
select
  table_name,
  (select count(*) from information_schema.columns c2
   where c2.table_name = t.table_name and c2.table_schema = 'public') as kolom
from information_schema.tables t
where table_schema = 'public'
  and table_name in ('cash_sessions', 'cash_out')
order by table_name;
