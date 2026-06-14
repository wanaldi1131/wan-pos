-- =============================================================
--  SEED: Buat akun kasir untuk login PIN-pad
--  Jalankan di Supabase SQL Editor setelah user_table_extension.sql
--
--  Cara pakai:
--    1. Buka Supabase Dashboard > SQL Editor
--    2. Paste & Run script ini
--    3. PIN default = 6 digit (contoh: 123456)
--       Ganti di kolom `password` sebelum dijalankan!
-- =============================================================

-- Pastikan ekstensi pgcrypto aktif (biasanya sudah di Supabase)
create extension if not exists pgcrypto;

-- Helper: buat 1 kasir sekaligus (auth user + profil)
-- Panggil fungsi ini untuk tiap kasir baru.
create or replace function create_kasir(
  p_name        text,
  p_staff_code  text,
  p_pin         text       -- PIN 6 digit, akan di-hash
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_id   uuid := gen_random_uuid();
  v_email text := p_staff_code || '@adijaya.local';
begin
  -- 1. Buat user di auth.users
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    confirmation_token,
    recovery_token
  ) values (
    v_id,
    'authenticated',
    'authenticated',
    v_email,
    crypt(p_pin, gen_salt('bf')),
    now(),                          -- langsung confirmed, tidak butuh email
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    false,
    '',
    ''
  );

  -- 2. Buat / update profil yang terhubung ke user tersebut
  --    (ON CONFLICT jika profiles punya trigger yang sudah insert otomatis)
  insert into profiles (id, full_name, role, active, email_login, staff_code)
  values (v_id, p_name, 'kasir', true, v_email, p_staff_code)
  on conflict (id) do update
    set full_name   = excluded.full_name,
        role        = 'kasir',
        active      = true,
        email_login = excluded.email_login,
        staff_code  = excluded.staff_code;

  return v_id;
end;
$$;

-- =============================================================
--  Jalankan baris-baris di bawah ini untuk buat kasir.
--  Ganti nama & PIN sesuai kebutuhan.
-- =============================================================

select create_kasir('Budi Santoso',  'staff01', '111111');
select create_kasir('Sari Dewi',     'staff02', '222222');
-- select create_kasir('Andi Pratama', 'staff03', '333333');  -- aktifkan jika perlu

-- Verifikasi hasil
select id, full_name, staff_code, email_login, role, active
from profiles
where role = 'kasir';
