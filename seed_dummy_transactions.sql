-- =============================================================
--  SEED: 30 pelanggan tambahan + 2000 transaksi dummy
--  Jalankan setelah: schema_v1, v2, v3, seed_kasir, seed_customers
-- =============================================================


-- ── 1. Pelanggan tambahan ─────────────────────────────────────

insert into customers (name, phone, address, category) values
  -- Retail perorangan
  ('Agus Setiawan',       '08131300001', 'Jl. Mawar No. 3, Tangerang',             'retail'),
  ('Bambang Hermawan',    '08131300002', 'Jl. Kenanga No. 12, Bekasi',             'retail'),
  ('Citra Lestari',       '08131300003', 'Perum Bumi Indah Blok D5, Bogor',        'retail'),
  ('Deden Solihat',       '08131300004', 'Jl. Merdeka No. 8, Karawang',            'retail'),
  ('Eka Nugraha',         '08131300005', 'Jl. Setia Budi No. 22, Jakarta Sel.',    'retail'),
  ('Fitri Handayani',     '08131300006', 'Jl. Anggrek No. 15, Tangerang Sel.',     'retail'),
  ('Gunawan Prabowo',     '08131300007', 'Jl. Sudirman No. 40, Bandung',           'retail'),
  ('Hani Kusuma',         '08131300008', 'Jl. Cibiru No. 7, Bandung',              'retail'),
  ('Irfan Maulana',       '08131300009', 'Jl. Dago No. 18, Bandung',               'retail'),
  ('Joko Santoso',        '08131300010', 'Jl. Pahlawan No. 5, Surabaya',           'retail'),
  ('Kartika Dewi',        '08131300011', 'Jl. Embong Malang No. 9, Surabaya',      'retail'),
  ('Lukman Hakim',        '08131300012', 'Jl. Urip Sumoharjo No. 3, Surabaya',     'retail'),
  ('Maya Sari',           '08131300013', 'Jl. Gatot Subroto No. 11, Semarang',     'retail'),
  ('Nanda Pratiwi',       '08131300014', 'Jl. Pemuda No. 20, Semarang',            'retail'),
  ('Oscar Hidayat',       '08131300015', 'Jl. Thamrin No. 6, Jakarta Pus.',        'retail'),
  ('Putri Wulandari',     '08131300016', 'Jl. Duren Tiga No. 14, Jakarta Sel.',    'retail'),
  ('Ridwan Fauzan',       '08131300017', 'Jl. Ciledug Raya No. 33, Tangerang',     'retail'),
  ('Rina Marlina',        '08131300018', 'Jl. Mangga No. 2, Depok',                'retail'),
  ('Sandi Kurniawan',     '08131300019', 'Jl. Cinere No. 8, Depok',                'retail'),
  ('Tina Agustina',       '08131300020', 'Jl. Kelapa Gading No. 5, Jakarta Ut.',   'retail'),

  -- Toko / reseller
  ('Toko Bangunan Sentosa',     '02141100001', 'Jl. Raya Ciputat No. 45, Tangsel',      'toko'),
  ('UD Karya Mandiri',          '02141100002', 'Jl. Industri Selatan No. 8, Bekasi',    'toko'),
  ('Toko Material Berkah',      '02141100003', 'Jl. Raya Bogor KM 35, Bogor',           'toko'),
  ('CV Prima Jaya Konstruksi',  '02141100004', 'Jl. Raya Serang No. 12, Tangerang',     'toko'),
  ('Toko Besi & Cat Mulia',     '02141100005', 'Jl. Kaliabang No. 7, Bekasi Ut.',       'toko'),
  ('UD Sari Bumi Material',     '02141100006', 'Jl. Raya Parung No. 22, Bogor',         'toko'),
  ('Toko Bangunan Jaya Raya',   '02141100007', 'Jl. Akses UI No. 3, Depok',             'toko'),
  ('CV Bangun Makmur',          '02141100008', 'Jl. Raya Serpong No. 88, Tangsel',      'toko'),
  ('Toko Sumber Bangunan',      '02141100009', 'Jl. BSD Raya No. 14, Tangsel',          'toko'),
  ('UD Mitra Konstruksi',       '02141100010', 'Jl. Gatot Subroto No. 5, Tangerang',    'toko')
on conflict do nothing;


-- ── 2. Generate 2000 transaksi dummy ─────────────────────────

