-- =====================================================================
-- Uji migrasi 003 (modul R&D). Aman di SQL Editor Supabase: semua data uji di-rollback.
-- Hasil SELALU tampil sebagai "ERROR" berisi ringkasan (disengaja supaya rollback).
--   "HASIL UJI 003: SEMUA LULUS ..." -> migrasi bekerja
-- Bila ditanya soal RLS untuk tabel 'hasil': pilih "Run without RLS".
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
  ('dddddddd-0000-4000-8000-000000000004', 'uji-k@contoh.invalid', 'authenticated', 'authenticated');
insert into profil (id, nama, peran) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Uji A', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Uji B', 'owner'),
  ('dddddddd-0000-4000-8000-000000000004', 'Uji K', 'karyawan');
insert into outlet (id, nama) values ('eeeeeeee-0000-4000-8000-000000000005', 'Outlet Uji');

do $$
declare
  A uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  B uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  K uuid := 'dddddddd-0000-4000-8000-000000000004';
  O uuid := 'eeeeeeee-0000-4000-8000-000000000005';
  i1 uuid := '50000000-0000-4000-8000-000000000001';
  i2 uuid := '50000000-0000-4000-8000-000000000002';
  c_prog uuid := '60000000-0000-4000-8000-000000000001';
  c_kep  uuid := '60000000-0000-4000-8000-000000000002';
  c_uji  uuid := '60000000-0000-4000-8000-000000000003';
  c_prog2 uuid := '60000000-0000-4000-8000-000000000004';
  b_jeruk uuid := '70000000-0000-4000-8000-000000000001';
  b_gula  uuid := '70000000-0000-4000-8000-000000000002';
  t1 uuid := '10000000-0000-4000-8000-000000000031';
  kat text := '(select id from kategori where nama = ''Bahan uji racikan'' and jenis = ''pengeluaran'')';
