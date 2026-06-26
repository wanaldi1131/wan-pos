-- ============================================================
-- PATCH: Role & Permission System
-- Jalankan sekali di Supabase SQL Editor
-- URUTAN PENTING — jangan acak
-- ============================================================

-- ── 1. Tabel roles ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Helper function (dibuat dulu sebelum policy) ──────────
-- SECURITY DEFINER agar bisa baca profiles + roles tanpa kena RLS loop

CREATE OR REPLACE FUNCTION has_permission(p_key TEXT) RETURNS BOOLEAN
LANGUAGE SQL SECURITY DEFINER STABLE
AS $$
  SELECT COALESCE((
    SELECT (r.permissions ->> p_key)::boolean
    FROM profiles p
    JOIN roles r ON r.name = p.role::text
    WHERE p.id = auth.uid()
  ), false)
$$;

-- ── 3. Seed default roles (SEBELUM RLS diaktifkan) ──────────

INSERT INTO roles (name, permissions) VALUES
('owner', '{
  "pos.view": true,
  "dashboard.view": true,
  "kas.view": true,          "kas.create": true,
  "pelanggan.view": true,    "pelanggan.create": true,  "pelanggan.edit": true,
  "history.view": true,
  "admin.stok.view": true,
  "admin.transfer.view": true,           "admin.transfer.create": true,
  "admin.penerimaan.view": true,         "admin.penerimaan.create": true,
  "admin.selisih_stok.view": true,
  "admin.produk.view": true,             "admin.produk.create": true,    "admin.produk.edit": true,
  "admin.kategori.view": true,           "admin.kategori.create": true,  "admin.kategori.edit": true,
  "admin.supplier.view": true,           "admin.supplier.create": true,  "admin.supplier.edit": true,
  "admin.retur_supplier.view": true,     "admin.retur_supplier.create": true,
  "admin.invoice_pembelian.view": true,  "admin.invoice_pembelian.create": true,  "admin.invoice_pembelian.edit": true,
  "admin.pembayaran_invoice.view": true, "admin.pembayaran_invoice.create": true,
  "admin.price_lists.view": true,        "admin.price_lists.create": true,        "admin.price_lists.edit": true,
  "admin.warehouse.view": true,          "admin.warehouse.edit": true,
  "admin.kasir.view": true,              "admin.kasir.create": true,     "admin.kasir.edit": true,
  "admin.role.view": true,               "admin.role.create": true,      "admin.role.edit": true
}')
ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions;

INSERT INTO roles (name, permissions) VALUES
('admin', '{
  "pos.view": true,
  "dashboard.view": true,
  "kas.view": true,          "kas.create": true,
  "pelanggan.view": true,    "pelanggan.create": true,  "pelanggan.edit": true,
  "history.view": true,
  "admin.stok.view": true,
  "admin.transfer.view": true,           "admin.transfer.create": true,
  "admin.penerimaan.view": true,         "admin.penerimaan.create": true,
  "admin.selisih_stok.view": true,
  "admin.produk.view": true,             "admin.produk.create": true,    "admin.produk.edit": true,
  "admin.kategori.view": true,           "admin.kategori.create": true,  "admin.kategori.edit": true,
  "admin.supplier.view": true,           "admin.supplier.create": true,  "admin.supplier.edit": true,
  "admin.retur_supplier.view": true,     "admin.retur_supplier.create": true,
  "admin.invoice_pembelian.view": true,  "admin.invoice_pembelian.create": true,  "admin.invoice_pembelian.edit": true,
  "admin.pembayaran_invoice.view": true, "admin.pembayaran_invoice.create": true,
  "admin.price_lists.view": true,        "admin.price_lists.create": true,        "admin.price_lists.edit": true,
  "admin.warehouse.view": true,          "admin.warehouse.edit": true,
  "admin.kasir.view": true,              "admin.kasir.create": true,     "admin.kasir.edit": true,
  "admin.role.view": false,              "admin.role.create": false,     "admin.role.edit": false
}')
ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions;

