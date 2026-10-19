-- =====================================================================
-- Uji migrasi 008 + 009 (minta patungan + tautan menanggung belanja lain). Aman di SQL Editor Supabase: semua data uji di-rollback.
-- Hasil SELALU tampil sebagai "ERROR" berisi ringkasan (disengaja supaya rollback).
--   "HASIL UJI 009: SEMUA LULUS ..." -> migrasi 008 + 009 bekerja
-- Cek isi notifikasi hanya jalan di lokal (tiruan pg_net); di Supabase dilewati.
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

-- Lokal saja: aktifkan tiruan notifikasi untuk owner uji
do $$
begin
  if to_regclass('net.log_uji') is not null then
    insert into vault.decrypted_secrets values ('notif_url', 'https://3rally.contoh/api/notifikasi'),
      ('notif_secret', 'rahasia-uji') on conflict do nothing;
    insert into push_langganan (profil_id, endpoint, p256dh, auth) values
      ('aaaaaaaa-0000-4000-8000-000000000001', 'https://push.contoh/a', 'k', 'k'),
      ('bbbbbbbb-0000-4000-8000-000000000002', 'https://push.contoh/b', 'k', 'k'),
      ('cccccccc-0000-4000-8000-000000000003', 'https://push.contoh/c', 'k', 'k');
    delete from net.log_uji;
  end if;
end $$;

do $$
declare
  A uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  B uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  C uuid := 'cccccccc-0000-4000-8000-000000000003';
  K uuid := 'dddddddd-0000-4000-8000-000000000004';
  O uuid := 'eeeeeeee-0000-4000-8000-000000000005';
  kat uuid := (select id from kategori where nama = 'Bahan uji racikan');
  t1 uuid := '80000000-0000-4000-8000-000000000001';
  t2 uuid := '80000000-0000-4000-8000-000000000002';
  t3 uuid := '80000000-0000-4000-8000-000000000003';
  t4 uuid := '80000000-0000-4000-8000-000000000004';
  a1 uuid := '81000000-0000-4000-8000-000000000001';
  pB uuid := '82000000-0000-4000-8000-000000000001';
  pC uuid := '82000000-0000-4000-8000-000000000002';
  pT2 uuid := '82000000-0000-4000-8000-000000000003';
  pT3 uuid := '82000000-0000-4000-8000-000000000004';
  g1 uuid := '83000000-0000-4000-8000-000000000001';
  g2 uuid := '83000000-0000-4000-8000-000000000002';
  pribadi text := $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode, sumber_dana, dibayar_owner_id, klaim)
                     values (%L, %L, current_date, 'pengeluaran', %L, %s, 'tunai', 'owner', %L, %L)$q$;
  minta text := $q$insert into patungan (id, transaksi_id, penagih_id, tertagih_id, jumlah) values (%L, %L, %L, %L, %s)$q$;
  ganti text := $q$insert into ganti_modal (id, penerima_id, pengganti_id, jumlah, transaksi_id, metode) values (%L, %L, %L, %s, %L, 'transfer')$q$;
  setujui text := $q$update %I set status = 'aktif' where id = %L$q$;
  vp text := $c$(select %s from v_patungan where id = %L)$c$;
