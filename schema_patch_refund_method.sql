-- =============================================================
--  Patch: Tambah refund_method ke sale_returns
--  Jalankan setelah schema_retur.sql
--  Aman di-run ulang (idempotent via add column if not exists).
--
--  Kenapa:
--    Retur tunai → kas berkurang; retur nota/transfer → kas tidak berubah.
--    Tanpa kolom ini, sistem tidak bisa bedakan refund mana yang
--    harus dikurangi dari sesi kas.
-- =============================================================

alter table sale_returns
  add column if not exists refund_method text not null default 'tunai'
  check (refund_method in ('tunai', 'transfer', 'nota'));

-- Verifikasi
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'sale_returns'
  and column_name  = 'refund_method';
