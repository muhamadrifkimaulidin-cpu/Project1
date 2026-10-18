-- =====================================================================
-- Migrasi 003: modul R&D (ide, catatan perkembangan, keputusan, uji racikan, harga bahan)
-- Jalankan sekali di SQL Editor Supabase SETELAH migrasi 002.
--
-- Aturan:
--   - Hanya owner yang membaca & mencatat. Tidak ada hapus (delete/truncate dicabut).
--   - Catatan progres/uji langsung aktif; pencatatnya boleh membatalkan dengan alasan.
--   - Keputusan (diadopsi/dihentikan) berstatus menunggu dan harus disetujui owner lain;
--     saat disetujui, tahap ide ikut berubah otomatis (tidak bisa diubah manual).
--   - Biaya per cup dihitung dari resep x harga bahan YANG DIBEKUKAN saat uji dicatat.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel
-- ---------------------------------------------------------------------
create table rnd_ide (
  id           uuid primary key default gen_random_uuid(),
  judul        text not null check (btrim(judul) <> ''),
  jalur        text not null check (jalur in ('produk', 'sistem')),
  subjenis     text not null,
  tujuan       text,
  pic_id       uuid not null references profil (id),
  tahap        text not null default 'ide'
               check (tahap in ('ide', 'diuji', 'evaluasi', 'diadopsi', 'dihentikan')),
  status       text not null default 'aktif' check (status in ('aktif', 'batal')),
  alasan_batal text,
  dibuat_oleh  uuid not null default auth.uid() references profil (id),
  dibuat_pada  timestamptz not null default now(),
  check ((jalur = 'produk' and subjenis in ('racikan', 'menu', 'kemasan', 'lainnya'))
      or (jalur = 'sistem' and subjenis in ('sop', 'alat', 'supplier', 'alur_kas', 'lainnya'))),
  check (status <> 'batal' or alasan_batal is not null)
);

-- Harga bahan untuk menghitung biaya per cup. harga_beli untuk 'isi' satuan (mis. Rp30.000 / 1000 gram).
create table rnd_bahan (
  id                uuid primary key default gen_random_uuid(),
  nama              text not null unique check (btrim(nama) <> ''),
  satuan            text not null check (satuan in ('gram', 'ml', 'pcs')),
  harga_beli        numeric(14, 2) not null check (harga_beli >= 0),
  isi               numeric(12, 3) not null check (isi > 0),
  harga_per_satuan  numeric(16, 6) generated always as (harga_beli / isi) stored,
  aktif             boolean not null default true,
  diperbarui_oleh   uuid default auth.uid() references profil (id),
  diperbarui_pada   timestamptz not null default now()
);

-- Linimasa per ide: progres, uji (racikan), keputusan
create table rnd_catatan (
  id             uuid primary key default gen_random_uuid(),
  ide_id         uuid not null references rnd_ide (id),
  tanggal        date not null default current_date,
  jenis          text not null check (jenis in ('progres', 'uji', 'keputusan')),
  isi            text not null check (btrim(isi) <> ''),
  keputusan      text check (keputusan in ('diadopsi', 'dihentikan')),
  jumlah_cup     integer check (jumlah_cup > 0),       -- hasil satu batch uji
  lampiran_path  text,
  status         text not null default 'aktif' check (status in ('menunggu', 'aktif', 'batal')),
  dicatat_oleh   uuid not null default auth.uid() references profil (id),
  disetujui_oleh uuid references profil (id),
  alasan_batal   text,
  dibuat_pada    timestamptz not null default now(),
  check ((jenis = 'keputusan') = (keputusan is not null)),
  check (jenis = 'uji' or jumlah_cup is null),
  check (disetujui_oleh is null or disetujui_oleh <> dicatat_oleh),
  check (status <> 'batal' or alasan_batal is not null)
);
-- Satu keputusan menunggu per ide
create unique index rnd_catatan_satu_keputusan_menunggu
  on rnd_catatan (ide_id) where jenis = 'keputusan' and status = 'menunggu';