begin
  -- 1. Minta patungan saat mencatat (belanja masih menunggu)
  perform pg_temp.uji('00 A catat belanja Rp300.000 uang pribadi (modal)', A, format(pribadi, t1, O, kat, 300000, A, 'modal'), false);
  perform pg_temp.uji('01 A minta patungan B Rp100.000 & C Rp100.000 (belanja masih menunggu)', A,
    format(minta, pB, t1, A, B, 100000) || ';' || format(minta, pC, t1, A, C, 100000), false,
    format($c$(select count(*) from patungan where transaksi_id = %L and status = 'terbuka') = 2
              and %s = 'terbuka' and %s = 100000$c$, t1, format(vp, 'status_efektif', pB), format(vp, 'sisa', pB)));
  perform pg_temp.uji('02 B minta patungan atas belanja A -> ditolak', B, format(minta, gen_random_uuid(), t1, B, C, 1000), true);
  perform pg_temp.uji('03 A minta patungan kedua ke B untuk belanja sama -> ditolak', A, format(minta, gen_random_uuid(), t1, A, B, 1000), true);
  perform pg_temp.uji('04 A minta patungan ke karyawan -> ditolak', A, format(minta, gen_random_uuid(), t1, A, K, 1000), true);
  perform pg_temp.uji('05 patungan melebihi nilai belanja -> ditolak', A,
    format(pribadi, t2, O, kat, 50000, A, 'modal') || ';' || format(minta, gen_random_uuid(), t2, A, B, 60000), true);
  perform pg_temp.uji('06 patungan untuk belanja talangan -> ditolak', A,
    format(pribadi, t4, O, kat, 50000, A, 'talangan') || ';' || format(minta, gen_random_uuid(), t4, A, B, 10000), true);
  perform pg_temp.uji('07 B bayar sebelum belanja disetujui -> ditolak', B, format(ganti, g1, A, B, 40000, t1), true);

  -- 2. Bayar sebagian, otomatis tertaut ke tagihan
  perform pg_temp.uji('08 B setujui belanja A', B, format(setujui, 'transaksi', t1), false);
  perform pg_temp.uji('09 B bayar Rp40.000 tanpa sebut tagihan -> otomatis tertaut, diproses', B, format(ganti, g1, A, B, 40000, t1), false,
    format($c$(select patungan_id from ganti_modal where id = %L) = %L and %s = 40000 and %s = 60000$c$,
           g1, pB, format(vp, 'diproses', pB), format(vp, 'sisa', pB)));
  perform pg_temp.uji('10 B tolak saat masih ada ganti menunggu -> ditolak', B,
    format($q$update patungan set status = 'ditolak', alasan = 'x' where id = %L$q$, pB), true, format(vp, 'status', pB) || $c$ = 'terbuka'$c$);
  perform pg_temp.uji('11 A setujui ganti Rp40.000 -> modal B 40.000, sisa 60.000', A, format(setujui, 'ganti_modal', g1), false,
    format($c$pg_temp.modal(%L) = 40000 and %s = 40000 and %s = 60000 and %s = 'terbuka'$c$,
           B, format(vp, 'dibayar', pB), format(vp, 'sisa', pB), format(vp, 'status_efektif', pB)));
  perform pg_temp.uji('12 B bayar Rp70.000 (lebih dari sisa) -> ditolak', B, format(ganti, gen_random_uuid(), A, B, 70000, t1), true);

  -- 3. Tolak (oleh yang ditagih), aturan perubahan
  perform pg_temp.uji('13 C tolak tanpa alasan -> ditolak', C,
    format($q$update patungan set status = 'ditolak' where id = %L$q$, pC), true);
  perform pg_temp.uji('14 B tolak tagihan milik C -> tidak berubah', B,
    format($q$update patungan set status = 'ditolak', alasan = 'x' where id = %L$q$, pC), false, format(vp, 'status', pC) || $c$ = 'terbuka'$c$);
  perform pg_temp.uji('15 C tolak dengan alasan -> ditolak', C,
    format($q$update patungan set status = 'ditolak', alasan = 'sudah bayar tunai di luar' where id = %L$q$, pC), false,
    format(vp, 'status', pC) || $c$ = 'ditolak'$c$);
  perform pg_temp.uji('15c C catat belanja sedotan Rp30.000 (dipakai di uji 32)', C, format(
    $q$insert into transaksi (id, outlet_id, tanggal, jenis, kategori_id, jumlah, metode, sumber_dana, dibayar_owner_id, klaim)
       values (%L, %L, current_date, 'pengeluaran', %L, 30000, 'tunai', 'owner', %L, 'modal')$q$, t4, O, kat, C), false);
  perform pg_temp.uji('16 C ganti lepas Rp250.000 (melebihi sisa belanja) -> ditolak', C, format(ganti, gen_random_uuid(), A, C, 250000, t1), true);
  perform pg_temp.uji('17 A ubah jumlah tagihan B -> ditolak', A,
    format($q$update patungan set jumlah = 1000 where id = %L$q$, pB), true);
  perform pg_temp.uji('18 B membatalkan tagihannya sendiri -> ditolak (hanya penagih)', B,
    format($q$update patungan set status = 'dibatalkan', alasan = 'x' where id = %L$q$, pB), true);
  perform pg_temp.uji('19 B tunda pengingatnya sendiri -> ditolak', B,
    format($q$update patungan set pengingat_terakhir = now() + interval '1 year' where id = %L$q$, pB), true);

  -- 4. Pengingat
  perform pg_temp.uji('20 A ingatkan B -> ok', A, format($q$select ingatkan_patungan(%L)$q$, pB), false);
  perform pg_temp.uji('21 B ingatkan (bukan penagih) -> ditolak', B, format($q$select ingatkan_patungan(%L)$q$, pB), true);
  perform pg_temp.uji('22 pengingat otomatis langsung dipanggil aplikasi -> ditolak', A, $q$select kirim_pengingat_patungan()$q$, true);
  perform set_config('request.jwt.claims', '{}', true); -- sistem: tanpa pengguna login
  update patungan set pengingat_terakhir = now() - interval '4 days' where id = pB;
  insert into hasil (uji, lulus, catatan)
    select '23 pengingat otomatis: tagihan >= 3 hari dikirim sekali', n1 = 1 and n2 = 0, n1 || ' lalu ' || n2
    from (select kirim_pengingat_patungan() as n1) a, lateral (select kirim_pengingat_patungan() as n2) b;

  -- 5. Lunas
  perform pg_temp.uji('24 B bayar sisa Rp60.000, A setujui -> lunas, modal B 100.000', B,
    format(ganti, g2, A, B, 60000, t1), false);
  perform pg_temp.uji('24b A setujui', A, format(setujui, 'ganti_modal', g2), false,
    format($c$%s = 'lunas' and %s = 0 and pg_temp.modal(%L) = 100000 and pg_temp.modal(%L) = 200000$c$,
           format(vp, 'status_efektif', pB), format(vp, 'sisa', pB), B, A));
  perform pg_temp.uji('25 B tolak setelah lunas -> ditolak', B,
    format($q$update patungan set status = 'ditolak', alasan = 'x' where id = %L$q$, pB), true);
  perform pg_temp.uji('26 A ingatkan tagihan lunas -> ditolak', A, format($q$select ingatkan_patungan(%L)$q$, pB), true);

  -- 6. Batalkan oleh penagih; belanja sumber batal
  perform pg_temp.uji('27 A minta B Rp20.000 untuk belanja t2, lalu batalkan', A,
    format(pribadi, t2, O, kat, 50000, A, 'modal') || ';' -- t2 dari uji 05 ikut di-rollback
      || format(minta, pT2, t2, A, B, 20000) || format($q$; update patungan set status = 'dibatalkan', alasan = 'salah orang' where id = %L$q$, pT2),
    false, format(vp, 'status', pT2) || $c$ = 'dibatalkan'$c$);
  perform pg_temp.uji('28 buka lagi tagihan yang dibatalkan -> ditolak', A,
    format($q$update patungan set status = 'terbuka' where id = %L$q$, pT2), false, format(vp, 'status', pT2) || $c$ = 'dibatalkan'$c$);
  perform pg_temp.uji('29 A belanja t3 Rp90.000 + minta C Rp30.000; B setujui', A,
    format(pribadi, t3, O, kat, 90000, A, 'modal') || ';' || format(minta, pT3, t3, A, C, 30000), false);
  perform pg_temp.uji('29b B setujui t3', B, format(setujui, 'transaksi', t3), false);
  perform pg_temp.uji('30 B ajukan batal t3', B,
    format($q$insert into pengajuan_batal (tabel, baris_id, alasan) values ('transaksi', %L, 'nota dobel')$q$, t3), false);
  perform pg_temp.uji('31 C setujui pembatalan -> tagihan ikut dibatalkan', C,
    format($q$update pengajuan_batal set status = 'disetujui' where baris_id = %L$q$, t3), false,
    format($c$%s = 'dibatalkan' and %s like 'Belanja sumber dibatalkan%%'$c$, format(vp, 'status', pT3), format(vp, 'alasan', pT3)));

  -- 7. Aset beli_owner
  perform pg_temp.uji('32 A beli aset Rp600.000 uang pribadi + minta C Rp200.000', A, format(
    $q$insert into aset (id, outlet_id, nama, tanggal_beli, harga_beli, sumber, dibayar_owner_id) values (%L, %L, 'Juicer', current_date, 600000, 'beli_owner', %L);
       insert into patungan (aset_id, penagih_id, tertagih_id, jumlah) values (%L, %L, %L, 200000)$q$, a1, O, A, a1, A, C), false,
    format($c$(select count(*) from patungan where aset_id = %L and status = 'terbuka') = 1$c$, a1));
  perform pg_temp.uji('32b B (bukan pihak) tolak tagihan aset milik C -> tidak berubah', B, format(
    $q$update patungan set status = 'ditolak', alasan = 'x', tanggung_transaksi_id = %L where aset_id = %L and tertagih_id = %L$q$, t1, a1, C), false,
    format($c$(select status from patungan where aset_id = %L) = 'terbuka'$c$, a1));
  perform pg_temp.uji('32bb C tolak sambil menautkan belanja milik A -> ditolak', C, format(
    $q$update patungan set status = 'ditolak', alasan = 'x', tanggung_transaksi_id = %L where aset_id = %L$q$, t1, a1), true,
    format($c$(select status from patungan where aset_id = %L) = 'terbuka'$c$, a1));
  perform pg_temp.uji('32c C tolak tagihan aset sambil menautkan sedotannya', C, format(
    $q$update patungan set status = 'ditolak', alasan = 'saya sudah beli sedotan', tanggung_transaksi_id = %L where aset_id = %L$q$, t4, a1), false,
    format($c$(select status = 'ditolak' and tanggung_transaksi_id = %L from patungan where aset_id = %L)$c$, t4, a1));
  perform pg_temp.uji('32d ubah tautan setelah ditolak -> tidak berubah', C, format(
    $q$update patungan set tanggung_transaksi_id = null where aset_id = %L$q$, a1), false,
    format($c$(select tanggung_transaksi_id from patungan where aset_id = %L) = %L$c$, a1, t4));
  perform pg_temp.uji('33 hapus patungan -> ditolak', A, 'delete from patungan', true,
    $c$(select count(*) from patungan where penagih_id = 'aaaaaaaa-0000-4000-8000-000000000001') = 5$c$);