begin
  -- Ide
  perform pg_temp.uji('01 A buat ide racikan, coba paksa tahap=diadopsi -> tetap tahap ide', A, format(
    $q$insert into rnd_ide (id, judul, jalur, subjenis, tujuan, pic_id, tahap)
       values (%L, 'Jus jeruk-sereh', 'produk', 'racikan', 'menu andalan', %L, 'diadopsi')$q$, i1, A),
    false, format($c$(select tahap || '/' || status from rnd_ide where id = %L) = 'ide/aktif'$c$, i1));
  perform pg_temp.uji('02 jalur sistem dengan subjenis racikan -> ditolak', A, format(
    $q$insert into rnd_ide (judul, jalur, subjenis, pic_id) values ('x', 'sistem', 'racikan', %L)$q$, A), true);
  perform pg_temp.uji('03 PIC karyawan -> ditolak', A, format(
    $q$insert into rnd_ide (judul, jalur, subjenis, pic_id) values ('x', 'sistem', 'sop', %L)$q$, K), true);
  perform pg_temp.uji('04 A ubah tahap ide -> diuji (boleh)', A, format(
    $q$update rnd_ide set tahap = 'diuji' where id = %L$q$, i1),
    false, format($c$(select tahap from rnd_ide where id = %L) = 'diuji'$c$, i1));
  perform pg_temp.uji('05 A ubah tahap langsung -> diadopsi (ditolak)', A, format(
    $q$update rnd_ide set tahap = 'diadopsi' where id = %L$q$, i1), true);
  perform pg_temp.uji('06 A ubah jalur ide -> ditolak', A, format(
    $q$update rnd_ide set jalur = 'sistem', subjenis = 'sop' where id = %L$q$, i1), true);

  -- Catatan & keputusan
  perform pg_temp.uji('07 A catat progres -> aktif', A, format(
    $q$insert into rnd_catatan (id, ide_id, jenis, isi) values (%L, %L, 'progres', 'uji rasa pertama oke')$q$, c_prog, i1),
    false, format($c$(select status from rnd_catatan where id = %L) = 'aktif'$c$, c_prog));
  perform pg_temp.uji('08 A catat keputusan diadopsi -> menunggu', A, format(
    $q$insert into rnd_catatan (id, ide_id, jenis, isi, keputusan) values (%L, %L, 'keputusan', 'masuk menu', 'diadopsi')$q$, c_kep, i1),
    false, format($c$(select status from rnd_catatan where id = %L) = 'menunggu'$c$, c_kep));
  perform pg_temp.uji('09 keputusan kedua saat masih menunggu -> ditolak', A, format(
    $q$insert into rnd_catatan (ide_id, jenis, isi, keputusan) values (%L, 'keputusan', 'stop', 'dihentikan')$q$, i1), true);
  perform pg_temp.uji('10 A setujui keputusannya sendiri -> ditolak', A, format(
    $q$update rnd_catatan set status = 'aktif' where id = %L$q$, c_kep), true,
    format($c$(select status from rnd_catatan where id = %L) = 'menunggu'$c$, c_kep));
  perform pg_temp.uji('11 B setujui keputusan -> aktif, ide jadi diadopsi', B, format(
    $q$update rnd_catatan set status = 'aktif' where id = %L$q$, c_kep),
    false, format($c$(select tahap from rnd_ide where id = %L) = 'diadopsi'
                 and (select disetujui_oleh from rnd_catatan where id = %L) = %L$c$, i1, c_kep, B));
  perform pg_temp.uji('12 ubah tahap ide yang sudah diadopsi -> ditolak', A, format(
    $q$update rnd_ide set tahap = 'evaluasi' where id = %L$q$, i1), true);
  perform pg_temp.uji('13 keputusan baru untuk ide yang sudah diputuskan -> ditolak', B, format(
    $q$insert into rnd_catatan (ide_id, jenis, isi, keputusan) values (%L, 'keputusan', 'stop', 'dihentikan')$q$, i1), true);
  perform pg_temp.uji('14 B batalkan progres milik A -> tidak berubah', B, format(
    $q$update rnd_catatan set status = 'batal', alasan_batal = 'x' where id = %L$q$, c_prog),
    false, format($c$(select status from rnd_catatan where id = %L) = 'aktif'$c$, c_prog));
  perform pg_temp.uji('15 A batalkan progres sendiri tanpa alasan -> ditolak', A, format(
    $q$update rnd_catatan set status = 'batal', alasan_batal = ' ' where id = %L$q$, c_prog), true);
  perform pg_temp.uji('16 A batalkan progres sendiri dengan alasan -> batal', A, format(
    $q$update rnd_catatan set status = 'batal', alasan_batal = 'salah ide' where id = %L$q$, c_prog),
    false, format($c$(select status from rnd_catatan where id = %L) = 'batal'$c$, c_prog));

  -- Bahan, uji, biaya per cup
  perform pg_temp.uji('17 A tambah bahan jeruk Rp30.000/1000 g dan gula Rp15.000/1000 g', A, format(
    $q$insert into rnd_bahan (id, nama, satuan, harga_beli, isi) values
       (%L, 'Jeruk peras', 'gram', 30000, 1000), (%L, 'Gula pasir', 'gram', 15000, 1000)$q$, b_jeruk, b_gula),
    false, format($c$(select harga_per_satuan from rnd_bahan where id = %L) = 30$c$, b_jeruk));
  perform pg_temp.uji('18 buat ide 2 + uji 4 cup', B, format(
    $q$insert into rnd_ide (id, judul, jalur, subjenis, pic_id) values (%L, 'Jus jeruk manis', 'produk', 'racikan', %L);
       insert into rnd_catatan (id, ide_id, jenis, isi, jumlah_cup) values (%L, %L, 'uji', 'batch 1', 4)$q$,
    i2, B, c_uji, i2), false);
  perform pg_temp.uji('19 resep 400 g jeruk + 40 g gula -> biaya/cup Rp3.150', B, format(
    $q$insert into rnd_resep (catatan_id, bahan_id, takaran, harga_per_satuan) values
       (%L, %L, 400, 1), (%L, %L, 40, 1)$q$, c_uji, b_jeruk, c_uji, b_gula),
    false, format($c$(select biaya_per_cup from v_rnd_uji where catatan_id = %L) = 3150$c$, c_uji));
  perform pg_temp.uji('20 skor orang luar 4 dan 5 -> rata 4.5', A, format(
    $q$insert into rnd_skor (catatan_id, penilai, skor) values (%L, 'Bu Siti (tetangga)', 4), (%L, 'Ray', 5)$q$, c_uji, c_uji),
    false, format($c$(select skor_rata || '/' || jumlah_penilai from v_rnd_uji where catatan_id = %L) = '4.50/2'$c$, c_uji));
  perform pg_temp.uji('21 harga jeruk naik Rp40.000 -> biaya saat uji tetap Rp3.150, biaya kini Rp4.150', A, format(
    $q$update rnd_bahan set harga_beli = 40000 where id = %L$q$, b_jeruk),
    false, format($c$(select biaya_per_cup || '/' || biaya_per_cup_kini from v_rnd_uji where catatan_id = %L) = '3150/4150'$c$, c_uji));
  perform pg_temp.uji('22 skor 6 -> ditolak', A, format(
    $q$insert into rnd_skor (catatan_id, penilai, skor) values (%L, 'x', 6)$q$, c_uji), true);
  perform pg_temp.uji('23 resep pada catatan progres -> ditolak', B, format(
    $q$insert into rnd_catatan (id, ide_id, jenis, isi) values (%L, %L, 'progres', 'catatan biasa');
       insert into rnd_resep (catatan_id, bahan_id, takaran) values (%L, %L, 10)$q$, c_prog2, i2, c_prog2, b_gula), true);
  perform pg_temp.uji('24 ubah takaran resep -> tidak berubah (tidak ada policy update)', B, format(
    $q$update rnd_resep set takaran = 1 where catatan_id = %L$q$, c_uji),
    false, format($c$(select biaya_per_cup from v_rnd_uji where catatan_id = %L) = 3150$c$, c_uji));

  -- Tautan biaya & akses
  perform pg_temp.uji('25 pengeluaran kas Rp50.000 untuk ide 2 -> biaya_rnd ide 2', A, format(
    $q$insert into transaksi (id, outlet_id, jenis, kategori_id, jumlah, metode, ide_id)
       values (%L, %L, 'pengeluaran', %s, 50000, 'tunai', %L)$q$, t1, O, kat, i2),
    false, format($c$(select biaya_rnd from v_rnd_ide where id = %L) = 50000$c$, i2));
  perform pg_temp.uji('26 ubah ide_id transaksi setelah dicatat -> ditolak', B, format(
    $q$update transaksi set status = 'batal', alasan_batal = 'x', ide_id = %L where id = %L$q$, i1, t1), true);
  perform pg_temp.uji('27 hapus ide -> ditolak', A, format($q$delete from rnd_ide where id = %L$q$, i2), true,
    format($c$exists (select 1 from rnd_ide where id = %L)$c$, i2));
  perform pg_temp.uji('28 karyawan tidak melihat ide R&D', K,
    $q$insert into hasil (uji, lulus, catatan)
       select '28a K hitung ide terlihat', count(*) = 0, count(*)::text || ' ide' from rnd_ide$q$, false);
  perform pg_temp.uji('30 A upload lampiran rnd/ -> boleh', A,
    $q$insert into storage.objects (bucket_id, name, owner_id)
       values ('bukti', 'rnd/2026-10/0b7e4c1a-1111-4222-8333-444455559999.webp', auth.uid()::text)$q$, false);
  perform pg_temp.uji('31 folder tak dikenal tetap ditolak', A,
    $q$insert into storage.objects (bucket_id, name, owner_id)
       values ('bukti', 'lain/2026-10/0b7e4c1a-1111-4222-8333-444455559998.webp', auth.uid()::text)$q$, true);
  perform pg_temp.uji('29 karyawan buat ide -> ditolak', K, format(
    $q$insert into rnd_ide (judul, jalur, subjenis, pic_id) values ('x', 'produk', 'menu', %L)$q$, A), true);
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
    raise exception E'HASIL UJI 003: SEMUA LULUS (%/%). Data uji di-rollback.\n%', v_total, v_total, v_teks;
  else
    raise exception E'HASIL UJI 003: ADA YANG GAGAL (% dari %). Data uji di-rollback.\n%', v_gagal, v_total, v_teks;
  end if;
end $$;