-- Resep satu uji. harga_per_satuan dibekukan dari rnd_bahan saat baris dibuat.
create table rnd_resep (
  id               uuid primary key default gen_random_uuid(),
  catatan_id       uuid not null references rnd_catatan (id),
  bahan_id         uuid not null references rnd_bahan (id),
  takaran          numeric(12, 3) not null check (takaran > 0),
  harga_per_satuan numeric(16, 6) not null default 0,
  biaya            numeric(16, 2) generated always as (round(takaran * harga_per_satuan, 2)) stored,
  dicatat_oleh     uuid not null default auth.uid() references profil (id),
  dibuat_pada      timestamptz not null default now()
);

-- Skor uji rasa. Penilai boleh orang luar: cukup nama.
create table rnd_skor (
  id           uuid primary key default gen_random_uuid(),
  catatan_id   uuid not null references rnd_catatan (id),
  penilai      text not null check (btrim(penilai) <> ''),
  skor         integer not null check (skor between 1 and 5),
  komentar     text,
  dicatat_oleh uuid not null default auth.uid() references profil (id),
  dibuat_pada  timestamptz not null default now()
);

-- Pengeluaran R&D bisa ditautkan ke ide (diisi saat mencatat; terkunci setelahnya oleh trigger 001)
alter table transaksi add column if not exists ide_id uuid references rnd_ide (id);

-- ---------------------------------------------------------------------
-- 2. Trigger
-- ---------------------------------------------------------------------
create trigger audit_rnd_ide     after insert or update on rnd_ide     for each row execute function catat_audit();
create trigger audit_rnd_catatan after insert or update on rnd_catatan for each row execute function catat_audit();
create trigger audit_rnd_bahan   after insert or update on rnd_bahan   for each row execute function catat_audit();
create trigger audit_rnd_resep   after insert            on rnd_resep   for each row execute function catat_audit();
create trigger audit_rnd_skor    after insert            on rnd_skor    for each row execute function catat_audit();

-- 2a. Ide: nilai server saat insert; saat update hanya judul/tujuan/PIC/tahap/batal.
--     Tahap final hanya lewat keputusan yang disetujui (trigger di dalam trigger).
create or replace function rnd_ide_insert() returns trigger
language plpgsql as $$
begin
  new.dibuat_oleh  := coalesce(auth.uid(), new.dibuat_oleh);
  new.tahap        := 'ide';
  new.status       := 'aktif';
  new.alasan_batal := null;
  if not exists (select 1 from profil where id = new.pic_id and peran = 'owner' and aktif) then
    raise exception 'PIC harus owner aktif';
  end if;
  return new;
end $$;

create or replace function rnd_ide_jaga() returns trigger
language plpgsql as $$
declare
  boleh text[] := array['judul', 'tujuan', 'pic_id', 'tahap', 'status', 'alasan_batal'];
begin
  if (to_jsonb(new) - boleh) is distinct from (to_jsonb(old) - boleh) then
    raise exception 'Jalur, subjenis, dan pencatat ide tidak bisa diubah';
  end if;
  if old.status = 'batal' then
    raise exception 'Ide yang dibatalkan tidak bisa diubah';
  end if;
  if new.status = 'batal' and nullif(btrim(new.alasan_batal), '') is null then
    raise exception 'Alasan batal wajib diisi';
  end if;
  if new.tahap is distinct from old.tahap then
    if old.tahap in ('diadopsi', 'dihentikan') then
      raise exception 'Ide sudah diputuskan (%), tahap tidak bisa diubah', old.tahap;
    end if;
    if new.tahap in ('diadopsi', 'dihentikan') and pg_trigger_depth() <= 1 then
      raise exception 'Tahap % hanya lewat keputusan yang disetujui owner lain', new.tahap;
    end if;
  end if;
  if new.pic_id is distinct from old.pic_id
     and not exists (select 1 from profil where id = new.pic_id and peran = 'owner' and aktif) then
    raise exception 'PIC harus owner aktif';
  end if;
  return new;
end $$;

create trigger a_rnd_ide_insert before insert on rnd_ide for each row execute function rnd_ide_insert();
create trigger a_rnd_ide_jaga   before update on rnd_ide for each row execute function rnd_ide_jaga();

