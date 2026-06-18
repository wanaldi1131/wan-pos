-- ================================================================
--  Backfill: reserve movements untuk antar sales yang sudah ada
--  [BAGIAN 2 dari 2 — jalankan SETELAH schema_patch_reserved_stock.sql]
--
--  Logika:
--   - Hanya sale fulfillment='antar', tidak void, belum punya reserve movement
--   - Per sale_item: reserved = base_qty - qty_yang_sudah_terkirim
--     (item yang sudah terkirim penuh → 0, tidak diinsert)
--
--  Aman untuk dijalankan ulang (kondisi "belum punya reserve"
--  memastikan tidak dobel).
--
--  Kenapa file terpisah?
--   ALTER TYPE ADD VALUE (di file pertama) harus sudah di-commit ke
--   transaksi yang berbeda sebelum nilai baru 'reserve' bisa dipakai
--   di INSERT biasa. File ini dijalankan di SQL Editor terpisah
--   sehingga file pertama sudah committed terlebih dahulu.
-- ================================================================

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
      and sm.type      = 'reserve'
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
