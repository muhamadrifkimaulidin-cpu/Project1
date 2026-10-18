-- =====================================================================
-- Uji migrasi 001. Aman dijalankan di SQL Editor Supabase:
-- semua data uji dibuat dalam satu transaksi lalu DIBATALKAN (rollback).
--
-- Cara baca hasil: skrip SELALU berakhir dengan pesan "ERROR" berisi ringkasan.
-- Itu disengaja supaya tidak ada data uji yang tersimpan.
--   "HASIL UJI 001: SEMUA LULUS ..."  -> migrasi bekerja
--   "HASIL UJI 001: ADA YANG GAGAL ..." -> tempel pesan lengkapnya ke Claude
-- =====================================================================
begin;

create temp table hasil (no serial, uji text, lulus boolean, catatan text);
grant all on hasil to authenticated;
grant all on sequence hasil_no_seq to authenticated;

-- Jalankan p_sql sebagai p_user (role authenticated + JWT sub), lalu cek p_cek sebagai postgres.
-- p_harus_error: true = perintah harus ditolak dengan error.
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

-- ---------------------------------------------------------------------
-- Data uji: owner A, B, C + karyawan K
-- ---------------------------------------------------------------------
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
insert into storage.buckets (id, name) values ('publik_uji', 'publik_uji');

-- Singkatan di bawah: A/B/C/K = uuid di atas, O = outlet, kategori dicari per nama
create function pg_temp.kat(p_nama text) returns uuid language sql as $$
  select id from kategori where nama = p_nama and jenis = 'pengeluaran' $$;
grant execute on function pg_temp.kat(text) to authenticated;

do $$
declare
  A uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  B uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  C uuid := 'cccccccc-0000-4000-8000-000000000003';
  K uuid := 'dddddddd-0000-4000-8000-000000000004';
  O text := 'eeeeeeee-0000-4000-8000-000000000005';
  t_modal  uuid := '10000000-0000-4000-8000-000000000001';
  t_besar  uuid := '10000000-0000-4000-8000-000000000002';
  k_setor  uuid := '20000000-0000-4000-8000-000000000001';
  a_barang uuid := '30000000-0000-4000-8000-000000000001';
  a_beli   uuid := '30000000-0000-4000-8000-000000000002';
  d_tarik  uuid := '40000000-0000-4000-8000-000000000001';
  kat_bahan text := 'pg_temp.kat(''Bahan uji racikan'')';
