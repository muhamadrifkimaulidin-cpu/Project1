-- =====================================================================
-- Uji migrasi 004 (pengajuan batal + tarik catatan sendiri). Aman di SQL Editor Supabase: semua data uji di-rollback.
-- Hasil SELALU tampil sebagai "ERROR" berisi ringkasan (disengaja supaya rollback).
--   "HASIL UJI 004: SEMUA LULUS ..." -> migrasi bekerja
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
  kat uuid := (select id from kategori where nama = 'Bahan uji racikan' and jenis = 'pengeluaran');
  t_kas    uuid := '40000000-0000-4000-8000-000000000001';
  t_modal  uuid := '40000000-0000-4000-8000-000000000002';
  t_modal2 uuid := '40000000-0000-4000-8000-000000000003';
  t_besar  uuid := '40000000-0000-4000-8000-000000000004';
  t_besar2 uuid := '40000000-0000-4000-8000-000000000005';
  k_setor  uuid := '41000000-0000-4000-8000-000000000001';
  a_barang uuid := '42000000-0000-4000-8000-000000000001';
  p1 uuid := '43000000-0000-4000-8000-000000000001';
  p2 uuid := '43000000-0000-4000-8000-000000000002';
  p3 uuid := '43000000-0000-4000-8000-000000000003';
  p4 uuid := '43000000-0000-4000-8000-000000000004';
  ajukan text := $q$insert into pengajuan_batal (id, tabel, baris_id, alasan) values (%L, %L, %L, %L)$q$;
  status_trx text := $c$(select status from transaksi where id = %L) = %L$c$;
