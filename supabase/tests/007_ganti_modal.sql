-- =====================================================================
-- Uji migrasi 007 (ganti ke owner / pindah modal). Aman di SQL Editor Supabase: semua data uji di-rollback.
-- Hasil SELALU tampil sebagai "ERROR" berisi ringkasan (disengaja supaya rollback).
--   "HASIL UJI 007: SEMUA LULUS ..." -> migrasi bekerja
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

create function pg_temp.modal(p uuid) returns numeric language sql as $$
  select modal_bersih from v_porsi_kepemilikan where owner_id = p $$;

do $$
declare
  A uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  B uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  C uuid := 'cccccccc-0000-4000-8000-000000000003';
  K uuid := 'dddddddd-0000-4000-8000-000000000004';
  O uuid := 'eeeeeeee-0000-4000-8000-000000000005';
  kat uuid := (select id from kategori where nama = 'Bahan uji racikan');
  t1 uuid := '70000000-0000-4000-8000-000000000001';
  t_kas uuid := '70000000-0000-4000-8000-000000000002';
  t_tunggu uuid := '70000000-0000-4000-8000-000000000003';
  a1 uuid := '71000000-0000-4000-8000-000000000001';
  g1 uuid := '72000000-0000-4000-8000-000000000001';
  g2 uuid := '72000000-0000-4000-8000-000000000002';
  g3 uuid := '72000000-0000-4000-8000-000000000003';
  g4 uuid := '72000000-0000-4000-8000-000000000004';
  pribadi text := $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode, sumber_dana, dibayar_owner_id, klaim)
                     values (%L, %L, current_date, 'pengeluaran', %L, %s, 'tunai', 'owner', %L, 'modal')$q$;
  ganti text := $q$insert into ganti_modal (id, penerima_id, pengganti_id, jumlah, transaksi_id, metode) values (%L, %L, %L, %s, %L, 'transfer')$q$;
  st text := $c$(select status from ganti_modal where id = %L) = %L$c$;
  -- Supabase sungguhan sudah berisi data owner asli: cek relatif terhadap kondisi awal, bukan nilai absolut
  kas0 numeric := (select saldo_kas from v_saldo_kas);
