-- =====================================================================
-- Uji migrasi 006 (notifikasi): langganan & hak akses. Aman di SQL Editor Supabase:
-- tidak mengirim notifikasi, semua data uji di-rollback.
-- Logika kejadian (siapa dikabari kapan) diuji di 006_notifikasi_lokal.sql (hanya lokal).
-- Hasil SELALU tampil sebagai "ERROR" berisi ringkasan (disengaja supaya rollback).
--   "HASIL UJI 006 (Supabase): SEMUA LULUS ..." -> migrasi bekerja
-- =====================================================================
begin;

create temp table hasil (no serial, uji text, lulus boolean, catatan text);
grant all on hasil to authenticated;
grant all on sequence hasil_no_seq to authenticated;

create function pg_temp.uji(p_uji text, p_user uuid, p_sql text, p_harus_error boolean,
                            p_cek text default 'true') returns void
language plpgsql as $$
declare
  v_err text;
  v_cek boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    execute p_sql;
  exception when others then
    v_err := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  execute 'select (' || p_cek || ')' into v_cek;
  insert into hasil (uji, lulus, catatan) values (
    p_uji,
    (v_err is not null) = p_harus_error and coalesce(v_cek, false),
    case
      when p_harus_error and v_err is null then 'seharusnya ditolak, ternyata berhasil'
      when not p_harus_error and v_err is not null then 'error: ' || v_err
      when not coalesce(v_cek, false) then 'kondisi akhir tidak sesuai'
      else coalesce('ditolak: ' || v_err, 'ok')
    end);
end $$;

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'uji-a@contoh.invalid', 'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'uji-b@contoh.invalid', 'authenticated', 'authenticated'),
  ('cccccccc-0000-4000-8000-000000000003', 'uji-c@contoh.invalid', 'authenticated', 'authenticated'),
  ('dddddddd-0000-4000-8000-000000000004', 'uji-k@contoh.invalid', 'authenticated', 'authenticated');
insert into profil (id, nama, peran) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Uji A', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Uji B', 'owner'),
  ('cccccccc-0000-4000-8000-000000000003', 'Uji C', 'owner'),
  ('dddddddd-0000-4000-8000-000000000004', 'Uji K', 'karyawan');
insert into outlet (id, nama) values ('eeeeeeee-0000-4000-8000-000000000005', 'Outlet Uji');

do $$
declare
  A uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  B uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  C uuid := 'cccccccc-0000-4000-8000-000000000003';
  K uuid := 'dddddddd-0000-4000-8000-000000000004';
  O uuid := 'eeeeeeee-0000-4000-8000-000000000005';
  kat uuid := (select id from kategori where nama = 'Bahan uji racikan');
  kat_aset uuid := (select id from kategori where nama = 'Pembelian aset');
  t1 uuid := '60000000-0000-4000-8000-000000000001';
  t2 uuid := '60000000-0000-4000-8000-000000000002';
  t3 uuid := '60000000-0000-4000-8000-000000000003';
  t4 uuid := '60000000-0000-4000-8000-000000000004';
  t5 uuid := '60000000-0000-4000-8000-000000000005';
  k1 uuid := '61000000-0000-4000-8000-000000000001';
  trx text := $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode) values (%L, %L, current_date, 'pengeluaran', %L, %s, 'tunai')$q$;
  daftar text := $q$select daftar_push('https://push.contoh/%s', 'kunci-p256dh', 'kunci-auth', 'uji')$q$;
begin
  -- 1. Langganan
  perform pg_temp.uji('01 A daftar notifikasi', A, format(daftar, 'a'), false,
    format($c$(select profil_id from push_langganan where endpoint = 'https://push.contoh/a') = %L$c$, A));
  perform pg_temp.uji('02 K (karyawan) daftar -> ditolak', K, format(daftar, 'k'), true);
  perform pg_temp.uji('03 endpoint bukan https -> ditolak', A,
    $q$select daftar_push('http://push.contoh/x', 'p', 'a')$q$, true);
  perform pg_temp.uji('04 B login di HP yang sama (endpoint a) -> pindah ke B', B, format(daftar, 'a'), false,
    format($c$(select profil_id from push_langganan where endpoint = 'https://push.contoh/a') = %L
              and (select count(*) from push_langganan) = 1$c$, B));
  perform pg_temp.uji('04b A daftar lagi, B & C daftar HP masing-masing', A, format(daftar, 'a'), false);
  perform pg_temp.uji('04c B daftar', B, format(daftar, 'b'), false);
  perform pg_temp.uji('04d C daftar', C, format(daftar, 'c'), false, $c$(select count(*) from push_langganan) = 3$c$);
  perform pg_temp.uji('05 A hanya melihat langganannya sendiri', A,
    $q$insert into hasil (uji, lulus, catatan) select '05a jumlah terlihat', count(*) = 1, count(*)::text from push_langganan$q$, false);
  perform pg_temp.uji('06 A panggil notif_kirim langsung -> ditolak', A, format(
    $q$select notif_kirim(array[%L]::uuid[], 'palsu', 'palsu', '/', 'x')$q$, B), true);
  perform pg_temp.uji('07 A insert langganan langsung -> ditolak', A, format(
    $q$insert into push_langganan (profil_id, endpoint, p256dh, auth) values (%L, 'https://x', 'p', 'a')$q$, B), true);
  perform pg_temp.uji('08 K (karyawan) kirim tes -> ditolak', K, $q$select tes_notifikasi()$q$, true);
  perform pg_temp.uji('09 A kirim tes -> jalan (hasil tergantung Vault; di-rollback, tidak terkirim)', A,
    $q$select tes_notifikasi()$q$, false);
end $$;

do $$
declare
  v_total int; v_gagal int; v_teks text;
begin
  select count(*), count(*) filter (where not lulus),
         string_agg(case when lulus then 'LULUS ' else 'GAGAL ' end || uji || ' — ' || catatan, E'\n' order by no)
    into v_total, v_gagal, v_teks
  from hasil;
  if v_gagal = 0 then
    raise exception E'HASIL UJI 006 (Supabase): SEMUA LULUS (%/%). Data uji di-rollback.\n%', v_total, v_total, v_teks;
  else
    raise exception E'HASIL UJI 006 (Supabase): ADA YANG GAGAL (% dari %). Data uji di-rollback.\n%', v_gagal, v_total, v_teks;
  end if;
end $$;
