-- =============================================================
--  SEED: Dummy customers — 5 retail + 5 toko
--  Jalankan setelah schema_v2_pricing.sql
-- =============================================================

insert into customers (name, phone, address, category) values
  -- Retail (pembeli perorangan)
  ('Ahmad Fauzi',       '08121100001', 'Jl. Kemanggisan No. 12, Jakarta',        'retail'),
  ('Siti Rahayu',       '08121100002', 'Jl. Anggrek Raya No. 5, Tangerang',      'retail'),
  ('Benny Wijaya',      '08121100003', 'Jl. Merpati No. 33, Jakarta Barat',      'retail'),
  ('Dewi Kusuma',       '08121100004', 'Perum Taman Sari Blok B3, Depok',        'retail'),
  ('Hendra Santoso',    '08121100005', 'Jl. Pala Raya No. 17, Bekasi',           'retail'),

  -- Toko (reseller / toko bangunan lain)
  ('Toko Maju Jaya',    '02155500001', 'Jl. Raya Pasar Minggu No. 88, Jakarta',  'toko'),
  ('UD Sumber Makmur',  '02155500002', 'Jl. Industri No. 14, Tangerang',         'toko'),
  ('Toko Besi Rejeki',  '02155500003', 'Jl. Besi Raya No. 7, Bekasi',            'toko'),
  ('CV Bangun Sejahtera','02155500004','Jl. Raya Bogor KM 22, Depok',            'toko'),
  ('Toko Material Abadi','02155500005','Jl. Fatmawati No. 101, Jakarta Selatan', 'toko')
on conflict do nothing;

-- Verifikasi
select id, name, phone, category from customers order by category, name;