-- 2b. Catatan: keputusan menunggu, lainnya aktif. Ide harus aktif & belum diputuskan.
create or replace function rnd_catatan_insert() returns trigger
language plpgsql as $$
declare
  v_ide rnd_ide;
begin
  new.dicatat_oleh   := coalesce(auth.uid(), new.dicatat_oleh);
  new.disetujui_oleh := null;
  new.alasan_batal   := null;
  new.status         := case when new.jenis = 'keputusan' then 'menunggu' else 'aktif' end;

  select * into v_ide from rnd_ide where id = new.ide_id;
  if v_ide.status <> 'aktif' then
    raise exception 'Ide sudah dibatalkan';
  end if;
  if new.jenis = 'keputusan' and v_ide.tahap in ('diadopsi', 'dihentikan') then
    raise exception 'Ide sudah diputuskan (%)', v_ide.tahap;
  end if;
  return new;
end $$;

-- Update catatan memakai jaga_perubahan() dari migrasi 001 (kolom & transisi status sama).
create trigger a_rnd_catatan_insert before insert on rnd_catatan for each row execute function rnd_catatan_insert();
create trigger a_jaga_rnd_catatan   before update on rnd_catatan for each row execute function jaga_perubahan();

-- 2c. Keputusan disetujui -> tahap ide ikut berubah
create or replace function rnd_terapkan_keputusan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.jenis = 'keputusan' and old.status = 'menunggu' and new.status = 'aktif' then
    update rnd_ide set tahap = new.keputusan where id = new.ide_id;
  end if;
  return new;
end $$;

create trigger rnd_terapkan_keputusan after update on rnd_catatan
  for each row execute function rnd_terapkan_keputusan();

-- 2d. Resep & skor: hanya untuk catatan uji yang aktif; harga dibekukan dari rnd_bahan
create or replace function rnd_uji_insert() returns trigger
language plpgsql as $$
begin
  new.dicatat_oleh := coalesce(auth.uid(), new.dicatat_oleh);
  if not exists (select 1 from rnd_catatan where id = new.catatan_id and jenis = 'uji' and status = 'aktif') then
    raise exception 'Resep/skor hanya untuk catatan uji yang aktif';
  end if;
  if tg_table_name = 'rnd_resep' then
    select harga_per_satuan into new.harga_per_satuan from rnd_bahan where id = new.bahan_id;
  end if;
  return new;
end $$;

create trigger a_rnd_resep_insert before insert on rnd_resep for each row execute function rnd_uji_insert();
create trigger a_rnd_skor_insert  before insert on rnd_skor  for each row execute function rnd_uji_insert();

-- 2e. Bahan: pencatat perubahan harga diisi server
create or replace function rnd_bahan_stempel() returns trigger
language plpgsql as $$
begin
  new.diperbarui_oleh := coalesce(auth.uid(), new.diperbarui_oleh);
  new.diperbarui_pada := now();
  return new;
end $$;

create trigger a_rnd_bahan_stempel before insert or update on rnd_bahan
  for each row execute function rnd_bahan_stempel();

-- ---------------------------------------------------------------------
-- 3. View (security_invoker: ikut RLS pembaca)
-- ---------------------------------------------------------------------
-- biaya_per_cup      : harga bahan saat uji (dibekukan) -> catatan historis & audit
-- biaya_per_cup_kini : resep yang sama x harga bahan terbaru -> untuk keputusan menu/harga jual
create view v_rnd_uji with (security_invoker = true) as
select c.id as catatan_id, c.ide_id, c.tanggal, c.isi, c.jumlah_cup, c.dicatat_oleh,
       coalesce(r.biaya_batch, 0) as biaya_batch,
       round(r.biaya_batch / c.jumlah_cup) as biaya_per_cup,
       round(r.biaya_batch_kini / c.jumlah_cup) as biaya_per_cup_kini,
       s.skor_rata, coalesce(s.jumlah_penilai, 0) as jumlah_penilai
