-- =====================================================================
-- Migrasi 004: pembatalan lewat persetujuan silang (fitur Riwayat)
-- Jalankan sekali di SQL Editor Supabase SETELAH migrasi 003.
--
-- Keputusan Rifki: membatalkan catatan AKTIF (sudah dihitung ke kas/porsi) tidak boleh
-- dilakukan satu orang. Alurnya:
--   1. Owner mana pun mengajukan batal + alasan          -> baris pengajuan_batal 'menunggu'
--   2. Owner lain (bukan pengaju) menyetujui atau menolak -> bila disetujui, catatan jadi 'batal'
--      dengan alasan dari pengajuan; kontribusi otomatis ikut batal lewat trigger sinkron.
-- Tambahan: pencatat boleh MENARIK catatannya sendiri yang masih 'menunggu' (menunggu -> batal,
-- alasan wajib). Catatan menunggu belum dihitung ke mana pun, jadi aman dilakukan sendiri.
--
-- Isi:
--   A. Tabel pengajuan_batal + trigger insert/update/terapkan + audit + RLS
--   B. jaga_perubahan(): aktif -> batal untuk transaksi/aset/kontribusi/distribusi hanya lewat
--      pengajuan; menyetujui catatan/uang sendiri ditolak eksplisit
--   C. Policy tarik catatan sendiri yang menunggu
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. Pengajuan batal
-- ---------------------------------------------------------------------
create table pengajuan_batal (
  id              uuid primary key default gen_random_uuid(),
  tabel           text not null check (tabel in ('transaksi', 'aset', 'kontribusi', 'distribusi')),
  baris_id        uuid not null,
  alasan          text not null check (btrim(alasan) <> ''),
  status          text not null default 'menunggu' check (status in ('menunggu', 'disetujui', 'ditolak')),
  diajukan_oleh   uuid not null default auth.uid() references profil (id),
  diputuskan_oleh uuid references profil (id),
  alasan_tolak    text,
  dibuat_pada     timestamptz not null default now(),
  diputuskan_pada timestamptz,
  check (diputuskan_oleh is null or diputuskan_oleh <> diajukan_oleh),
  check (status <> 'ditolak' or nullif(btrim(alasan_tolak), '') is not null)
);

-- Satu pengajuan terbuka per catatan
create unique index pengajuan_batal_satu_terbuka on pengajuan_batal (tabel, baris_id)
  where status = 'menunggu';
create index pengajuan_batal_baris on pengajuan_batal (baris_id);

-- A1. Insert: nilai server dipaksa; hanya untuk catatan aktif.
--     Kontribusi otomatis (dari transaksi/aset) dibatalkan lewat catatan sumbernya.
create or replace function pengajuan_batal_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_bentuk text;
begin
  new.diajukan_oleh   := auth.uid();
  new.status          := 'menunggu';
  new.diputuskan_oleh := null;
  new.alasan_tolak    := null;
  new.diputuskan_pada := null;
  new.dibuat_pada     := now();
  new.alasan          := btrim(new.alasan);

  if new.diajukan_oleh is null then
    raise exception 'Pengajuan batal harus dilakukan oleh pengguna yang login';
  end if;
  -- Dicek di sini juga (check constraint baru jalan setelah trigger), sebelum dipakai di query
  if new.tabel is null or new.tabel not in ('transaksi', 'aset', 'kontribusi', 'distribusi') then
    raise exception 'Tabel % tidak bisa diajukan batal', new.tabel;
  end if;

  execute format('select status from %I where id = $1', new.tabel) into v_status using new.baris_id;
  if v_status is null then
    raise exception 'Catatan % % tidak ditemukan', new.tabel, new.baris_id;
  end if;
  if v_status <> 'aktif' then
    raise exception 'Hanya catatan aktif yang bisa diajukan batal (status sekarang: %)', v_status;
  end if;

  if new.tabel = 'kontribusi' then
    select bentuk into v_bentuk from kontribusi where id = new.baris_id;
    if v_bentuk <> 'setor_uang' then
      raise exception 'Kontribusi % dibatalkan lewat transaksi/aset sumbernya', v_bentuk;
    end if;
  end if;
  return new;
end $$;

-- A2. Update: hanya keputusan; pemutus = auth.uid() dan bukan pengaju.
create or replace function pengajuan_batal_jaga() returns trigger
language plpgsql as $$
begin
  if not (old.status = 'menunggu' and new.status in ('disetujui', 'ditolak')) then
    raise exception 'Pengajuan batal % -> % tidak diizinkan', old.status, new.status;
  end if;
  if (to_jsonb(new) - array['status', 'diputuskan_oleh', 'alasan_tolak', 'diputuskan_pada'])
     is distinct from
     (to_jsonb(old) - array['status', 'diputuskan_oleh', 'alasan_tolak', 'diputuskan_pada']) then
    raise exception 'Hanya keputusan yang boleh diubah pada pengajuan batal';
  end if;
  if auth.uid() is null then
    raise exception 'Keputusan harus dilakukan oleh pengguna yang login';
  end if;
  if auth.uid() = old.diajukan_oleh then
    raise exception 'Tidak boleh memutuskan pengajuan batal sendiri';
  end if;

  new.diputuskan_oleh := auth.uid();
  new.diputuskan_pada := now();
  if new.status = 'disetujui' then
    new.alasan_tolak := null;
  else
    new.alasan_tolak := nullif(btrim(new.alasan_tolak), '');
    if new.alasan_tolak is null then
      raise exception 'Alasan menolak pengajuan wajib diisi';
    end if;
  end if;
  return new;