INSERT INTO roles (name, permissions) VALUES
('kasir', '{
  "pos.view": true,
  "dashboard.view": false,
  "kas.view": false,         "kas.create": false,
  "pelanggan.view": true,    "pelanggan.create": true,  "pelanggan.edit": false,
  "history.view": true,
  "admin.stok.view": false,
  "admin.transfer.view": false,          "admin.transfer.create": false,
  "admin.penerimaan.view": false,        "admin.penerimaan.create": false,
  "admin.selisih_stok.view": false,
  "admin.produk.view": false,            "admin.produk.create": false,   "admin.produk.edit": false,
  "admin.kategori.view": false,          "admin.kategori.create": false, "admin.kategori.edit": false,
  "admin.supplier.view": false,          "admin.supplier.create": false, "admin.supplier.edit": false,
  "admin.retur_supplier.view": false,    "admin.retur_supplier.create": false,
  "admin.invoice_pembelian.view": false, "admin.invoice_pembelian.create": false, "admin.invoice_pembelian.edit": false,
  "admin.pembayaran_invoice.view": false,"admin.pembayaran_invoice.create": false,
  "admin.price_lists.view": false,       "admin.price_lists.create": false,       "admin.price_lists.edit": false,
  "admin.warehouse.view": false,         "admin.warehouse.edit": false,
  "admin.kasir.view": false,             "admin.kasir.create": false,    "admin.kasir.edit": false,
  "admin.role.view": false,              "admin.role.create": false,     "admin.role.edit": false
}')
ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions;

-- ── 4. RLS pada tabel roles ──────────────────────────────────

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_select"     ON roles;
DROP POLICY IF EXISTS "roles_insert"     ON roles;
DROP POLICY IF EXISTS "roles_update"     ON roles;
DROP POLICY IF EXISTS "roles_delete"     ON roles;

CREATE POLICY "roles_select" ON roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "roles_insert" ON roles FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.role.create'));
CREATE POLICY "roles_update" ON roles FOR UPDATE TO authenticated
  USING (has_permission('admin.role.edit'))
  WITH CHECK (has_permission('admin.role.edit'));
CREATE POLICY "roles_delete" ON roles FOR DELETE TO authenticated
  USING (has_permission('admin.role.edit'));

-- ── 5. RESTRICTIVE policies pada tabel-tabel kunci ──────────
-- Restrictive = di-AND dengan policy yang sudah ada.
-- Hanya blokir WRITE, SELECT tetap terbuka (produk dll dibutuhkan POS).

-- Produk
DROP POLICY IF EXISTS "perm_products_insert" ON products;
DROP POLICY IF EXISTS "perm_products_update" ON products;
CREATE POLICY "perm_products_insert" ON products AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.produk.create'));
CREATE POLICY "perm_products_update" ON products AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_permission('admin.produk.edit'))
  WITH CHECK (has_permission('admin.produk.edit'));

-- Satuan produk (ikut produk)
DROP POLICY IF EXISTS "perm_product_units_insert" ON product_units;
DROP POLICY IF EXISTS "perm_product_units_update" ON product_units;
CREATE POLICY "perm_product_units_insert" ON product_units AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.produk.create'));
CREATE POLICY "perm_product_units_update" ON product_units AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_permission('admin.produk.edit'))
  WITH CHECK (has_permission('admin.produk.edit'));

-- Kategori
DROP POLICY IF EXISTS "perm_categories_insert" ON categories;
DROP POLICY IF EXISTS "perm_categories_update" ON categories;
DROP POLICY IF EXISTS "perm_categories_delete" ON categories;
CREATE POLICY "perm_categories_insert" ON categories AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.kategori.create'));
CREATE POLICY "perm_categories_update" ON categories AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_permission('admin.kategori.edit'))
  WITH CHECK (has_permission('admin.kategori.edit'));
CREATE POLICY "perm_categories_delete" ON categories AS RESTRICTIVE FOR DELETE TO authenticated
  USING (has_permission('admin.kategori.edit'));

-- Supplier
DROP POLICY IF EXISTS "perm_suppliers_insert" ON suppliers;
DROP POLICY IF EXISTS "perm_suppliers_update" ON suppliers;
CREATE POLICY "perm_suppliers_insert" ON suppliers AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.supplier.create'));
CREATE POLICY "perm_suppliers_update" ON suppliers AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_permission('admin.supplier.edit'))
  WITH CHECK (has_permission('admin.supplier.edit'));

-- Transfer stok (direct insert — RPC create_transfer juga pakai cek internal, lihat catatan bawah)
DROP POLICY IF EXISTS "perm_transfers_insert" ON transfers;
CREATE POLICY "perm_transfers_insert" ON transfers AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.transfer.create'));

DROP POLICY IF EXISTS "perm_transfer_items_insert" ON transfer_items;
CREATE POLICY "perm_transfer_items_insert" ON transfer_items AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.transfer.create'));

-- Penerimaan barang (direct insert)
DROP POLICY IF EXISTS "perm_goods_receipts_insert" ON goods_receipts;
CREATE POLICY "perm_goods_receipts_insert" ON goods_receipts AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.penerimaan.create'));

DROP POLICY IF EXISTS "perm_goods_receipt_items_insert" ON goods_receipt_items;
CREATE POLICY "perm_goods_receipt_items_insert" ON goods_receipt_items AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.penerimaan.create'));