from rnd_catatan c
left join (select rs.catatan_id, sum(rs.biaya) as biaya_batch,
                  sum(round(rs.takaran * b.harga_per_satuan, 2)) as biaya_batch_kini
           from rnd_resep rs join rnd_bahan b on b.id = rs.bahan_id
           group by rs.catatan_id) r on r.catatan_id = c.id
left join (select catatan_id, round(avg(skor), 2) as skor_rata, count(*) as jumlah_penilai
           from rnd_skor group by catatan_id) s on s.catatan_id = c.id
where c.jenis = 'uji' and c.status = 'aktif';

create view v_rnd_ide with (security_invoker = true) as
select i.*,
       coalesce((select sum(t.jumlah) from transaksi t
                 where t.ide_id = i.id and t.status = 'aktif' and t.jenis = 'pengeluaran'), 0) as biaya_rnd,
       (select count(*) from rnd_catatan c where c.ide_id = i.id and c.status = 'aktif') as jumlah_catatan,
       (select count(*) from rnd_catatan c where c.ide_id = i.id and c.status = 'aktif' and c.jenis = 'uji') as jumlah_uji,
       (select max(c.tanggal) from rnd_catatan c where c.ide_id = i.id and c.status = 'aktif') as terakhir,
       exists (select 1 from rnd_catatan c
               where c.ide_id = i.id and c.jenis = 'keputusan' and c.status = 'menunggu') as keputusan_menunggu
from rnd_ide i;

-- ---------------------------------------------------------------------
-- 4. RLS & hak akses
-- ---------------------------------------------------------------------
alter table rnd_ide     enable row level security;
alter table rnd_bahan   enable row level security;
alter table rnd_catatan enable row level security;
alter table rnd_resep   enable row level security;
alter table rnd_skor    enable row level security;

create policy owner_baca_rnd_ide     on rnd_ide     for select using (adalah_owner());
create policy owner_baca_rnd_bahan   on rnd_bahan   for select using (adalah_owner());
create policy owner_baca_rnd_catatan on rnd_catatan for select using (adalah_owner());
create policy owner_baca_rnd_resep   on rnd_resep   for select using (adalah_owner());
create policy owner_baca_rnd_skor    on rnd_skor    for select using (adalah_owner());

create policy owner_catat_rnd_ide     on rnd_ide     for insert with check (adalah_owner());
create policy owner_catat_rnd_bahan   on rnd_bahan   for insert with check (adalah_owner());
create policy owner_catat_rnd_catatan on rnd_catatan for insert with check (adalah_owner());
create policy owner_catat_rnd_resep   on rnd_resep   for insert with check (adalah_owner());
create policy owner_catat_rnd_skor    on rnd_skor    for insert with check (adalah_owner());

create policy owner_ubah_rnd_ide   on rnd_ide   for update using (adalah_owner()) with check (adalah_owner());
create policy owner_ubah_rnd_bahan on rnd_bahan for update using (adalah_owner()) with check (adalah_owner());
-- Catatan: owner lain menyetujui/menolak keputusan; pencatat boleh membatalkan catatannya sendiri.
-- (Pencatat tidak bisa menyetujui keputusannya sendiri: check disetujui_oleh <> dicatat_oleh.)
create policy owner_ubah_rnd_catatan on rnd_catatan for update
  using (adalah_owner()
         and ((jenis = 'keputusan' and status = 'menunggu' and dicatat_oleh <> auth.uid())
              or dicatat_oleh = auth.uid()))
  with check (adalah_owner());

revoke delete, truncate on rnd_ide, rnd_bahan, rnd_catatan, rnd_resep, rnd_skor from anon, authenticated;
revoke all on rnd_ide, rnd_bahan, rnd_catatan, rnd_resep, rnd_skor, v_rnd_uji, v_rnd_ide from anon;

-- ---------------------------------------------------------------------
-- 5. Storage: lampiran R&D di bucket bukti, folder rnd/{yyyy-mm}/{uuid}.webp|jpg
-- ---------------------------------------------------------------------
drop policy if exists bukti_insert on storage.objects;
create policy bukti_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bukti'
    and name ~ '^(transaksi|aset|kontribusi|distribusi|rnd)/[0-9]{4}-(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
  );