do $$
declare
  v_cashier_ids  uuid[];
  v_cust_ids     bigint[];
  v_unit_ids     bigint[];

  v_sale_id      bigint;
  v_total        numeric;
  v_cashier_id   uuid;
  v_cust_id      bigint;
  v_unit_id      bigint;
  v_product_id   bigint;
  v_unit_price   numeric;
  v_factor       numeric;
  v_qty          int;
  v_sub          numeric;
  v_n_items      int;
  v_pay_method   text;
  v_pay_status   text;
  v_fulfillment  text;
  v_created_at   timestamptz;

  pay_pool    text[] := array['tunai','tunai','tunai','tunai','transfer','transfer','kredit','cod'];
  fulfil_pool text[] := array['ambil','ambil','ambil','antar'];

  i int;
  j int;
begin
  -- Ambil data referensi
  select array(select id from profiles where role = 'kasir' and active = true) into v_cashier_ids;
  select array(select id from customers)     into v_cust_ids;
  select array(select id from product_units) into v_unit_ids;

  if array_length(v_cashier_ids, 1) is null then
    raise exception 'Tidak ada kasir aktif — jalankan seed_kasir.sql dulu.';
  end if;
  if array_length(v_unit_ids, 1) is null then
    raise exception 'product_units kosong — jalankan schema + seed produk dulu.';
  end if;

  for i in 1..2000 loop
    -- Tanggal acak dalam 6 bulan terakhir, distribusi lebih banyak di bulan baru
    v_created_at := now() - (random() ^ 0.7 * interval '180 days');

    -- Kasir acak
    v_cashier_id := v_cashier_ids[1 + (random() * (array_length(v_cashier_ids,1) - 1))::int];

    -- Customer: 25% walk-in (null), 75% dari daftar
    if random() > 0.25 then
      v_cust_id := v_cust_ids[1 + (random() * (array_length(v_cust_ids,1) - 1))::int];
    else
      v_cust_id := null;
    end if;

    -- Metode bayar (tunai paling sering)
    v_pay_method := pay_pool[1 + (random() * (array_length(pay_pool,1) - 1))::int];
    v_pay_status := case when v_pay_method in ('tunai','transfer') then 'lunas' else 'belum' end;

    -- Fulfillment (ambil lebih sering)
    v_fulfillment := fulfil_pool[1 + (random() * (array_length(fulfil_pool,1) - 1))::int];

    -- Insert sale dengan total sementara = 0 (code adalah generated column)
    insert into sales (
      cashier_id, customer_id, warehouse_id,
      fulfillment, pay_method, pay_status, total,
      created_at
    ) values (
      v_cashier_id, v_cust_id, 1,
      v_fulfillment::fulfillment_type, v_pay_method::payment_method, v_pay_status::payment_status, 0,
      v_created_at
    )
    returning id into v_sale_id;

    -- Insert 1–4 item per transaksi
    v_n_items := 1 + (random() * 3)::int;
    v_total   := 0;

    for j in 1..v_n_items loop
      v_unit_id := v_unit_ids[1 + (random() * (array_length(v_unit_ids,1) - 1))::int];

      select price, product_id, factor_to_base
        into v_unit_price, v_product_id, v_factor
        from product_units
       where id = v_unit_id;

      v_qty := 1 + (random() * 49)::int;   -- 1–50 pcs
      v_sub := v_qty * v_unit_price;
      v_total := v_total + v_sub;

      insert into sale_items (sale_id, product_id, unit_id, qty, base_qty, unit_price, subtotal)
      values (v_sale_id, v_product_id, v_unit_id, v_qty, (v_qty * v_factor)::numeric, v_unit_price, v_sub);
    end loop;

    -- Update total yang benar
    update sales set total = v_total where id = v_sale_id;
  end loop;

  raise notice 'Selesai: 2000 transaksi dummy dibuat.';
end $$;


-- ── Verifikasi ────────────────────────────────────────────────
select
  count(*)                                          as total_transaksi,
  to_char(sum(total), 'FM999,999,999,999')          as grand_total,
  min(created_at)::date                             as dari_tanggal,
  max(created_at)::date                             as sampai_tanggal,
  count(*) filter (where pay_status = 'lunas')      as lunas,
  count(*) filter (where pay_status = 'belum')      as belum_lunas,
  count(*) filter (where customer_id is null)       as walk_in
from sales
where created_at >= now() - interval '185 days';
