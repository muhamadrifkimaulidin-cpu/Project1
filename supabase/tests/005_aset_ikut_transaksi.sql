-- =====================================================================
-- Uji migrasi 005 (aset ikut transaksi). Aman di SQL Editor Supabase: semua data uji di-rollback.
-- Hasil SELALU tampil sebagai "ERROR" berisi ringkasan (disengaja supaya rollback).
--   "HASIL UJI 005: SEMUA LULUS ..." -> migrasi bekerja
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
  O uuid := 'eeeeeeee-0000-4000-8000-000000000005';
  kat uuid := (select id from kategori where nama = 'Pembelian aset');
  t1 uuid := '50000000-0000-4000-8000-000000000001';
  t2 uuid := '50000000-0000-4000-8000-000000000002';
  t3 uuid := '50000000-0000-4000-8000-000000000003';
  t_owner uuid := '50000000-0000-4000-8000-000000000004';
  a1 uuid := '51000000-0000-4000-8000-000000000001';
  a2 uuid := '51000000-0000-4000-8000-000000000002';
  a3 uuid := '51000000-0000-4000-8000-000000000003';
  a4 uuid := '51000000-0000-4000-8000-000000000004';
  a_lepas uuid := '51000000-0000-4000-8000-000000000005';
  trx text := $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode) values (%L, %L, current_date, 'pengeluaran', %L, %s, 'transfer')$q$;
  ast text := $q$insert into aset (id, outlet_id, nama, tanggal_beli, harga_beli, sumber, transaksi_id) values (%L, %L, %L, current_date, %s, 'beli_kas', %L)$q$;
  st_aset text := $c$(select status from aset where id = %L) = %L$c$;
begin
  -- 1. Pembelian besar (menunggu): aset ikut menunggu
  perform pg_temp.uji('01 A catat pembelian aset Rp1.200.000 dari kas -> transaksi menunggu', A,
    format(trx, t1, O, kat, 1200000), false,
    format($c$(select status from transaksi where id = %L) = 'menunggu'$c$, t1));
  perform pg_temp.uji('02 A catat aset tertaut -> ikut menunggu', A,
    format(ast, a1, O, 'Blender', 1200000, t1), false, format(st_aset, a1, 'menunggu'));
  perform pg_temp.uji('03 B tautkan aset lain ke transaksi A -> ditolak (beda pencatat)', B,
    format(ast, a2, O, 'Blender B', 1200000, t1), true);
  perform pg_temp.uji('04 A tautkan aset kedua ke transaksi yang sama -> ditolak', A,
    format(ast, a2, O, 'Blender 2', 1200000, t1), true);
  perform pg_temp.uji('05 A aset setor_barang dengan transaksi -> ditolak', A, format(
    $q$insert into aset (id, outlet_id, nama, tanggal_beli, harga_beli, sumber, dibayar_owner_id, transaksi_id)
       values (%L, %L, 'Kulkas', current_date, 1, 'setor_barang', %L, %L)$q$, a2, O, A, t1), true);
  perform pg_temp.uji('06 B setujui aset langsung -> ditolak (lewat transaksi)', B, format(
    $q$update aset set status = 'aktif' where id = %L$q$, a1), true, format(st_aset, a1, 'menunggu'));
  perform pg_temp.uji('07 B setujui transaksi -> aset aktif, disetujui B', B, format(
    $q$update transaksi set status = 'aktif' where id = %L$q$, t1), false,
    format($c$(select status = 'aktif' and disetujui_oleh = %L from aset where id = %L)
              and exists (select 1 from v_nilai_buku_aset where id = %L)$c$, B, a1, a1));
  perform pg_temp.uji('08 C ajukan batal aset tertaut -> ditolak (ajukan transaksinya)', C, format(
    $q$insert into pengajuan_batal (tabel, baris_id, alasan) values ('aset', %L, 'x')$q$, a1), true);
  perform pg_temp.uji('09 C ajukan batal transaksinya -> boleh', C, format(
    $q$insert into pengajuan_batal (tabel, baris_id, alasan) values ('transaksi', %L, 'blender dikembalikan')$q$, t1), false);
  perform pg_temp.uji('10 B setujui pengajuan -> transaksi & aset batal, keluar dari nilai buku', B, format(
    $q$update pengajuan_batal set status = 'disetujui' where baris_id = %L$q$, t1), false,
    format($c$(select status = 'batal' and alasan_batal = 'blender dikembalikan' from aset where id = %L)
              and not exists (select 1 from v_nilai_buku_aset where id = %L)$c$, a1, a1));
  perform pg_temp.uji('11 A tautkan aset ke transaksi yang sudah batal -> ditolak', A,
    format(ast, a2, O, 'Blender lagi', 1200000, t1), true);

  -- 2. Pembelian kecil (aktif): aset langsung aktif
  perform pg_temp.uji('12 A catat pembelian Rp200.000 + aset -> keduanya aktif', A, format(
    trx || '; ' || ast, t2, O, kat, 200000, a3, O, 'Timbangan', 200000, t2), false, format(st_aset, a3, 'aktif'));

  -- 3. Tarik: pencatat menarik transaksinya -> aset ikut batal; aset tidak bisa ditarik sendiri
  perform pg_temp.uji('13 A catat pembelian Rp900.000 + aset -> menunggu', A, format(
    trx || '; ' || ast, t3, O, kat, 900000, a4, O, 'Dispenser', 900000, t3), false, format(st_aset, a4, 'menunggu'));
  perform pg_temp.uji('14 A tarik aset tertaut langsung -> ditolak', A, format(
    $q$update aset set status = 'batal', alasan_batal = 'x' where id = %L$q$, a4), true, format(st_aset, a4, 'menunggu'));
  perform pg_temp.uji('15 A tarik transaksinya -> aset ikut batal', A, format(
    $q$update transaksi set status = 'batal', alasan_batal = 'salah harga' where id = %L$q$, t3), false,
    format($c$(select status = 'batal' and alasan_batal = 'salah harga' from aset where id = %L)$c$, a4));

  -- 4. Batasan transaksi & aset tanpa transaksi tetap seperti semula
  perform pg_temp.uji('16 A tautkan ke transaksi uang pribadi -> ditolak', A, format(
    $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode, sumber_dana, dibayar_owner_id, klaim)
       values (%L, %L, current_date, 'pengeluaran', %L, 50000, 'tunai', 'owner', %L, 'modal');
       insert into aset (outlet_id, nama, tanggal_beli, harga_beli, sumber, transaksi_id)
       values (%L, 'Pisau', current_date, 50000, 'beli_kas', %L)$q$, t_owner, O, kat, A, O, t_owner), true);
  perform pg_temp.uji('17 A aset beli_kas tanpa transaksi -> aktif (tidak berubah)', A, format(
    $q$insert into aset (id, outlet_id, nama, tanggal_beli, harga_beli, sumber) values (%L, %L, 'Rak', current_date, 300000, 'beli_kas')$q$, a_lepas, O),
    false, format(st_aset, a_lepas, 'aktif'));
  perform pg_temp.uji('18 C ajukan batal aset tanpa transaksi -> boleh', C, format(
    $q$insert into pengajuan_batal (tabel, baris_id, alasan) values ('aset', %L, 'rak rusak, dikembalikan')$q$, a_lepas), false);
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
    raise exception E'HASIL UJI 005: SEMUA LULUS (%/%). Data uji di-rollback.\n%', v_total, v_total, v_teks;
  else
    raise exception E'HASIL UJI 005: ADA YANG GAGAL (% dari %). Data uji di-rollback.\n%', v_gagal, v_total, v_teks;
  end if;
end $$;