-- Price lists
DROP POLICY IF EXISTS "perm_price_lists_insert" ON price_lists;
DROP POLICY IF EXISTS "perm_price_lists_update" ON price_lists;
DROP POLICY IF EXISTS "perm_price_lists_delete" ON price_lists;
CREATE POLICY "perm_price_lists_insert" ON price_lists AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.price_lists.create'));
CREATE POLICY "perm_price_lists_update" ON price_lists AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_permission('admin.price_lists.edit'))
  WITH CHECK (has_permission('admin.price_lists.edit'));
CREATE POLICY "perm_price_lists_delete" ON price_lists AS RESTRICTIVE FOR DELETE TO authenticated
  USING (has_permission('admin.price_lists.edit'));

DROP POLICY IF EXISTS "perm_price_list_items_write" ON price_list_items;
CREATE POLICY "perm_price_list_items_write" ON price_list_items AS RESTRICTIVE FOR ALL TO authenticated
  USING (has_permission('admin.price_lists.edit'))
  WITH CHECK (has_permission('admin.price_lists.edit'));

-- Gudang
DROP POLICY IF EXISTS "perm_warehouses_insert" ON warehouses;
DROP POLICY IF EXISTS "perm_warehouses_update" ON warehouses;
CREATE POLICY "perm_warehouses_insert" ON warehouses AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.warehouse.edit'));
CREATE POLICY "perm_warehouses_update" ON warehouses AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_permission('admin.warehouse.edit'))
  WITH CHECK (has_permission('admin.warehouse.edit'));

-- Kasir / Profiles
-- Selain admin, user boleh update profilnya sendiri (ganti PIN dll)
DROP POLICY IF EXISTS "perm_profiles_insert" ON profiles;
DROP POLICY IF EXISTS "perm_profiles_update" ON profiles;
CREATE POLICY "perm_profiles_insert" ON profiles AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.kasir.create'));
CREATE POLICY "perm_profiles_update" ON profiles AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (auth.uid() = id OR has_permission('admin.kasir.edit'))
  WITH CHECK (auth.uid() = id OR has_permission('admin.kasir.edit'));

-- Pelanggan
DROP POLICY IF EXISTS "perm_customers_insert" ON customers;
DROP POLICY IF EXISTS "perm_customers_update" ON customers;
CREATE POLICY "perm_customers_insert" ON customers AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('pelanggan.create'));
CREATE POLICY "perm_customers_update" ON customers AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_permission('pelanggan.edit'))
  WITH CHECK (has_permission('pelanggan.edit'));

-- Invoice pembelian
DROP POLICY IF EXISTS "perm_purchase_invoices_insert" ON purchase_invoices;
DROP POLICY IF EXISTS "perm_purchase_invoices_update" ON purchase_invoices;
CREATE POLICY "perm_purchase_invoices_insert" ON purchase_invoices AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.invoice_pembelian.create'));
CREATE POLICY "perm_purchase_invoices_update" ON purchase_invoices AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (has_permission('admin.invoice_pembelian.edit'))
  WITH CHECK (has_permission('admin.invoice_pembelian.edit'));

-- Retur supplier
DROP POLICY IF EXISTS "perm_supplier_returns_insert" ON supplier_returns;
CREATE POLICY "perm_supplier_returns_insert" ON supplier_returns AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('admin.retur_supplier.create'));

-- Kas
DROP POLICY IF EXISTS "perm_cash_out_insert" ON cash_out;
CREATE POLICY "perm_cash_out_insert" ON cash_out AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (has_permission('kas.create'));

DROP POLICY IF EXISTS "perm_cash_sessions_write" ON cash_sessions;
CREATE POLICY "perm_cash_sessions_write" ON cash_sessions AS RESTRICTIVE FOR ALL TO authenticated
  USING (has_permission('kas.create'))
  WITH CHECK (has_permission('kas.create'));

-- ── 6. Update RPC: receive_transfer_with_gr ─────────────────
-- Tambah permission check di awal function (SECURITY DEFINER bypass RLS,
-- jadi harus cek manual di dalam function body)