begin
  -- Persiapan: B membayar belanja Rp300.000 dengan uang pribadi, A menyetujui
  perform pg_temp.uji('00 B catat belanja Rp300.000 uang pribadi', B, format(pribadi, t1, O, kat, 300000, B), false);
  perform pg_temp.uji('00b A setujui -> modal B 300.000', A, format($q$update transaksi set status = 'aktif' where id = %L$q$, t1),
    false, format($c$pg_temp.modal(%L) = 300000$c$, B));

  -- 1. A mengganti Rp100.000 ke B
  perform pg_temp.uji('01 A catat ganti Rp100.000 ke B -> menunggu, belum geser porsi', A, format(ganti, g1, B, A, 100000, t1), false,
    format($c$%s and pg_temp.modal(%L) = 300000$c$, format(st, g1, 'menunggu'), B));
  perform pg_temp.uji('02 C (owner ketiga) setujui -> tidak berubah', C, format($q$update ganti_modal set status = 'aktif' where id = %L$q$, g1),
    false, format(st, g1, 'menunggu'));
  perform pg_temp.uji('03 A setujui gantinya sendiri -> ditolak', A, format($q$update ganti_modal set status = 'aktif' where id = %L$q$, g1),
    true, format(st, g1, 'menunggu'));
  perform pg_temp.uji('04 B (penerima) setujui -> modal A 100.000, B 200.000, kas tetap', B,
    format($q$update ganti_modal set status = 'aktif' where id = %L$q$, g1), false,
    format($c$pg_temp.modal(%L) = 100000 and pg_temp.modal(%L) = 200000
              and (select pindah_modal from v_porsi_kepemilikan where owner_id = %L) = -100000
              and (select saldo_kas from v_saldo_kas) = %s
              and (select disetujui_oleh from ganti_modal where id = %L) = %L$c$, A, B, B, kas0, g1, B));

  -- 2. Dicatat penerima, disetujui pengganti
  perform pg_temp.uji('05 B catat "C sudah ganti Rp100.000" -> menunggu', B, format(ganti, g2, B, C, 100000, t1), false,
    format(st, g2, 'menunggu'));
  perform pg_temp.uji('06 C setujui -> modal ketiganya 100.000 (porsi sama besar)', C,
    format($q$update ganti_modal set status = 'aktif' where id = %L$q$, g2), false,
    format($c$pg_temp.modal(%L) = 100000 and pg_temp.modal(%L) = 100000 and pg_temp.modal(%L) = 100000
              and (select count(distinct persen) from v_porsi_kepemilikan where owner_id in (%L, %L, %L)) = 1$c$, A, B, C, A, B, C));

  -- 3. Batasan
  perform pg_temp.uji('07 total ganti melebihi belanja -> ditolak', A, format(ganti, g3, B, A, 150000, t1), true);
  perform pg_temp.uji('08 K (karyawan) catat ganti -> ditolak', K, format(ganti, g3, B, K, 1000, t1), true);
  perform pg_temp.uji('09 A catat ganti atas nama C (bukan pihaknya) -> ditolak', A, format(ganti, g3, B, C, 1000, t1), true);
  perform pg_temp.uji('10 penerima bukan yang membayar -> ditolak', A, format(ganti, g3, C, A, 1000, t1), true);
  perform pg_temp.uji('11 ganti untuk belanja kas usaha -> ditolak', A, format(
    $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode) values (%L, %L, current_date, 'pengeluaran', %L, 50000, 'tunai');
       insert into ganti_modal (penerima_id, pengganti_id, jumlah, transaksi_id, metode) values (%L, %L, 1000, %L, 'tunai')$q$,
    t_kas, O, kat, B, A, t_kas), true);
  perform pg_temp.uji('12 ganti untuk belanja yang masih menunggu -> ditolak', B, format(
    pribadi || $q$; insert into ganti_modal (penerima_id, pengganti_id, jumlah, transaksi_id, metode) values (%L, %L, 1000, %L, 'tunai')$q$,
    t_tunggu, O, kat, 40000, B, B, A, t_tunggu), true);

  -- 4. Tarik & batal
  perform pg_temp.uji('13 A catat ganti Rp50.000 lalu tarik sendiri -> batal', A, format(
    ganti || $q$; update ganti_modal set status = 'batal', alasan_batal = 'salah nominal' where id = %L$q$, g3, B, A, 50000, t1, g3),
    false, format(st, g3, 'batal'));
  perform pg_temp.uji('14 B batalkan ganti aktif langsung -> tidak berubah', B, format(
    $q$update ganti_modal set status = 'batal', alasan_batal = 'x' where id = %L$q$, g1), false, format(st, g1, 'aktif'));
  perform pg_temp.uji('15 C ajukan batal ganti A', C, format(
    $q$insert into pengajuan_batal (tabel, baris_id, alasan) values ('ganti_modal', %L, 'transfer tidak masuk')$q$, g1), false);
  perform pg_temp.uji('16 A setujui pengajuan -> ganti batal, modal A 0, B 200.000', A, format(
    $q$update pengajuan_batal set status = 'disetujui' where baris_id = %L$q$, g1), false,
    format($c$%s and pg_temp.modal(%L) = 0 and pg_temp.modal(%L) = 200000$c$, format(st, g1, 'batal'), A, B));

  -- 5. Belanja sumber dibatalkan -> ganti ikut batal
  perform pg_temp.uji('17 A ajukan batal belanja B', A, format(
    $q$insert into pengajuan_batal (tabel, baris_id, alasan) values ('transaksi', %L, 'barang dikembalikan ke toko')$q$, t1), false);
  perform pg_temp.uji('18 C setujui -> belanja & ganti C batal, semua modal 0', C, format(
    $q$update pengajuan_batal set status = 'disetujui' where baris_id = %L$q$, t1), false,
    format($c$%s and pg_temp.modal(%L) = 0 and pg_temp.modal(%L) = 0 and pg_temp.modal(%L) = 0
              and (select alasan_batal from ganti_modal where id = %L) like 'Belanja sumber dibatalkan%%'$c$,
           format(st, g2, 'batal'), A, B, C, g2));

  -- 6. Aset dibeli uang pribadi + kunci porsi memakai modal bersih
  perform pg_temp.uji('19 B beli aset Rp600.000 uang pribadi, C setujui', B, format(
    $q$insert into aset (id, outlet_id, nama, tanggal_beli, harga_beli, sumber, dibayar_owner_id) values (%L, %L, 'Juicer', current_date, 600000, 'beli_owner', %L)$q$,
    a1, O, B), false);
  perform pg_temp.uji('19b C setujui aset', C, format($q$update aset set status = 'aktif' where id = %L$q$, a1), false,
    format($c$pg_temp.modal(%L) = 600000$c$, B));
  perform pg_temp.uji('20 A ganti Rp200.000 untuk aset, B setujui -> A 200.000, B 400.000', A, format(
    $q$insert into ganti_modal (id, penerima_id, pengganti_id, jumlah, aset_id, metode) values (%L, %L, %L, 200000, %L, 'tunai')$q$, g4, B, A, a1), false);
  perform pg_temp.uji('20b B setujui', B, format($q$update ganti_modal set status = 'aktif' where id = %L$q$, g4), false,
    format($c$pg_temp.modal(%L) = 200000 and pg_temp.modal(%L) = 400000$c$, A, B));
  perform pg_temp.uji('21 kunci porsi memakai modal setelah ganti', A, $q$select kunci_porsi(current_date, 'uji 007')$q$, false,
    format($c$(select total_kontribusi from porsi_terkunci where owner_id = %L and catatan = 'uji 007') = 200000$c$, A));
  perform pg_temp.uji('23 unggah foto bukti ke folder ganti/', A,
    $q$insert into storage.objects (bucket_id, name, owner_id) values ('bukti', 'ganti/2026-10/72000000-0000-4000-8000-0000000000ff.webp', auth.uid()::text)$q$, false);
  perform pg_temp.uji('22 hapus ganti -> ditolak', A, 'delete from ganti_modal', true,
    format($c$(select count(*) from ganti_modal where pengganti_id in (%L, %L, %L)) = 4$c$, A, B, C));
end $$;

do $$
declare
  v_total int; v_gagal int; v_teks text;
begin
  select count(*), count(*) filter (where not lulus),
         string_agg(case when lulus then 'LULUS ' else 'GAGAL ' end || uji || ' — ' || catatan, E'\n' order by lulus, no) -- yang GAGAL di atas: SQL Editor hanya menampilkan baris awal
    into v_total, v_gagal, v_teks
  from hasil;
  if v_gagal = 0 then
    raise exception E'HASIL UJI 007: SEMUA LULUS (%/%). Data uji di-rollback.\n%', v_total, v_total, v_teks;
  else
    raise exception E'HASIL UJI 007: ADA YANG GAGAL (% dari %). Data uji di-rollback.\n%', v_gagal, v_total, v_teks;
  end if;
end $$;