begin
  -- 1. Catatan kas aktif: tidak bisa dibatalkan langsung
  perform pg_temp.uji('01 A catat pengeluaran kas Rp100.000 -> aktif', A, format(
    $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode) values (%L, %L, current_date, 'pengeluaran', %L, 100000, 'tunai')$q$, t_kas, O, kat),
    false, format(status_trx, t_kas, 'aktif'));

  perform pg_temp.uji('02 A (pencatat) batalkan langsung -> tidak berubah', A, format(
    $q$update transaksi set status = 'batal', alasan_batal = 'dobel' where id = %L$q$, t_kas),
    false, format(status_trx, t_kas, 'aktif'));

  perform pg_temp.uji('03 B batalkan langsung catatan aktif -> ditolak (harus lewat pengajuan)', B, format(
    $q$update transaksi set status = 'batal', alasan_batal = 'dobel' where id = %L$q$, t_kas),
    true, format(status_trx, t_kas, 'aktif'));

  perform pg_temp.uji('04 K (karyawan) ajukan batal -> ditolak', K,
    format(ajukan, p1, 'transaksi', t_kas, 'dobel'), true,
    $c$not exists (select 1 from pengajuan_batal)$c$);

  perform pg_temp.uji('05 A ajukan batal, palsukan diajukan_oleh=B & status=disetujui -> menunggu, oleh A', A, format(
    $q$insert into pengajuan_batal (id, tabel, baris_id, alasan, diajukan_oleh, status, diputuskan_oleh)
       values (%L, 'transaksi', %L, '  nota dobel  ', %L, 'disetujui', %L)$q$, p1, t_kas, B, C),
    false, format($c$(select status = 'menunggu' and diajukan_oleh = %L and diputuskan_oleh is null and alasan = 'nota dobel'
                      from pengajuan_batal where id = %L) and %s$c$, A, p1, format(status_trx, t_kas, 'aktif')));

  perform pg_temp.uji('06 C ajukan lagi catatan yang sama -> ditolak (satu pengajuan terbuka)', C,
    format(ajukan, p2, 'transaksi', t_kas, 'lagi'), true);

  perform pg_temp.uji('07 A setujui pengajuannya sendiri -> tidak berubah', A, format(
    $q$update pengajuan_batal set status = 'disetujui' where id = %L$q$, p1),
    false, format($c$(select status from pengajuan_batal where id = %L) = 'menunggu'$c$, p1));

  perform pg_temp.uji('08 B ubah alasan pengajuan -> ditolak', B, format(
    $q$update pengajuan_batal set alasan = 'lain' where id = %L$q$, p1), true);

  perform pg_temp.uji('09 B setujui -> transaksi batal dgn alasan pengajuan, log mencatat B', B, format(
    $q$update pengajuan_batal set status = 'disetujui', diputuskan_oleh = %L where id = %L$q$, C, p1),
    false, format($c$(select status = 'disetujui' and diputuskan_oleh = %L and diputuskan_pada is not null from pengajuan_batal where id = %L)
                 and (select status = 'batal' and alasan_batal = 'nota dobel' from transaksi where id = %L)
                 and exists (select 1 from log_audit where tabel = 'transaksi' and baris_id = %L and oleh = %L
                             and data_baru ->> 'status' = 'batal')$c$, B, p1, t_kas, t_kas, B));

  perform pg_temp.uji('10 C ubah pengajuan yang sudah diputuskan -> tidak berubah', C, format(
    $q$update pengajuan_batal set status = 'ditolak', alasan_tolak = 'x' where id = %L$q$, p1),
    false, format($c$(select status from pengajuan_batal where id = %L) = 'disetujui'$c$, p1));

  perform pg_temp.uji('11 A ajukan batal catatan yang sudah batal -> ditolak', A,
    format(ajukan, p2, 'transaksi', t_kas, 'x'), true);

  -- 2. Uang pribadi (modal): pembatalan menggeser porsi, jadi harus disetujui owner lain
  perform pg_temp.uji('12 A catat pengeluaran uang pribadi Rp200.000 modal -> menunggu', A, format(
    $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode, sumber_dana, dibayar_owner_id, klaim)
       values (%L, %L, current_date, 'pengeluaran', %L, 200000, 'tunai', 'owner', %L, 'modal')$q$, t_modal, O, kat, A),
    false, format(status_trx, t_modal, 'menunggu'));

  perform pg_temp.uji('13 C ajukan batal catatan yang masih menunggu -> ditolak', C,
    format(ajukan, p2, 'transaksi', t_modal, 'x'), true);

  perform pg_temp.uji('14 B setujui transaksi A -> aktif, porsi A 100%', B, format(
    $q$update transaksi set status = 'aktif' where id = %L$q$, t_modal),
    false, format($c$(select persen from v_porsi_kepemilikan where owner_id = %L) = 100$c$, A));

  perform pg_temp.uji('15 C ajukan batal transaksi modal A -> menunggu', C,
    format(ajukan, p2, 'transaksi', t_modal, 'belanja pribadi, bukan usaha'), false,
    format($c$(select status from pengajuan_batal where id = %L) = 'menunggu'$c$, p2));

  perform pg_temp.uji('16 A tolak pengajuan tanpa alasan -> ditolak', A, format(
    $q$update pengajuan_batal set status = 'ditolak', alasan_tolak = '  ' where id = %L$q$, p2),
    true, format($c$(select status from pengajuan_batal where id = %L) = 'menunggu'$c$, p2));

  perform pg_temp.uji('17 A tolak dengan alasan -> ditolak, transaksi tetap aktif, porsi tetap', A, format(
    $q$update pengajuan_batal set status = 'ditolak', alasan_tolak = 'nota ada, untuk uji jeruk' where id = %L$q$, p2),
    false, format($c$(select status from pengajuan_batal where id = %L) = 'ditolak' and %s
                 and (select persen from v_porsi_kepemilikan where owner_id = %L) = 100$c$,
                 p2, format(status_trx, t_modal, 'aktif'), A));

  perform pg_temp.uji('18 C ajukan lagi setelah ditolak -> boleh', C,
    format(ajukan, p3, 'transaksi', t_modal, 'ternyata nota dobel'), false);

  perform pg_temp.uji('19 A (pemilik uang) setujui -> transaksi & kontribusi batal, modal A 0', A, format(
    $q$update pengajuan_batal set status = 'disetujui' where id = %L$q$, p3),
    false, format($c$%s and (select status from kontribusi where transaksi_id = %L) = 'batal'
                 and coalesce((select modal_bersih from v_porsi_kepemilikan where owner_id = %L), 0) = 0$c$,
                 format(status_trx, t_modal, 'batal'), t_modal, A));

  -- 3. Kontribusi: setor_uang lewat pengajuan; kontribusi otomatis lewat sumbernya
  perform pg_temp.uji('20 B catat pengeluaran uang pribadi, A setujui (persiapan)', B, format(
    $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode, sumber_dana, dibayar_owner_id, klaim)
       values (%L, %L, current_date, 'pengeluaran', %L, 50000, 'tunai', 'owner', %L, 'modal')$q$, t_modal2, O, kat, B), false);
  perform pg_temp.uji('20b A setujui', A, format($q$update transaksi set status = 'aktif' where id = %L$q$, t_modal2),
    false, format($c$(select status from kontribusi where transaksi_id = %L) = 'aktif'$c$, t_modal2));

  perform pg_temp.uji('21 C ajukan batal kontribusi otomatis -> ditolak (lewat transaksi)', C, format(
    $q$insert into pengajuan_batal (tabel, baris_id, alasan)
       select 'kontribusi', id, 'x' from kontribusi where transaksi_id = %L$q$, t_modal2), true);

  perform pg_temp.uji('22 B setor uang, A setujui (persiapan)', B, format(
    $q$insert into kontribusi (id, owner_id, bentuk, jumlah, metode) values (%L, %L, 'setor_uang', 1000000, 'transfer')$q$, k_setor, B), false);
  perform pg_temp.uji('22b A setujui', A, format($q$update kontribusi set status = 'aktif' where id = %L$q$, k_setor), false);

  perform pg_temp.uji('23 B ajukan batal setor uangnya, C setujui -> kontribusi batal', B,
    format(ajukan, p4, 'kontribusi', k_setor, 'transfer gagal, uang kembali'), false);
  perform pg_temp.uji('23b C setujui', C, format($q$update pengajuan_batal set status = 'disetujui' where id = %L$q$, p4),
    false, format($c$(select status from kontribusi where id = %L) = 'batal'$c$, k_setor));

  perform pg_temp.uji('24 A ajukan batal dengan tabel tidak dikenal -> ditolak', A,
    format(ajukan, gen_random_uuid(), 'profil', A, 'x'), true);

  perform pg_temp.uji('25 A hapus pengajuan -> ditolak', A, 'delete from pengajuan_batal', true,
    $c$(select count(*) from pengajuan_batal) = 4$c$);

  -- 4. Tarik catatan sendiri yang masih menunggu
  perform pg_temp.uji('26 A catat pengeluaran kas Rp750.000 -> menunggu', A, format(
    $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode) values (%L, %L, current_date, 'pengeluaran', %L, 750000, 'transfer')$q$, t_besar, O, kat),
    false, format(status_trx, t_besar, 'menunggu'));

  perform pg_temp.uji('27 A setujui catatannya sendiri -> ditolak', A, format(
    $q$update transaksi set status = 'aktif' where id = %L$q$, t_besar),
    true, format(status_trx, t_besar, 'menunggu'));

  perform pg_temp.uji('28 A tarik tanpa alasan -> ditolak', A, format(
    $q$update transaksi set status = 'batal', alasan_batal = ' ' where id = %L$q$, t_besar),
    true, format(status_trx, t_besar, 'menunggu'));

  perform pg_temp.uji('29 A tarik dengan alasan -> batal', A, format(
    $q$update transaksi set status = 'batal', alasan_batal = 'salah ketik jumlah' where id = %L$q$, t_besar),
    false, format(status_trx, t_besar, 'batal'));

  perform pg_temp.uji('30 A catat lagi, B tolak (alur lama tetap jalan) -> batal', A, format(
    $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode) values (%L, %L, current_date, 'pengeluaran', %L, 750000, 'transfer')$q$, t_besar2, O, kat), false);
  perform pg_temp.uji('30b B tolak', B, format(
    $q$update transaksi set status = 'batal', alasan_batal = 'nota tidak terbaca' where id = %L$q$, t_besar2),
    false, format(status_trx, t_besar2, 'batal'));

  perform pg_temp.uji('31 A catat setor barang, lalu tarik -> aset & kontribusi batal', A, format(
    $q$insert into aset (id, outlet_id, nama, tanggal_beli, harga_beli, sumber, dibayar_owner_id)
       values (%L, %L, 'Blender', current_date, 400000, 'setor_barang', %L)$q$, a_barang, O, A), false);
  perform pg_temp.uji('31b A tarik', A, format(
    $q$update aset set status = 'batal', alasan_batal = 'barang batal disetor' where id = %L$q$, a_barang),
    false, format($c$(select status from aset where id = %L) = 'batal'
                 and (select status from kontribusi where aset_id = %L) = 'batal'$c$, a_barang, a_barang));

  perform pg_temp.uji('32 B tarik setor uangnya sendiri yang menunggu -> batal', B, format(
    $q$insert into kontribusi (id, owner_id, bentuk, jumlah, metode) values (gen_random_uuid(), %L, 'setor_uang', 10000, 'tunai');
       update kontribusi set status = 'batal', alasan_batal = 'salah jumlah' where status = 'menunggu' and owner_id = %L$q$, B, B),
    false, $c$not exists (select 1 from kontribusi where status = 'menunggu')$c$);
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
    raise exception E'HASIL UJI 004: SEMUA LULUS (%/%). Data uji di-rollback.\n%', v_total, v_total, v_teks;
  else
    raise exception E'HASIL UJI 004: ADA YANG GAGAL (% dari %). Data uji di-rollback.\n%', v_gagal, v_total, v_teks;
  end if;
end $$;
