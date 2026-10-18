-- =====================================================================
-- Migrasi 001: menutup celah skema awal (CLAUDE.md §5) + storage bukti
-- Jalankan sekali di SQL Editor Supabase SETELAH schema.sql.
--
-- Isi:
--   A. Insert: dicatat_oleh, status, disetujui_oleh dipaksa server (klien tidak bisa memalsukan)
--   B. Update: hanya status / alasan_batal (+ harga_beli aset setor_barang saat disetujui);
--      transisi sah: menunggu -> aktif, menunggu -> batal, aktif -> batal;
--      disetujui_oleh di-set ke auth.uid() oleh trigger
--   C. Nilai setor_barang yang disepakati ikut ke kontribusi
--   D. Tidak ada hapus: delete/truncate dicabut dari anon & authenticated
--   E. Bucket private 'bukti' + policy
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Paksa nilai server saat insert
--    Nama trigger diawali 'a_' supaya jalan sebelum status_awal_* (urutan abjad).
-- ---------------------------------------------------------------------
create or replace function paksa_nilai_insert() returns trigger
language plpgsql as $$
begin
  -- Kontribusi otomatis dari sinkron_kontribusi_* (trigger di dalam trigger) sudah membawa
  -- nilai transaksi/aset yang sudah dipaksa; jangan ditimpa (on conflict memakai nilai ini).
  if tg_table_name = 'kontribusi' and pg_trigger_depth() > 1 then
    return new;
  end if;

  new.dicatat_oleh   := coalesce(auth.uid(), new.dicatat_oleh);
  new.disetujui_oleh := null;
  new.alasan_batal   := null;

  if tg_table_name in ('kontribusi', 'distribusi') then
    new.status := 'menunggu';
  else
    -- transaksi & aset: mulai 'aktif', lalu status_awal_* menurunkan ke 'menunggu' bila perlu
    new.status := 'aktif';
  end if;

  -- Uang owner hanya boleh atas nama profil owner yang aktif
  -- (if bersarang: dibayar_owner_id/owner_id hanya ada di tabelnya masing-masing)
  if tg_table_name in ('transaksi', 'aset') then
    if new.dibayar_owner_id is not null
       and not exists (select 1 from profil
                       where id = new.dibayar_owner_id and peran = 'owner' and aktif) then
      raise exception 'dibayar_owner_id harus owner aktif';
    end if;
  elsif not exists (select 1 from profil
                    where id = new.owner_id and peran = 'owner' and aktif) then
    raise exception 'owner_id harus owner aktif';
  end if;

  return new;
end $$;

create trigger a_paksa_insert_transaksi  before insert on transaksi
  for each row execute function paksa_nilai_insert();
create trigger a_paksa_insert_aset       before insert on aset
  for each row execute function paksa_nilai_insert();
create trigger a_paksa_insert_kontribusi before insert on kontribusi
  for each row execute function paksa_nilai_insert();
create trigger a_paksa_insert_distribusi before insert on distribusi
  for each row execute function paksa_nilai_insert();

-- ---------------------------------------------------------------------
-- B. Jaga update: kolom yang boleh berubah + transisi status
-- ---------------------------------------------------------------------
create or replace function jaga_perubahan() returns trigger
language plpgsql as $$
declare
  boleh text[] := array['status', 'disetujui_oleh', 'alasan_batal'];
begin
  if not ((old.status = 'menunggu' and new.status in ('aktif', 'batal'))
       or (old.status = 'aktif'    and new.status = 'batal')) then
    raise exception 'Transisi status % -> % tidak diizinkan', old.status, new.status;
  end if;

  -- Nilai yang disepakati untuk barang setor: hanya saat disetujui
  -- (if bersarang: field old.sumber/old.bentuk hanya ada di tabelnya masing-masing)
  if old.status = 'menunggu' and new.status = 'aktif' then
    if tg_table_name = 'aset' then
      if old.sumber = 'setor_barang' then
        boleh := array_append(boleh, 'harga_beli');
      end if;
    elsif tg_table_name = 'kontribusi' then
      if old.bentuk = 'setor_barang' then
        boleh := array_append(boleh, 'jumlah');   -- disinkronkan dari aset.harga_beli
      end if;
    end if;
  end if;

  if (to_jsonb(new) - boleh) is distinct from (to_jsonb(old) - boleh) then
    raise exception 'Hanya status/alasan_batal yang boleh diubah pada %', tg_table_name;
  end if;

  if new.status = 'aktif' then
    if auth.uid() is null then
      raise exception 'Persetujuan harus dilakukan oleh pengguna yang login';
    end if;
    new.disetujui_oleh := auth.uid();
    new.alasan_batal   := null;
  else  -- batal
    new.disetujui_oleh := old.disetujui_oleh;  -- siapa yang membatalkan tercatat di log_audit.oleh
    if nullif(btrim(new.alasan_batal), '') is null then
      raise exception 'Alasan batal wajib diisi';
    end if;
  end if;

  return new;
end $$;

create trigger a_jaga_transaksi  before update on transaksi  for each row execute function jaga_perubahan();
create trigger a_jaga_aset       before update on aset       for each row execute function jaga_perubahan();
create trigger a_jaga_kontribusi before update on kontribusi for each row execute function jaga_perubahan();
create trigger a_jaga_distribusi before update on distribusi for each row execute function jaga_perubahan();

-- ---------------------------------------------------------------------
-- C. Sinkron aset -> kontribusi: bawa juga jumlah (nilai yang disepakati)
-- ---------------------------------------------------------------------
create or replace function sinkron_kontribusi_aset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sumber in ('beli_owner', 'setor_barang') then
    insert into kontribusi (owner_id, tanggal, bentuk, jumlah, aset_id, keterangan,
                            bukti_path, status, dicatat_oleh, disetujui_oleh, alasan_batal)
    values (new.dibayar_owner_id, new.tanggal_beli,
            case when new.sumber = 'beli_owner' then 'beli_aset' else 'setor_barang' end,
            new.harga_beli, new.id, new.nama,
            new.bukti_path, new.status, new.dicatat_oleh, new.disetujui_oleh, new.alasan_batal)
    on conflict (aset_id) do update
      set status = excluded.status,
          jumlah = excluded.jumlah,
          disetujui_oleh = excluded.disetujui_oleh,
          alasan_batal = excluded.alasan_batal;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- D. Tidak ada hapus, di level hak akses (RLS tidak berlaku untuk truncate)
-- ---------------------------------------------------------------------
revoke delete, truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke delete, truncate on tables from anon, authenticated;

-- ---------------------------------------------------------------------
-- E. Storage bukti: private, path {tabel}/{yyyy-mm}/{uuid}.webp (.jpg untuk fallback)
--    Tidak ada policy update/delete: foto bukti tidak bisa diganti atau dihapus.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('bukti', 'bukti', false, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create policy bukti_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bukti'
    and name ~ '^(transaksi|aset|kontribusi|distribusi)/[0-9]{4}-(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
  );

create policy bukti_select on storage.objects for select to authenticated
  using (
    bucket_id = 'bukti'
    and (public.adalah_owner() or owner_id = (select auth.uid())::text)
  );
