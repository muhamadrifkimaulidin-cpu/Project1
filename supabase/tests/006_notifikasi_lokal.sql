-- =====================================================================
-- Uji migrasi 006 (notifikasi) LENGKAP. HANYA LOKAL (supabase/tests/run_local.sh): memakai tiruan
-- pg_net & Vault dari _mock_supabase.sql. JANGAN dijalankan di Supabase — pakai 006_notifikasi.sql.
-- Hasil SELALU tampil sebagai "ERROR" berisi ringkasan (disengaja supaya rollback).
--   "HASIL UJI 006: SEMUA LULUS ..." -> migrasi bekerja
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

-- Ringkas isi permintaan notifikasi yang tercatat: "judul|endpoint1,endpoint2" per permintaan
create function pg_temp.log() returns text language sql as $$
  select coalesce(string_agg(x, ' ; ' order by id), '')
  from (select l.id, (l.body ->> 'judul') || '|' ||
               (select string_agg(replace(e ->> 'endpoint', 'https://push.contoh/', ''), ',' order by e ->> 'endpoint')
                from jsonb_array_elements(l.body -> 'langganan') e) as x
        from net.log_uji l) s
$$;

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

  -- 2. Belum dikonfigurasi: tidak ada kiriman, pencatatan tetap jalan
  perform pg_temp.uji('08 tanpa Vault: A catat Rp750.000 -> tersimpan, tanpa kiriman', A,
    format(trx, t1, O, kat, 750000), false,
    format($c$(select status from transaksi where id = %L) = 'menunggu' and pg_temp.log() = ''$c$, t1));

  perform pg_temp.uji('08b tes sebelum Vault diisi -> belum-dikonfigurasi', A,
    $q$insert into hasil (uji, lulus, catatan) select '08c hasil tes', x = 'belum-dikonfigurasi', x from tes_notifikasi() x$q$, false);

  insert into vault.decrypted_secrets values ('notif_url', 'https://3rally.contoh/api/notifikasi'), ('notif_secret', 'rahasia-uji');
  truncate net.log_uji;

  -- 3. Kejadian
  perform pg_temp.uji('09 A catat Rp100.000 (aktif) -> tanpa kiriman', A, format(trx, t2, O, kat, 100000), false,
    $c$pg_temp.log() = ''$c$);
  perform pg_temp.uji('10 A catat Rp800.000 (menunggu) -> ke B & C, dengan kunci rahasia', A, format(trx, t3, O, kat, 800000), false,
    $c$pg_temp.log() = 'Perlu persetujuanmu|b,c'
       and (select headers ->> 'x-3rally-secret' = 'rahasia-uji' and url = 'https://3rally.contoh/api/notifikasi'
                   and body ->> 'isi' = 'Uji A mencatat Pengeluaran Bahan uji racikan Rp800.000' from net.log_uji)$c$);
  truncate net.log_uji;
  perform pg_temp.uji('11 B setujui -> ke A saja', B, format($q$update transaksi set status = 'aktif' where id = %L$q$, t3), false,
    $c$pg_temp.log() = 'Disetujui|a'$c$);
  truncate net.log_uji;
  perform pg_temp.uji('12 A catat uang pribadi (modal) -> satu kiriman ke B & C (kontribusi otomatis tidak dobel)', A, format(
    $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode, sumber_dana, dibayar_owner_id, klaim)
       values (%L, %L, current_date, 'pengeluaran', %L, 200000, 'tunai', 'owner', %L, 'modal')$q$, t4, O, kat, A), false,
    $c$pg_temp.log() = 'Perlu persetujuanmu|b,c'$c$);
  truncate net.log_uji;
  perform pg_temp.uji('13 C tolak -> ke A saja, dengan alasan', C, format(
    $q$update transaksi set status = 'batal', alasan_batal = 'nota buram' where id = %L$q$, t4), false,
    $c$pg_temp.log() = 'Ditolak|a' and (select body ->> 'isi' from net.log_uji) like '%oleh Uji C: nota buram'$c$);
  truncate net.log_uji;
  perform pg_temp.uji('14 B setor uang -> ke A & C', B, format(
    $q$insert into kontribusi (id, owner_id, bentuk, jumlah, metode) values (%L, %L, 'setor_uang', 1000000, 'transfer')$q$, k1, B), false,
    $c$pg_temp.log() = 'Perlu persetujuanmu|a,c'$c$);
  truncate net.log_uji;
  perform pg_temp.uji('15 C ajukan batal transaksi A -> ke A & B', C, format(
    $q$insert into pengajuan_batal (tabel, baris_id, alasan) values ('transaksi', %L, 'nota dobel')$q$, t3), false,
    $c$pg_temp.log() = 'Pengajuan batal|a,b'$c$);
  truncate net.log_uji;
  perform pg_temp.uji('16 A (pencatat) setujui pembatalan -> hanya C (pengaju) dikabari', A, format(
    $q$update pengajuan_batal set status = 'disetujui' where baris_id = %L$q$, t3), false,
    format($c$pg_temp.log() = 'Pembatalan disetujui|c' and (select status from transaksi where id = %L) = 'batal'$c$, t3));
  truncate net.log_uji;
  perform pg_temp.uji('17 A tarik catatannya sendiri -> tanpa kiriman ke diri sendiri', A, format(
    trx || $q$; update transaksi set status = 'batal', alasan_batal = 'salah' where id = %L$q$, t5, O, kat, 900000, t5), false,
    $c$pg_temp.log() = 'Perlu persetujuanmu|b,c'$c$);
  truncate net.log_uji;
  perform pg_temp.uji('18 A beli aset dari kas Rp1.200.000 -> satu kiriman (aset tertaut tidak dobel)', A, format(
    $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode) values ('62000000-0000-4000-8000-000000000001', %L, current_date, 'pengeluaran', %L, 1200000, 'tunai');
       insert into aset (outlet_id, nama, tanggal_beli, harga_beli, sumber, transaksi_id) values (%L, 'Blender', current_date, 1200000, 'beli_kas', '62000000-0000-4000-8000-000000000001')$q$,
    O, kat_aset, O), false, $c$pg_temp.log() = 'Perlu persetujuanmu|b,c'$c$);
  truncate net.log_uji;

  -- 4. Kegagalan kirim tidak menggagalkan pencatatan
  execute $f$create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
             headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
             language plpgsql as $b$ begin raise exception 'jaringan putus'; end $b$ $f$;
  perform pg_temp.uji('19 pg_net error -> catatan tetap tersimpan', A,
    format(trx, '63000000-0000-4000-8000-000000000001', O, kat, 650000), false,
    $c$(select status from transaksi where id = '63000000-0000-4000-8000-000000000001') = 'menunggu'$c$);
  execute $f$create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
             headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
             language sql as $b$ insert into net.log_uji (url, body, headers) values (url, body, headers) returning id $b$ $f$;

  -- 5. Tombol "Kirim tes": hanya ke diri sendiri
  truncate net.log_uji;
  perform pg_temp.uji('19b A kirim tes -> hanya ke HP A', A,
    $q$insert into hasil (uji, lulus, catatan) select '19c hasil tes', x = 'terkirim', x from tes_notifikasi() x$q$, false,
    $c$pg_temp.log() = 'Tes notifikasi 3Rally|a'$c$);
  perform pg_temp.uji('19d K kirim tes -> ditolak', K, $q$select tes_notifikasi()$q$, true);
  truncate net.log_uji;

  -- 6. Berhenti langganan
  perform pg_temp.uji('20 C matikan notifikasi -> tidak dikirimi lagi', C,
    $q$select hapus_push('https://push.contoh/c')$q$, false);
  perform pg_temp.uji('20b A catat Rp700.000 -> hanya ke B', A,
    format(trx, '63000000-0000-4000-8000-000000000002', O, kat, 700000), false,
    $c$pg_temp.log() = 'Perlu persetujuanmu|b'$c$);
  perform pg_temp.uji('20c C kirim tes setelah mematikan -> tidak-ada-langganan', C,
    $q$insert into hasil (uji, lulus, catatan) select '20d hasil tes', x = 'tidak-ada-langganan', x from tes_notifikasi() x$q$, false);
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
    raise exception E'HASIL UJI 006: SEMUA LULUS (%/%). Data uji di-rollback.\n%', v_total, v_total, v_teks;
  else
    raise exception E'HASIL UJI 006: ADA YANG GAGAL (% dari %). Data uji di-rollback.\n%', v_gagal, v_total, v_teks;
  end if;
end $$;
