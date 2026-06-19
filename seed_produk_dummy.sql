-- ================================================================
--  Seed: 100 Produk Dummy — Toko Bangunan Adi Jaya
--  Jalankan sekali di Supabase SQL Editor.
--  Aman dijalankan ulang: mengecek nama produk dulu (ON CONFLICT DO NOTHING).
-- ================================================================

do $$
declare pid bigint;
begin

-- ────────────────────────────────────────────────────────────────
--  SEMEN & PASIR (10 produk)
-- ────────────────────────────────────────────────────────────────

insert into products (name, base_unit, sku, category, active) values ('Semen Tiga Roda 50kg', 'sak', 'SMN-001', 'Semen & Pasir', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'sak',  1,  87000, 80000, true),
  (pid, 'zak kecil (25kg)', 0.5, 45000, 41000, false);

insert into products (name, base_unit, sku, category, active) values ('Semen Gresik 50kg', 'sak', 'SMN-002', 'Semen & Pasir', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'sak',  1,  89000, 82000, true);

insert into products (name, base_unit, sku, category, active) values ('Semen Putih Cisangkan 40kg', 'sak', 'SMN-003', 'Semen & Pasir', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'sak',  1,  120000, 112000, true);

insert into products (name, base_unit, sku, category, active) values ('Pasir Beton', 'kubik', 'PSR-001', 'Semen & Pasir', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kubik', 1, 350000, 320000, true),
  (pid, 'truk',  5, 1650000, 1500000, false);

insert into products (name, base_unit, sku, category, active) values ('Pasir Halus / Pasir Pasang', 'kubik', 'PSR-002', 'Semen & Pasir', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kubik', 1, 280000, 255000, true),
  (pid, 'truk',  5, 1300000, 1200000, false);

insert into products (name, base_unit, sku, category, active) values ('Kerikil / Split 1-2 cm', 'kubik', 'PSR-003', 'Semen & Pasir', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kubik', 1, 320000, 295000, true);

insert into products (name, base_unit, sku, category, active) values ('Bata Merah', 'biji', 'BTA-001', 'Semen & Pasir', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',    1,    800,   700, false),
  (pid, 'ribu',    1000, 750000, 680000, true);

insert into products (name, base_unit, sku, category, active) values ('Batako Pres 10x20x40', 'biji', 'BTA-002', 'Semen & Pasir', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,    4500, 4000, false),
  (pid, 'ribu',  1000, 4200000, 3800000, true);

insert into products (name, base_unit, sku, category, active) values ('Hebel / Bata Ringan 10x20x60', 'biji', 'BTA-003', 'Semen & Pasir', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',   1,   8500, 7800, true);

insert into products (name, base_unit, sku, category, active) values ('Mortar Instan MU-380', 'sak', 'MRT-001', 'Semen & Pasir', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'sak', 1, 115000, 105000, true);


-- ────────────────────────────────────────────────────────────────
--  BESI & BAJA (10 produk)
-- ────────────────────────────────────────────────────────────────

insert into products (name, base_unit, sku, category, active) values ('Besi Beton Polos 8mm (12m)', 'lonjor', 'BSI-001', 'Besi & Baja', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,   48000, 44000, true),
  (pid, 'kodi',   20, 920000, 840000, false);

insert into products (name, base_unit, sku, category, active) values ('Besi Beton Polos 10mm (12m)', 'lonjor', 'BSI-002', 'Besi & Baja', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,   72000, 66000, true),
  (pid, 'kodi',   20, 1380000, 1260000, false);

insert into products (name, base_unit, sku, category, active) values ('Besi Beton Ulir 12mm (12m)', 'lonjor', 'BSI-003', 'Besi & Baja', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,   105000, 97000, true);

insert into products (name, base_unit, sku, category, active) values ('Besi Beton Ulir 16mm (12m)', 'lonjor', 'BSI-004', 'Besi & Baja', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,   185000, 172000, true);

insert into products (name, base_unit, sku, category, active) values ('Wiremesh M5 (2.1x5.4m)', 'lembar', 'WRM-001', 'Besi & Baja', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1, 165000, 152000, true);

insert into products (name, base_unit, sku, category, active) values ('Wiremesh M6 (2.1x5.4m)', 'lembar', 'WRM-002', 'Besi & Baja', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1, 230000, 213000, true);

insert into products (name, base_unit, sku, category, active) values ('Hollow Besi 40x40x1.2mm (6m)', 'lonjor', 'HLW-001', 'Besi & Baja', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1, 95000, 87000, true);

insert into products (name, base_unit, sku, category, active) values ('Hollow Besi 40x80x1.5mm (6m)', 'lonjor', 'HLW-002', 'Besi & Baja', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1, 135000, 124000, true);

insert into products (name, base_unit, sku, category, active) values ('Besi Siku 40x40x3mm (6m)', 'lonjor', 'SKU-001', 'Besi & Baja', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1, 115000, 106000, true);

insert into products (name, base_unit, sku, category, active) values ('Paku Beton / Paku Usuk', 'kg', 'PKU-001', 'Besi & Baja', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kg',   1,   28000, 25000, true),
  (pid, 'dos (5kg)', 5, 130000, 120000, false);


-- ────────────────────────────────────────────────────────────────
--  CAT (10 produk)
-- ────────────────────────────────────────────────────────────────

insert into products (name, base_unit, sku, category, active) values ('Cat Tembok Avitex 25kg', 'kaleng', 'CAT-001', 'Cat', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kaleng', 1, 320000, 295000, true);

insert into products (name, base_unit, sku, category, active) values ('Cat Tembok Dulux Catylac 25kg', 'kaleng', 'CAT-002', 'Cat', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kaleng', 1, 485000, 450000, true);

insert into products (name, base_unit, sku, category, active) values ('Cat Dasar Menie Besi 1kg', 'kaleng', 'CAT-003', 'Cat', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kaleng', 1,  45000, 40000, true);

insert into products (name, base_unit, sku, category, active) values ('Cat Besi Glotok 1kg', 'kaleng', 'CAT-004', 'Cat', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kaleng', 1,  52000, 47000, true);

insert into products (name, base_unit, sku, category, active) values ('Thinner A Special 1 Liter', 'liter', 'THN-001', 'Cat', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'liter',  1,   18000, 16000, true),
  (pid, 'jerigen (5L)', 5, 82000, 75000, false);

insert into products (name, base_unit, sku, category, active) values ('Kuas Cat 3 inch', 'biji', 'KUS-001', 'Cat', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,   12000, null, true),
  (pid, 'lusin', 12, 130000, null, false);

insert into products (name, base_unit, sku, category, active) values ('Roller Cat 20cm', 'biji', 'RLR-001', 'Cat', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,   35000, null, true);

insert into products (name, base_unit, sku, category, active) values ('Waterproofing Aquaproof 4kg', 'kaleng', 'WPF-001', 'Cat', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kaleng', 1, 155000, 142000, true);

insert into products (name, base_unit, sku, category, active) values ('Cat Kayu No Drop 1kg', 'kaleng', 'CAT-005', 'Cat', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kaleng', 1,  65000, 59000, true);

insert into products (name, base_unit, sku, category, active) values ('Plamir Tembok 1kg', 'kaleng', 'PLM-001', 'Cat', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kaleng', 1,  22000, 19000, true);


-- ────────────────────────────────────────────────────────────────
--  PIPA & SANITASI (10 produk)
-- ────────────────────────────────────────────────────────────────

insert into products (name, base_unit, sku, category, active) values ('Pipa PVC AW 1/2" (4m)', 'lonjor', 'PPA-001', 'Pipa & Sanitasi', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,  22000, 20000, true);

insert into products (name, base_unit, sku, category, active) values ('Pipa PVC AW 3/4" (4m)', 'lonjor', 'PPA-002', 'Pipa & Sanitasi', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,  32000, 29000, true);

insert into products (name, base_unit, sku, category, active) values ('Pipa PVC AW 1" (4m)', 'lonjor', 'PPA-003', 'Pipa & Sanitasi', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,  48000, 44000, true);

insert into products (name, base_unit, sku, category, active) values ('Pipa PVC AW 2" (4m)', 'lonjor', 'PPA-004', 'Pipa & Sanitasi', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,  85000, 78000, true);

insert into products (name, base_unit, sku, category, active) values ('Pipa PVC AW 4" (4m)', 'lonjor', 'PPA-005', 'Pipa & Sanitasi', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1, 155000, 143000, true);

insert into products (name, base_unit, sku, category, active) values ('Kloset Duduk American Standard', 'unit', 'KLD-001', 'Pipa & Sanitasi', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'unit', 1, 1850000, 1700000, true);

insert into products (name, base_unit, sku, category, active) values ('Kloset Jongkok Ina Biscuit', 'unit', 'KLJ-001', 'Pipa & Sanitasi', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'unit', 1, 235000, 215000, true);

insert into products (name, base_unit, sku, category, active) values ('Wastafel Polos TOTO', 'unit', 'WSF-001', 'Pipa & Sanitasi', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'unit', 1, 420000, 385000, true);

insert into products (name, base_unit, sku, category, active) values ('Shower Set Campur Panas-Dingin', 'set', 'SHW-001', 'Pipa & Sanitasi', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'set', 1, 285000, 260000, true);

insert into products (name, base_unit, sku, category, active) values ('Kran Air Putar 1/2"', 'biji', 'KRN-001', 'Pipa & Sanitasi', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,   35000, 31000, true),
  (pid, 'lusin', 12, 385000, 348000, false);


-- ────────────────────────────────────────────────────────────────
--  KERAMIK & GRANIT (10 produk)
-- ────────────────────────────────────────────────────────────────

insert into products (name, base_unit, sku, category, active) values ('Keramik Lantai 30x30 Putih Polos', 'dus', 'KRM-001', 'Keramik & Granit', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'dus',  1,   62000, 56000, true);

insert into products (name, base_unit, sku, category, active) values ('Keramik Lantai 40x40 Motif Batu', 'dus', 'KRM-002', 'Keramik & Granit', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'dus',  1,   98000, 90000, true);

insert into products (name, base_unit, sku, category, active) values ('Granit Lantai 60x60 Putih Glossy', 'dus', 'GRN-001', 'Keramik & Granit', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'dus',  1,  185000, 170000, true);

insert into products (name, base_unit, sku, category, active) values ('Granit Lantai 60x60 Dark Grey Matt', 'dus', 'GRN-002', 'Keramik & Granit', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'dus',  1,  210000, 193000, true);

insert into products (name, base_unit, sku, category, active) values ('Granit 80x80 Polished White', 'dus', 'GRN-003', 'Keramik & Granit', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'dus',  1,  265000, 245000, true);

insert into products (name, base_unit, sku, category, active) values ('Keramik Dinding 20x40 Putih Polos', 'dus', 'KRM-003', 'Keramik & Granit', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'dus',  1,   72000, 65000, true);

insert into products (name, base_unit, sku, category, active) values ('Nat Keramik Putih AM 100', 'sak', 'NAT-001', 'Keramik & Granit', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'sak',  1,   18000, 16000, true),
  (pid, 'karton (12 sak)', 12, 200000, 185000, false);

insert into products (name, base_unit, sku, category, active) values ('Tile Adhesive / Semen Keramik AM 30', 'sak', 'TLA-001', 'Keramik & Granit', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'sak',  1,   55000, 50000, true);

insert into products (name, base_unit, sku, category, active) values ('Keramik Tangga Anti-Slip 30x30', 'dus', 'KRM-004', 'Keramik & Granit', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'dus',  1,   95000, 87000, true);

insert into products (name, base_unit, sku, category, active) values ('Keramik Outdoor 40x40 Kasar', 'dus', 'KRM-005', 'Keramik & Granit', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'dus',  1,  105000, 96000, true);


-- ────────────────────────────────────────────────────────────────
--  KAYU & TRIPLEK (10 produk)
-- ────────────────────────────────────────────────────────────────

insert into products (name, base_unit, sku, category, active) values ('Triplek 9mm 122x244cm', 'lembar', 'TRP-001', 'Kayu & Triplek', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1, 145000, 133000, true);

insert into products (name, base_unit, sku, category, active) values ('Triplek 12mm 122x244cm', 'lembar', 'TRP-002', 'Kayu & Triplek', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1, 185000, 170000, true);

insert into products (name, base_unit, sku, category, active) values ('Triplek 15mm 122x244cm', 'lembar', 'TRP-003', 'Kayu & Triplek', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1, 225000, 208000, true);

insert into products (name, base_unit, sku, category, active) values ('Triplek 18mm 122x244cm', 'lembar', 'TRP-004', 'Kayu & Triplek', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1, 270000, 250000, true);

insert into products (name, base_unit, sku, category, active) values ('Kayu Meranti 5x10cm (4m)', 'lonjor', 'KYU-001', 'Kayu & Triplek', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,  85000, 78000, true);

insert into products (name, base_unit, sku, category, active) values ('Kayu Meranti 6x12cm (4m)', 'lonjor', 'KYU-002', 'Kayu & Triplek', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1, 128000, 118000, true);

insert into products (name, base_unit, sku, category, active) values ('Kayu Kaso 5x7cm (4m)', 'lonjor', 'KYU-003', 'Kayu & Triplek', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,  42000, 38000, true),
  (pid, 'kodi',  20, 800000, 730000, false);

insert into products (name, base_unit, sku, category, active) values ('Kayu Reng 2x3cm (4m)', 'lonjor', 'KYU-004', 'Kayu & Triplek', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,  12000, 10500, true),
  (pid, 'kodi',  20, 220000, 195000, false);

insert into products (name, base_unit, sku, category, active) values ('GRC Board 9mm 120x240cm', 'lembar', 'GRC-001', 'Kayu & Triplek', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1, 115000, 105000, true);

insert into products (name, base_unit, sku, category, active) values ('Papan Cor / Multiplek 12mm', 'lembar', 'MLP-001', 'Kayu & Triplek', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1, 210000, 193000, true);


-- ────────────────────────────────────────────────────────────────
--  ATAP (10 produk)
-- ────────────────────────────────────────────────────────────────

insert into products (name, base_unit, sku, category, active) values ('Genteng Metal Pasir Sakura', 'lembar', 'ATP-001', 'Atap', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1,  38000, 34000, true);

insert into products (name, base_unit, sku, category, active) values ('Genteng Beton Cisangkan', 'biji', 'ATP-002', 'Atap', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',   1,   5500,  5000, false),
  (pid, 'kodi',   20, 100000, 90000, true);

insert into products (name, base_unit, sku, category, active) values ('Seng BJLS 0.30 (0.9x1.8m)', 'lembar', 'SNG-001', 'Atap', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1,  32000, 29000, true);

insert into products (name, base_unit, sku, category, active) values ('Seng Gelombang 0.20mm (0.9x1.8m)', 'lembar', 'SNG-002', 'Atap', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lembar', 1,  25000, 22500, true);

insert into products (name, base_unit, sku, category, active) values ('Spandek Warna 0.30mm (per meter)', 'meter', 'SPD-001', 'Atap', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'meter', 1,  52000, 47000, true);

insert into products (name, base_unit, sku, category, active) values ('Bubungan Genteng Metal (0.9m)', 'lonjor', 'BBN-001', 'Atap', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,  28000, 25000, true);

insert into products (name, base_unit, sku, category, active) values ('Hollow Galvalum 40x40 (6m)', 'lonjor', 'GLV-001', 'Atap', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,  78000, 71000, true);

insert into products (name, base_unit, sku, category, active) values ('Hollow Galvalum 40x80 (6m)', 'lonjor', 'GLV-002', 'Atap', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1, 115000, 106000, true);

insert into products (name, base_unit, sku, category, active) values ('Reng Galvalum 0.4mm (6m)', 'lonjor', 'GLV-003', 'Atap', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,  22000, 19500, true);

insert into products (name, base_unit, sku, category, active) values ('Polycarbonate Bening 8mm (per meter)', 'meter', 'PCB-001', 'Atap', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'meter',  1, 185000, 170000, true);


-- ────────────────────────────────────────────────────────────────
--  LISTRIK (10 produk)
-- ────────────────────────────────────────────────────────────────

insert into products (name, base_unit, sku, category, active) values ('Kabel NYM 2x1.5mm Supreme (50m)', 'rol', 'KBL-001', 'Listrik', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'rol',   1,  185000, 170000, true),
  (pid, 'meter', 0.02, 4000, 3600, false);

insert into products (name, base_unit, sku, category, active) values ('Kabel NYM 2x2.5mm Supreme (50m)', 'rol', 'KBL-002', 'Listrik', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'rol',   1,  285000, 262000, true),
  (pid, 'meter', 0.02, 6000, 5500, false);

insert into products (name, base_unit, sku, category, active) values ('Saklar Tunggal Panasonic', 'biji', 'SKL-001', 'Listrik', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,   18000, null, true),
  (pid, 'lusin', 12, 200000, null, false);

insert into products (name, base_unit, sku, category, active) values ('Stop Kontak 2-lubang Panasonic', 'biji', 'SKT-001', 'Listrik', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,   22000, null, true),
  (pid, 'lusin', 12, 245000, null, false);

insert into products (name, base_unit, sku, category, active) values ('MCB 1 Phase 6A Schneider', 'biji', 'MCB-001', 'Listrik', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,   75000, 68000, true);

insert into products (name, base_unit, sku, category, active) values ('MCB 1 Phase 10A Schneider', 'biji', 'MCB-002', 'Listrik', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,   78000, 71000, true);

insert into products (name, base_unit, sku, category, active) values ('Pipa Conduit 5/8" (4m)', 'lonjor', 'CND-001', 'Listrik', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'lonjor', 1,   9500, 8500, true);

insert into products (name, base_unit, sku, category, active) values ('Box Panel 4 Group Inbow', 'biji', 'BXP-001', 'Listrik', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,   85000, 77000, true);

insert into products (name, base_unit, sku, category, active) values ('Lampu LED 10W Philips Putih', 'biji', 'LMP-001', 'Listrik', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,   38000, 34000, true),
  (pid, 'dus (6 biji)', 6, 215000, 195000, false);

insert into products (name, base_unit, sku, category, active) values ('Fitting Lampu E27 Bakelite', 'biji', 'FTG-001', 'Listrik', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,    8500, null, true),
  (pid, 'lusin', 12,  92000, null, false);


-- ────────────────────────────────────────────────────────────────
--  ALAT TANGAN (10 produk)
-- ────────────────────────────────────────────────────────────────

insert into products (name, base_unit, sku, category, active) values ('Palu Besi 500gr', 'biji', 'ALT-001', 'Alat Tangan', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji', 1,  45000, null, true);

insert into products (name, base_unit, sku, category, active) values ('Gergaji Kayu Handsaw 22"', 'biji', 'ALT-002', 'Alat Tangan', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji', 1,  65000, null, true);

insert into products (name, base_unit, sku, category, active) values ('Meteran 5m Stanley', 'biji', 'ALT-003', 'Alat Tangan', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji', 1,  48000, null, true);

insert into products (name, base_unit, sku, category, active) values ('Tang Kombinasi 8" Tekiro', 'biji', 'ALT-004', 'Alat Tangan', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji', 1,  38000, null, true);

insert into products (name, base_unit, sku, category, active) values ('Obeng Set (+/-) Tekiro 6 pcs', 'set', 'ALT-005', 'Alat Tangan', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'set', 1,   55000, null, true);

insert into products (name, base_unit, sku, category, active) values ('Kunci Pas Set 8-24mm (7 pcs)', 'set', 'ALT-006', 'Alat Tangan', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'set', 1,  135000, null, true);

insert into products (name, base_unit, sku, category, active) values ('Waterpass Aluminium 60cm', 'biji', 'ALT-007', 'Alat Tangan', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji', 1,  75000, null, true);

insert into products (name, base_unit, sku, category, active) values ('Cutter Besar 18mm Stanley', 'biji', 'ALT-008', 'Alat Tangan', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji', 1,  22000, null, true),
  (pid, 'lusin', 12, 240000, null, false);

insert into products (name, base_unit, sku, category, active) values ('Gerinda Tangan 4" Makita', 'biji', 'ALT-009', 'Alat Tangan', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji', 1, 485000, null, true);

insert into products (name, base_unit, sku, category, active) values ('Bor Listrik 10mm Makita', 'biji', 'ALT-010', 'Alat Tangan', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji', 1, 625000, null, true);


-- ────────────────────────────────────────────────────────────────
--  LEM & MATERIAL PENDUKUNG (10 produk)
-- ────────────────────────────────────────────────────────────────

insert into products (name, base_unit, sku, category, active) values ('Lem Kayu Fox 1kg', 'kaleng', 'LEM-001', 'Lem & Material', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kaleng', 1,  32000, 28000, true);

insert into products (name, base_unit, sku, category, active) values ('Lem PVC Rucika 400cc', 'kaleng', 'LEM-002', 'Lem & Material', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kaleng', 1,  25000, 22000, true);

insert into products (name, base_unit, sku, category, active) values ('Silikon Sealant Transparent 280ml', 'tube', 'SLK-001', 'Lem & Material', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'tube',  1,  35000, 31000, true),
  (pid, 'dus (12 tube)', 12, 390000, 355000, false);

insert into products (name, base_unit, sku, category, active) values ('Lem Besi Epoxy Araldite 25ml', 'tube', 'LEM-003', 'Lem & Material', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'tube',  1,  18000, null, true);

insert into products (name, base_unit, sku, category, active) values ('Kawat Bendrat 1kg', 'kg', 'KWT-001', 'Lem & Material', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kg',  1,   22000, 19500, true),
  (pid, 'rol (10kg)', 10, 205000, 185000, false);

insert into products (name, base_unit, sku, category, active) values ('Kawat Duri (1 rol = 100m)', 'rol', 'KWT-002', 'Lem & Material', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'rol',  1,  185000, 170000, true);

insert into products (name, base_unit, sku, category, active) values ('Kasa Ram Nyamuk Aluminium (per meter)', 'meter', 'KSA-001', 'Lem & Material', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'meter',  1,  15000, 13500, true);

insert into products (name, base_unit, sku, category, active) values ('Plastik Cor / Visqueen 0.2mm', 'meter', 'PLS-001', 'Lem & Material', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'meter',  1,   8500, 7500, true),
  (pid, 'rol (50m)', 50, 400000, 360000, false);

insert into products (name, base_unit, sku, category, active) values ('Dynabolt M10x75mm Fischer', 'biji', 'DNB-001', 'Lem & Material', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'biji',  1,    4500, null, false),
  (pid, 'pak (10 biji)', 10, 40000, 36000, true);

insert into products (name, base_unit, sku, category, active) values ('Sekrup Gypsum 3.5x25mm', 'kg', 'SKR-001', 'Lem & Material', true) returning id into pid;
insert into product_units (product_id, unit_name, factor_to_base, price, price_toko, is_default) values
  (pid, 'kg',  1,  28000, 25000, true),
  (pid, 'dus (5kg)', 5, 130000, 118000, false);

end;
$$;