end $$;

-- Lokal saja: notifikasi yang terkirim
do $$
declare
  v text;
begin
  if to_regclass('net.log_uji') is not null then
    select string_agg((body ->> 'judul') || '>' ||
             (select string_agg(right(e ->> 'endpoint', 1), ',' order by e ->> 'endpoint')
              from jsonb_array_elements(body -> 'langganan') e), ' ; ' order by id)
      into v
    from net.log_uji where body ->> 'judul' in ('Diminta patungan', 'Patungan ditolak', 'Patungan dibatalkan',
                                                 'Pengingat patungan', 'Patungan belum lunas');
    insert into hasil (uji, lulus, catatan) values ('34 notifikasi patungan ke pihak yang tepat (lokal)',
      v = 'Diminta patungan>b ; Diminta patungan>c ; Patungan ditolak>a ; Pengingat patungan>b ; Patungan belum lunas>b ; '
          || 'Diminta patungan>b ; Patungan dibatalkan>b ; Diminta patungan>c ; Patungan dibatalkan>c ; Diminta patungan>c ; Patungan ditolak>a',
      coalesce(v, '(kosong)'));
  end if;
end $$;

do $$
declare
  v_total int; v_gagal int; v_teks text;
begin
  select count(*), count(*) filter (where not lulus),
         string_agg(case when lulus then 'LULUS ' else 'GAGAL ' end || uji || ' — ' || catatan, E'\n' order by lulus, no) -- yang GAGAL di atas
    into v_total, v_gagal, v_teks
  from hasil;
  if v_gagal = 0 then
    raise exception E'HASIL UJI 009: SEMUA LULUS (%/%). Data uji di-rollback.\n%', v_total, v_total, v_teks;
  else
    raise exception E'HASIL UJI 009: ADA YANG GAGAL (% dari %). Data uji di-rollback.\n%', v_gagal, v_total, v_teks;
  end if;
end $$;
