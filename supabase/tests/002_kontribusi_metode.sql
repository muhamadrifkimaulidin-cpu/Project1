-- =====================================================================
-- Uji migrasi 002. Aman di SQL Editor Supabase: semua data uji di-rollback.
-- Hasil SELALU tampil sebagai "ERROR" berisi ringkasan (disengaja supaya rollback).
--   "HASIL UJI 002: SEMUA LULUS ..." -> migrasi bekerja
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
  ('bbbbbbbb-0000-4000-8000-000000000002', 'uji-b@contoh.invalid', 'authenticated', 'authenticated');
insert into profil (id, nama, peran) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Uji A', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Uji B', 'owner');

do $$
declare
  A uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  B uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  k1 uuid := '20000000-0000-4000-8000-000000000011';
begin
  perform pg_temp.uji('01 A setor uang via transfer -> menunggu, metode tersimpan', A, format(
    $q$insert into kontribusi (id, owner_id, bentuk, jumlah, metode, bukti_path)
       values (%L, %L, 'setor_uang', 1500000, 'transfer', 'kontribusi/2026-10/%s.webp')$q$, k1, A, k1),
    false, format($c$(select status || '/' || metode from kontribusi where id = %L) = 'menunggu/transfer'$c$, k1));

  perform pg_temp.uji('02 A setor uang tanpa metode -> ditolak', A,
    format($q$insert into kontribusi (owner_id, bentuk, jumlah) values (%L, 'setor_uang', 100000)$q$, A), true);

  perform pg_temp.uji('03 A setor uang metode tidak dikenal -> ditolak', A,
    format($q$insert into kontribusi (owner_id, bentuk, jumlah, metode) values (%L, 'setor_uang', 100000, 'cek')$q$, A), true);

  perform pg_temp.uji('04 B ubah metode sambil menyetujui -> ditolak (trigger 001)', B, format(
    $q$update kontribusi set status = 'aktif', metode = 'tunai' where id = %L$q$, k1), true,
    format($c$(select metode from kontribusi where id = %L) = 'transfer'$c$, k1));

  perform pg_temp.uji('05 B setujui setor uang A -> aktif, porsi A 100%', B, format(
    $q$update kontribusi set status = 'aktif' where id = %L$q$, k1),
    false, format($c$(select persen from v_porsi_kepemilikan where owner_id = %L) = 100$c$, A));
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
    raise exception E'HASIL UJI 002: SEMUA LULUS (%/%). Data uji di-rollback.\n%', v_total, v_total, v_teks;
  else
    raise exception E'HASIL UJI 002: ADA YANG GAGAL (% dari %). Data uji di-rollback.\n%', v_gagal, v_total, v_teks;
  end if;
end $$;