end $$;

-- A3. Disetujui -> catatan dibatalkan. security definer: melewati RLS update catatan
--     (pemutus boleh saja pencatat/pemilik uangnya), tapi jaga_perubahan tetap berjalan
--     dan auth.uid() tetap pemutus, sehingga log_audit mencatat siapa yang menyetujui.
create or replace function pengajuan_batal_terapkan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'menunggu' and new.status = 'disetujui' then
    execute format('update %I set status = ''batal'', alasan_batal = $1 where id = $2', new.tabel)
      using new.alasan, new.baris_id;
  end if;
  return new;
end $$;

create trigger a_pengajuan_batal_insert before insert on pengajuan_batal
  for each row execute function pengajuan_batal_insert();
create trigger a_pengajuan_batal_jaga before update on pengajuan_batal
  for each row execute function pengajuan_batal_jaga();
create trigger pengajuan_batal_terapkan after update on pengajuan_batal
  for each row execute function pengajuan_batal_terapkan();
create trigger audit_pengajuan_batal after insert or update on pengajuan_batal
  for each row execute function catat_audit();

alter table pengajuan_batal enable row level security;
create policy owner_baca_pengajuan_batal on pengajuan_batal for select using (adalah_owner());
create policy owner_ajukan_batal on pengajuan_batal for insert with check (adalah_owner());
create policy owner_putuskan_batal on pengajuan_batal for update
  using (adalah_owner() and status = 'menunggu' and diajukan_oleh <> auth.uid())
  with check (adalah_owner());

revoke delete, truncate on pengajuan_batal from anon, authenticated;
revoke all on pengajuan_batal from anon;

-- ---------------------------------------------------------------------
-- B. jaga_perubahan(): sama dengan migrasi 001, ditambah dua aturan (ditandai BARU)
--    Dipakai juga oleh rnd_catatan (migrasi 003): aturan baru tidak berlaku di sana.
-- ---------------------------------------------------------------------
create or replace function jaga_perubahan() returns trigger
language plpgsql as $$
declare
  boleh   text[] := array['status', 'disetujui_oleh', 'alasan_batal'];
  pemilik text;
begin
  if not ((old.status = 'menunggu' and new.status in ('aktif', 'batal'))
       or (old.status = 'aktif'    and new.status = 'batal')) then
    raise exception 'Transisi status % -> % tidak diizinkan', old.status, new.status;
  end if;

  -- BARU: catatan uang yang sudah aktif hanya bisa dibatalkan lewat pengajuan_batal yang
  -- disetujui owner lain (trigger pengajuan_batal_terapkan = kedalaman trigger > 1).
  if old.status = 'aktif' and new.status = 'batal'
     and tg_table_name in ('transaksi', 'aset', 'kontribusi', 'distribusi')
     and pg_trigger_depth() = 1 then
    raise exception 'Catatan aktif hanya bisa dibatalkan lewat pengajuan batal yang disetujui owner lain';
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
    -- BARU: tolak eksplisit menyetujui catatan/uang sendiri (sebelumnya hanya lewat check constraint).
    -- Kontribusi otomatis disetujui lewat sumbernya (kedalaman > 1) dan sudah dicek di sana.
    if pg_trigger_depth() = 1 then
      pemilik := coalesce(to_jsonb(old) ->> 'dibayar_owner_id', to_jsonb(old) ->> 'owner_id');
      if auth.uid() = old.dicatat_oleh or auth.uid()::text = pemilik then
        raise exception 'Tidak boleh menyetujui catatan atau uang sendiri';
      end if;
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

-- ---------------------------------------------------------------------
-- C. Pencatat menarik catatannya sendiri yang masih menunggu (menunggu -> batal).
--    with check memaksa hasilnya 'batal'. Policy update digabung OR oleh PostgreSQL, tapi
--    menyetujui sendiri tetap ditolak jaga_perubahan() (bagian B) dan check constraint.
-- ---------------------------------------------------------------------
create policy pencatat_tarik_transaksi on transaksi for update
  using (adalah_owner() and dicatat_oleh = auth.uid() and status = 'menunggu')
  with check (adalah_owner() and status = 'batal');
create policy pencatat_tarik_aset on aset for update
  using (adalah_owner() and dicatat_oleh = auth.uid() and status = 'menunggu')
  with check (adalah_owner() and status = 'batal');
create policy pencatat_tarik_kontribusi on kontribusi for update
  using (adalah_owner() and bentuk = 'setor_uang' and dicatat_oleh = auth.uid() and status = 'menunggu')
  with check (adalah_owner() and status = 'batal');