begin
  -- 1. Transaksi owner (modal) masuk sebagai menunggu + kontribusi otomatis menunggu
  perform pg_temp.uji('01 A catat belanja pakai uang pribadi (modal) -> menunggu', A, format(
    $q$insert into transaksi (id, outlet_id, jenis, kategori_id, jumlah, metode, sumber_dana, dibayar_owner_id, klaim)
       values (%L, %L, 'pengeluaran', %s, 200000, 'tunai', 'owner', %L, 'modal')$q$, t_modal, O, kat_bahan, A),
    false, format($c$(select status from transaksi where id = %L) = 'menunggu'
                 and (select status from kontribusi where transaksi_id = %L) = 'menunggu'$c$, t_modal, t_modal));

  perform pg_temp.uji('02 A setujui catatannya sendiri -> tidak berubah', A, format(
    $q$update transaksi set status = 'aktif' where id = %L$q$, t_modal),
    false, format($c$(select status from transaksi where id = %L) = 'menunggu'$c$, t_modal));

  perform pg_temp.uji('03 B setujui, coba palsukan disetujui_oleh=C -> tercatat B', B, format(
    $q$update transaksi set status = 'aktif', disetujui_oleh = %L where id = %L$q$, C, t_modal),
    false, format($c$(select disetujui_oleh from transaksi where id = %L) = %L
                 and (select status || '/' || disetujui_oleh from kontribusi where transaksi_id = %L) = 'aktif/' || %L$c$,
                 t_modal, B, t_modal, B));

  perform pg_temp.uji('04 B ubah jumlah transaksi aktif -> ditolak', B, format(
    $q$update transaksi set jumlah = 1 where id = %L$q$, t_modal), true,
    format($c$(select jumlah from transaksi where id = %L) = 200000$c$, t_modal));

  perform pg_temp.uji('05 B ubah status aktif -> menunggu -> ditolak', B, format(
    $q$update transaksi set status = 'menunggu' where id = %L$q$, t_modal), true);

  perform pg_temp.uji('06 C batalkan tanpa alasan (spasi) -> ditolak', C, format(
    $q$update transaksi set status = 'batal', alasan_batal = '   ' where id = %L$q$, t_modal), true);

  perform pg_temp.uji('07 C batalkan dengan alasan -> batal, kontribusi ikut batal', C, format(
    $q$update transaksi set status = 'batal', alasan_batal = 'nota dobel' where id = %L$q$, t_modal),
    false, format($c$(select status from transaksi where id = %L) = 'batal'
                 and (select status from kontribusi where transaksi_id = %L) = 'batal'$c$, t_modal, t_modal));

  perform pg_temp.uji('08 B hidupkan lagi catatan batal -> ditolak', B, format(
    $q$update transaksi set status = 'aktif', alasan_batal = null where id = %L$q$, t_modal), true,
    format($c$(select status from transaksi where id = %L) = 'batal'$c$, t_modal));

  -- 2. Pemalsuan saat insert
  perform pg_temp.uji('09 A insert setor_uang status=aktif, dicatat_oleh=B -> dipaksa menunggu, dicatat A', A, format(
    $q$insert into kontribusi (id, owner_id, bentuk, jumlah, status, dicatat_oleh, disetujui_oleh)
       values (%L, %L, 'setor_uang', 1000000, 'aktif', %L, %L)$q$, k_setor, A, B, C),
    false, format($c$(select status = 'menunggu' and dicatat_oleh = %L and disetujui_oleh is null
                 from kontribusi where id = %L)$c$, A, k_setor));

  perform pg_temp.uji('10 A setujui setor_uang miliknya -> tidak berubah', A, format(
    $q$update kontribusi set status = 'aktif' where id = %L$q$, k_setor),
    false, format($c$(select status from kontribusi where id = %L) = 'menunggu'$c$, k_setor));

  perform pg_temp.uji('11 B ubah jumlah setor_uang sambil menyetujui -> ditolak', B, format(
    $q$update kontribusi set status = 'aktif', jumlah = 5000000 where id = %L$q$, k_setor), true);

  perform pg_temp.uji('12 B setujui setor_uang A -> aktif, porsi A 100%', B, format(
    $q$update kontribusi set status = 'aktif' where id = %L$q$, k_setor),
    false, format($c$(select persen from v_porsi_kepemilikan where owner_id = %L) = 100$c$, A));

  perform pg_temp.uji('13 A insert distribusi status=aktif -> dipaksa menunggu', A, format(
    $q$insert into distribusi (id, owner_id, jenis, jumlah, metode, status)
       values (%L, %L, 'penarikan_modal', 100000, 'tunai', 'aktif')$q$, d_tarik, A),
    false, format($c$(select status from distribusi where id = %L) = 'menunggu'$c$, d_tarik));

  perform pg_temp.uji('14 A catat uang pribadi atas nama karyawan -> ditolak', A, format(
    $q$insert into transaksi (outlet_id, jenis, kategori_id, jumlah, metode, sumber_dana, dibayar_owner_id, klaim)
       values (%L, 'pengeluaran', %s, 10000, 'tunai', 'owner', %L, 'modal')$q$, O, kat_bahan, K), true);

  -- 3. Pengeluaran kas besar
  perform pg_temp.uji('15 A catat pengeluaran kas 600.000 -> menunggu', A, format(
    $q$insert into transaksi (id, outlet_id, jenis, kategori_id, jumlah, metode)
       values (%L, %L, 'pengeluaran', %s, 600000, 'transfer')$q$, t_besar, O, kat_bahan),
    false, format($c$(select status from transaksi where id = %L) = 'menunggu'$c$, t_besar));

  perform pg_temp.uji('16 C setujui pengeluaran kas besar -> aktif', C, format(
    $q$update transaksi set status = 'aktif' where id = %L$q$, t_besar),
    false, format($c$(select status || '/' || disetujui_oleh from transaksi where id = %L) = 'aktif/' || %L$c$, t_besar, C));

  -- 4. Aset setor_barang: nilai disepakati saat persetujuan
  perform pg_temp.uji('17 A setor barang nilai 1.000.000 -> menunggu', A, format(
    $q$insert into aset (id, outlet_id, nama, tanggal_beli, harga_beli, sumber, dibayar_owner_id)
       values (%L, %L, 'Blender uji', current_date, 1000000, 'setor_barang', %L)$q$, a_barang, O, A),
    false, format($c$(select status from aset where id = %L) = 'menunggu'
                 and (select jumlah from kontribusi where aset_id = %L) = 1000000$c$, a_barang, a_barang));

  perform pg_temp.uji('18 B ubah nama aset saat menyetujui -> ditolak', B, format(
    $q$update aset set status = 'aktif', nama = 'Lain' where id = %L$q$, a_barang), true);

  perform pg_temp.uji('19 B setujui dengan nilai disepakati 750.000 -> aset & kontribusi 750.000', B, format(
    $q$update aset set status = 'aktif', harga_beli = 750000 where id = %L$q$, a_barang),
    false, format($c$(select harga_beli from aset where id = %L) = 750000
                 and (select jumlah || '/' || status from kontribusi where aset_id = %L) = '750000.00/aktif'$c$,
                 a_barang, a_barang));

  perform pg_temp.uji('20 C ubah harga aset yang sudah aktif -> ditolak', C, format(
    $q$update aset set status = 'batal', alasan_batal = 'x', harga_beli = 1 where id = %L$q$, a_barang), true);

  perform pg_temp.uji('21 A catat aset beli_owner 300.000', A, format(
    $q$insert into aset (id, outlet_id, nama, tanggal_beli, harga_beli, sumber, dibayar_owner_id)
       values (%L, %L, 'Gelas ukur', current_date, 300000, 'beli_owner', %L)$q$, a_beli, O, A),
    false, format($c$(select status from aset where id = %L) = 'menunggu'$c$, a_beli));

  perform pg_temp.uji('22 B ubah harga aset beli_owner saat menyetujui -> ditolak', B, format(
    $q$update aset set status = 'aktif', harga_beli = 400000 where id = %L$q$, a_beli), true);

  -- 5. Tidak ada hapus
  perform pg_temp.uji('23 B hapus transaksi -> ditolak', B, format(
    $q$delete from transaksi where id = %L$q$, t_besar), true,
    format($c$exists (select 1 from transaksi where id = %L)$c$, t_besar));

  perform pg_temp.uji('24 B truncate log_audit -> ditolak', B, 'truncate log_audit', true,
    'exists (select 1 from log_audit)');

  -- 6. Karyawan
  perform pg_temp.uji('25 K catat pengeluaran kas 50.000 -> boleh', K, format(
    $q$insert into transaksi (outlet_id, jenis, kategori_id, jumlah, metode)
       values (%L, 'pengeluaran', %s, 50000, 'tunai')$q$, O, kat_bahan), false);

  perform pg_temp.uji('26 K catat pengeluaran kas 150.000 -> ditolak', K, format(
    $q$insert into transaksi (outlet_id, jenis, kategori_id, jumlah, metode)
       values (%L, 'pengeluaran', %s, 150000, 'tunai')$q$, O, kat_bahan), true);

  perform pg_temp.uji('27 K setujui distribusi -> tidak berubah', K, format(
    $q$update distribusi set status = 'aktif' where id = %L$q$, d_tarik),
    false, format($c$(select status from distribusi where id = %L) = 'menunggu'$c$, d_tarik));

  -- 7. Storage bukti
  perform pg_temp.uji('28 K upload bukti path sah -> boleh', K,
    $q$insert into storage.objects (bucket_id, name, owner_id)
       values ('bukti', 'transaksi/2026-10/0b7e4c1a-1111-4222-8333-444455556666.webp', auth.uid()::text)$q$, false);

  perform pg_temp.uji('29 A upload path tidak sah -> ditolak', A,
    $q$insert into storage.objects (bucket_id, name, owner_id)
       values ('bukti', 'lain/foto.png', auth.uid()::text)$q$, true);

  perform pg_temp.uji('30 A upload ke bucket lain -> ditolak', A,
    $q$insert into storage.objects (bucket_id, name, owner_id)
       values ('publik_uji', 'transaksi/2026-10/0b7e4c1a-1111-4222-8333-444455556667.webp', auth.uid()::text)$q$, true);

  perform pg_temp.uji('31 A upload bukti -> boleh', A,
    $q$insert into storage.objects (bucket_id, name, owner_id)
       values ('bukti', 'aset/2026-10/0b7e4c1a-1111-4222-8333-444455556668.jpg', auth.uid()::text)$q$, false);

  perform pg_temp.uji('32 K hanya melihat foto miliknya', K,
    $q$insert into hasil (uji, lulus, catatan)
       select '32a K hitung objek terlihat', count(*) = 1, count(*)::text || ' objek'
       from storage.objects where name like '%0b7e4c1a-1111-4222-8333-44445555666%'$q$, false);

  perform pg_temp.uji('33 A (owner) melihat semua foto bukti', A,
    $q$insert into hasil (uji, lulus, catatan)
       select '33a A hitung objek terlihat', count(*) = 2, count(*)::text || ' objek'
       from storage.objects where name like '%0b7e4c1a-1111-4222-8333-44445555666%'$q$, false);
end $$;

-- ---------------------------------------------------------------------
-- Ringkasan (selalu raise supaya transaksi di-rollback)
-- ---------------------------------------------------------------------
do $$
declare
  v_total int;
  v_gagal int;
  v_teks text;
begin
  select count(*), count(*) filter (where not lulus),
         string_agg(case when lulus then 'LULUS ' else 'GAGAL ' end || uji || ' — ' || catatan, E'\n' order by no)
    into v_total, v_gagal, v_teks
  from hasil;
  if v_gagal = 0 then
    raise exception E'HASIL UJI 001: SEMUA LULUS (%/%). Data uji di-rollback.\n%', v_total, v_total, v_teks;
  else
    raise exception E'HASIL UJI 001: ADA YANG GAGAL (% dari %). Data uji di-rollback.\n%', v_gagal, v_total, v_teks;
  end if;
end $$;