CREATE OR REPLACE FUNCTION receive_transfer_with_gr(
  p_transfer_id  INT,
  p_checker_id   UUID,
  p_received_at  DATE,
  p_note         TEXT,
  p_created_by   UUID,
  p_items        JSONB
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_tr       transfers%ROWTYPE;
  v_gr_id    INT;
  v_disc_id  INT;
  v_item     JSONB;
  v_factor   NUMERIC;
  v_recv_b   NUMERIC;
BEGIN
  -- Cek permission
  IF NOT has_permission('admin.penerimaan.create') THEN
    RAISE EXCEPTION 'Akses ditolak: tidak ada permission admin.penerimaan.create';
  END IF;

  SELECT * INTO v_tr FROM transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer #% tidak ditemukan', p_transfer_id;
  END IF;
  IF v_tr.status = 'received' THEN
    RAISE EXCEPTION 'Transfer #% sudah pernah diterima', p_transfer_id;
  END IF;

  INSERT INTO goods_receipts (
    code, supplier_id, transfer_id, checker_id,
    warehouse_id, received_at, note, created_by
  ) VALUES (
    'GR-TRF' || LPAD(p_transfer_id::TEXT, 5, '0'),
    NULL, p_transfer_id, p_checker_id,
    v_tr.to_wh, p_received_at, p_note, p_created_by
  ) RETURNING id INTO v_gr_id;

  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items) LOOP
    SELECT COALESCE(factor_to_base, 1) INTO v_factor
    FROM product_units WHERE id = (v_item->>'unit_id')::INT;

    v_recv_b := (v_item->>'qty')::NUMERIC * v_factor;

    INSERT INTO goods_receipt_items (goods_receipt_id, product_id, unit_id, qty, base_qty)
    VALUES (v_gr_id, (v_item->>'product_id')::INT, (v_item->>'unit_id')::INT,
            (v_item->>'qty')::NUMERIC, v_recv_b);

    INSERT INTO stock_movements (product_id, warehouse_id, qty_change, reference_type, reference_id, created_by)
    VALUES ((v_item->>'product_id')::INT, v_tr.to_wh, v_recv_b, 'transfer_in', p_transfer_id, p_created_by);
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM transfer_items ti
    WHERE ti.transfer_id = p_transfer_id
      AND ABS(ti.base_qty - COALESCE((
        SELECT SUM(gri.base_qty) FROM goods_receipt_items gri
        WHERE gri.goods_receipt_id = v_gr_id AND gri.product_id = ti.product_id
      ), 0)) > 0.0001
  ) THEN
    INSERT INTO stock_discrepancies (transfer_id, from_wh, to_wh, created_by)
    VALUES (p_transfer_id, v_tr.from_wh, v_tr.to_wh, p_created_by)
    RETURNING id INTO v_disc_id;

    INSERT INTO stock_discrepancy_items (
      discrepancy_id, product_id, unit_id,
      transfer_qty_base, received_qty_base, diff_base_qty
    )
    SELECT
      v_disc_id, ti.product_id, ti.unit_id, ti.base_qty,
      COALESCE((SELECT SUM(gri.base_qty) FROM goods_receipt_items gri
                WHERE gri.goods_receipt_id = v_gr_id AND gri.product_id = ti.product_id), 0),
      COALESCE((SELECT SUM(gri.base_qty) FROM goods_receipt_items gri
                WHERE gri.goods_receipt_id = v_gr_id AND gri.product_id = ti.product_id), 0) - ti.base_qty
    FROM transfer_items ti
    WHERE ti.transfer_id = p_transfer_id
      AND ABS(ti.base_qty - COALESCE((
        SELECT SUM(gri.base_qty) FROM goods_receipt_items gri
        WHERE gri.goods_receipt_id = v_gr_id AND gri.product_id = ti.product_id
      ), 0)) > 0.0001;
  END IF;

  UPDATE transfers SET status = 'received', received_at = NOW() WHERE id = p_transfer_id;

  RETURN v_gr_id;
END;
$$;

-- ── 7. Catatan: RPC lain yang perlu ditambah cek permission ──
-- RPC berikut adalah SECURITY DEFINER, sehingga RLS tidak berlaku.
-- Tambahkan baris berikut di awal masing-masing function body
-- lewat Supabase Dashboard → Database → Functions:
--
-- create_transfer:
--   IF NOT has_permission('admin.transfer.create') THEN
--     RAISE EXCEPTION 'Akses ditolak: admin.transfer.create'; END IF;
--
-- receive_goods:
--   IF NOT has_permission('admin.penerimaan.create') THEN
--     RAISE EXCEPTION 'Akses ditolak: admin.penerimaan.create'; END IF;
--
-- save_purchase_invoice:
--   IF NOT has_permission('admin.invoice_pembelian.create') THEN
--     RAISE EXCEPTION 'Akses ditolak: admin.invoice_pembelian.create'; END IF;
--
-- record_pi_payment:
--   IF NOT has_permission('admin.pembayaran_invoice.create') THEN
--     RAISE EXCEPTION 'Akses ditolak: admin.pembayaran_invoice.create'; END IF;
--
-- return_to_supplier:
--   IF NOT has_permission('admin.retur_supplier.create') THEN
--     RAISE EXCEPTION 'Akses ditolak: admin.retur_supplier.create'; END IF;
--
-- checkout_sale:
--   IF NOT has_permission('pos.view') THEN
--     RAISE EXCEPTION 'Akses ditolak: pos.view'; END IF;
