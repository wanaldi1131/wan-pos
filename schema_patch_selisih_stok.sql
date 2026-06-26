-- ============================================================
-- PATCH: Penerimaan Transfer + Selisih Stok
-- Jalankan sekali di Supabase SQL Editor
-- ============================================================

-- 1. Izinkan supplier_id NULL di goods_receipts (untuk penerimaan dari transfer)
ALTER TABLE goods_receipts ALTER COLUMN supplier_id DROP NOT NULL;

-- 2. Tambah kolom transfer_id ke goods_receipts
ALTER TABLE goods_receipts ADD COLUMN IF NOT EXISTS transfer_id INT REFERENCES transfers(id);

-- 3. Tabel selisih stok
CREATE TABLE IF NOT EXISTS stock_discrepancies (
  id           SERIAL PRIMARY KEY,
  transfer_id  INT NOT NULL REFERENCES transfers(id),
  from_wh      INT NOT NULL REFERENCES warehouses(id),
  to_wh        INT NOT NULL REFERENCES warehouses(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  created_by   UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS stock_discrepancy_items (
  id                  SERIAL PRIMARY KEY,
  discrepancy_id      INT NOT NULL REFERENCES stock_discrepancies(id) ON DELETE CASCADE,
  product_id          INT NOT NULL REFERENCES products(id),
  unit_id             INT REFERENCES product_units(id),
  transfer_qty_base   NUMERIC(14,4) NOT NULL,  -- qty kirim (base unit)
  received_qty_base   NUMERIC(14,4) NOT NULL,  -- qty terima (base unit)
  diff_base_qty       NUMERIC(14,4) NOT NULL   -- received - transfer (negatif = kurang)
);

-- 4. RLS
ALTER TABLE stock_discrepancies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_discrepancy_items  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_disc"
  ON stock_discrepancies FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_disc"
  ON stock_discrepancies FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_read_disc_items"
  ON stock_discrepancy_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_disc_items"
  ON stock_discrepancy_items FOR INSERT TO authenticated WITH CHECK (true);

-- 5. RPC: receive_transfer_with_gr
--    Asumsi: create_transfer SUDAH deduct stok dari from_wh (stock_movements negatif).
--    Fungsi ini: tambah received_qty ke to_wh + catat GR + catat selisih jika ada.
--    Gantikan receive_transfer untuk alur penerimaan detail.
CREATE OR REPLACE FUNCTION receive_transfer_with_gr(
  p_transfer_id  INT,
  p_checker_id   UUID,
  p_received_at  DATE,
  p_note         TEXT,
  p_created_by   UUID,
  p_items        JSONB   -- [{product_id, unit_id, qty}]  qty = dalam unit satuan
) RETURNS INT            -- returns goods_receipt id
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
  -- Kunci dan validasi transfer
  SELECT * INTO v_tr FROM transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer #% tidak ditemukan', p_transfer_id;
  END IF;
  IF v_tr.status = 'received' THEN
    RAISE EXCEPTION 'Transfer #% sudah pernah diterima', p_transfer_id;
  END IF;

  -- Buat goods_receipt (supplier_id NULL = sumber dari transfer, bukan supplier)
  INSERT INTO goods_receipts (
    code, supplier_id, transfer_id, checker_id,
    warehouse_id, received_at, note, created_by
  ) VALUES (
    'GR-TRF' || LPAD(p_transfer_id::TEXT, 5, '0'),
    NULL,
    p_transfer_id,
    p_checker_id,
    v_tr.to_wh,
    p_received_at,
    p_note,
    p_created_by
  ) RETURNING id INTO v_gr_id;

  -- Proses setiap item yang diterima
  FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items) LOOP
    SELECT COALESCE(factor_to_base, 1) INTO v_factor
    FROM product_units WHERE id = (v_item->>'unit_id')::INT;

    v_recv_b := (v_item->>'qty')::NUMERIC * v_factor;

    -- Simpan item GR
    INSERT INTO goods_receipt_items (goods_receipt_id, product_id, unit_id, qty, base_qty)
    VALUES (
      v_gr_id,
      (v_item->>'product_id')::INT,
      (v_item->>'unit_id')::INT,
      (v_item->>'qty')::NUMERIC,
      v_recv_b
    );

    -- Tambah stok ke gudang tujuan (berdasarkan qty AKTUAL diterima)
    INSERT INTO stock_movements (product_id, warehouse_id, qty_change, reference_type, reference_id, created_by)
    VALUES (
      (v_item->>'product_id')::INT,
      v_tr.to_wh,
      v_recv_b,
      'transfer_in',
      p_transfer_id,
      p_created_by
    );
  END LOOP;

  -- Cek apakah ada selisih antara transfer vs penerimaan aktual
  IF EXISTS (
    SELECT 1 FROM transfer_items ti
    WHERE ti.transfer_id = p_transfer_id
      AND ABS(
        ti.base_qty - COALESCE((
          SELECT SUM(gri.base_qty) FROM goods_receipt_items gri
          WHERE gri.goods_receipt_id = v_gr_id
            AND gri.product_id = ti.product_id
        ), 0)
      ) > 0.0001
  ) THEN
    -- Buat header selisih
    INSERT INTO stock_discrepancies (transfer_id, from_wh, to_wh, created_by)
    VALUES (p_transfer_id, v_tr.from_wh, v_tr.to_wh, p_created_by)
    RETURNING id INTO v_disc_id;

    -- Masukkan detail selisih untuk semua item transfer yang ada beda
    INSERT INTO stock_discrepancy_items (
      discrepancy_id, product_id, unit_id,
      transfer_qty_base, received_qty_base, diff_base_qty
    )
    SELECT
      v_disc_id,
      ti.product_id,
      ti.unit_id,
      ti.base_qty,
      COALESCE((
        SELECT SUM(gri.base_qty) FROM goods_receipt_items gri
        WHERE gri.goods_receipt_id = v_gr_id AND gri.product_id = ti.product_id
      ), 0),
      COALESCE((
        SELECT SUM(gri.base_qty) FROM goods_receipt_items gri
        WHERE gri.goods_receipt_id = v_gr_id AND gri.product_id = ti.product_id
      ), 0) - ti.base_qty
    FROM transfer_items ti
    WHERE ti.transfer_id = p_transfer_id
      AND ABS(
        ti.base_qty - COALESCE((
          SELECT SUM(gri.base_qty) FROM goods_receipt_items gri
          WHERE gri.goods_receipt_id = v_gr_id AND gri.product_id = ti.product_id
        ), 0)
      ) > 0.0001;
  END IF;

  -- Tandai transfer sebagai diterima
  UPDATE transfers
  SET status = 'received', received_at = NOW()
  WHERE id = p_transfer_id;

  RETURN v_gr_id;
END;
$$;
