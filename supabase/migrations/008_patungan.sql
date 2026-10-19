-- =====================================================================
-- Migrasi 008: minta patungan (tagihan ganti antar-owner, seperti split bill)
-- Jalankan sekali di SQL Editor Supabase SETELAH migrasi 007.
--
-- Kejadian nyata: Rifki membayar belanja Rp300.000 dengan uang pribadi dan minta Ray & Ramdani
-- masing-masing patungan Rp100.000. Ray sudah ganti, Ramdani belum: aplikasi harus tahu itu,
-- mengingatkan Ramdani, dan menampilkan ke Rifki siapa yang belum.
--
-- Pemisahan tugas:
--   patungan    = TAGIHAN (janji). Tidak memindahkan uang maupun porsi; tidak perlu persetujuan.
--   ganti_modal = uang yang benar-benar pindah (migrasi 007). Membayar patungan = mencatat ganti
--                 dengan patungan_id; porsi bergeser setelah pihak lawan menyetujui, seperti biasa.
--   Sisa tagihan dihitung, tidak disimpan: jumlah - ganti tertaut (lihat v_patungan).
--
-- Keputusan Rifki (19 Okt 2026):
--   1a. Patungan diminta saat mencatat belanja atau belakangan dari Riwayat.
--   2a. Yang ditagih boleh menolak ("tidak ikut") dengan alasan; sisanya tetap modal penagih.
--   3b. Pengingat otomatis tiap 3 hari (pg_cron, bagian H) + tombol Ingatkan manual.
--   4a. Boleh dibayar sebagian (beberapa ganti untuk satu tagihan).
-- =====================================================================

create table patungan (
  id                 uuid primary key default gen_random_uuid(),
  transaksi_id       uuid references transaksi (id),
  aset_id            uuid references aset (id),
  penagih_id         uuid not null references profil (id),  -- yang membayar belanja duluan
  tertagih_id        uuid not null references profil (id),  -- yang diminta ikut menanggung
  jumlah             numeric(14, 2) not null check (jumlah > 0),
  status             text not null default 'terbuka' check (status in ('terbuka', 'ditolak', 'dibatalkan')),
  alasan             text,                                   -- wajib bila ditolak/dibatalkan
  diputuskan_pada    timestamptz,
  pengingat_terakhir timestamptz not null default now(),
  dibuat_pada        timestamptz not null default now(),
  check (penagih_id <> tertagih_id),
  check ((transaksi_id is null) <> (aset_id is null)),
  check (status = 'terbuka' or nullif(btrim(alasan), '') is not null)
);
-- Satu tagihan terbuka per orang per belanja (tambah jumlah = batalkan lalu minta ulang)
create unique index patungan_satu_terbuka on patungan (coalesce(transaksi_id, aset_id), tertagih_id)
  where status = 'terbuka';
create index patungan_tertagih on patungan (tertagih_id) where status = 'terbuka';

alter table ganti_modal add column patungan_id uuid references patungan (id);
create index ganti_modal_patungan on ganti_modal (patungan_id);

-- Nilai & status belanja sumber (transaksi klaim modal / aset beli_owner), dipakai beberapa fungsi
create or replace function patungan_sumber(p_transaksi uuid, p_aset uuid,
  out pemilik uuid, out nilai numeric, out status text)
language sql stable security definer set search_path = public as $$
  select dibayar_owner_id, jumlah, status from transaksi
   where p_transaksi is not null and id = p_transaksi and sumber_dana = 'owner' and klaim = 'modal'
  union all
  select dibayar_owner_id, harga_beli, status from aset
   where p_aset is not null and id = p_aset and sumber = 'beli_owner'
$$;

-- Sudah terpakai dari nilai belanja: semua ganti yang berlaku + sisa tagihan patungan terbuka
-- (selain p_kecuali). Menjaga: total ganti + tagihan yang belum dibayar <= nilai belanja.
create or replace function patungan_terpakai(p_transaksi uuid, p_aset uuid, p_kecuali uuid default null)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(g.jumlah) from ganti_modal g
                    where g.status in ('menunggu', 'aktif')
                      and (g.transaksi_id = p_transaksi or g.aset_id = p_aset)), 0)
       + coalesce((select sum(greatest(p.jumlah - coalesce((select sum(g.jumlah) from ganti_modal g
                                                              where g.patungan_id = p.id
                                                                and g.status in ('menunggu', 'aktif')), 0), 0))
                     from patungan p
                    where p.status = 'terbuka' and p.id is distinct from p_kecuali
                      and (p.transaksi_id = p_transaksi or p.aset_id = p_aset)), 0)
$$;

-- ---------------------------------------------------------------------
-- A. Ringkasan per tagihan: dibayar (ganti aktif), diproses (ganti menunggu), sisa, status efektif
-- ---------------------------------------------------------------------
create view v_patungan with (security_invoker = true) as
select p.*,
       coalesce(g.aktif, 0) as dibayar,
       coalesce(g.menunggu, 0) as diproses,
       greatest(p.jumlah - coalesce(g.aktif, 0) - coalesce(g.menunggu, 0), 0) as sisa,
       case when p.status <> 'terbuka' then p.status
            when coalesce(g.aktif, 0) >= p.jumlah then 'lunas'
            else 'terbuka' end as status_efektif
from patungan p
left join (
  select patungan_id,
         sum(jumlah) filter (where status = 'aktif') as aktif,
         sum(jumlah) filter (where status = 'menunggu') as menunggu
  from ganti_modal where patungan_id is not null group by patungan_id
) g on g.patungan_id = p.id;

-- ---------------------------------------------------------------------
-- B. Insert: hanya pembayar belanja yang meminta; tidak melebihi nilai belanja
-- ---------------------------------------------------------------------
create or replace function patungan_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  new.status             := 'terbuka';
  new.alasan             := null;
  new.diputuskan_pada    := null;
  new.pengingat_terakhir := now();
  new.dibuat_pada        := now();

  select * into s from patungan_sumber(new.transaksi_id, new.aset_id);
  if s.pemilik is null then
    raise exception 'Patungan hanya untuk belanja yang dibayar uang pribadi sebagai modal';
  end if;
  if auth.uid() is distinct from s.pemilik then
    raise exception 'Patungan diminta oleh owner yang membayar belanja itu';
  end if;
  new.penagih_id := s.pemilik;
  if s.status = 'batal' then
    raise exception 'Belanja ini sudah batal';
  end if;
  if not exists (select 1 from profil where id = new.tertagih_id and peran = 'owner' and aktif) then
    raise exception 'Yang diminta patungan harus owner aktif';
  end if;
  if patungan_terpakai(new.transaksi_id, new.aset_id) + new.jumlah > s.nilai then
    raise exception 'Total patungan dan ganti (%) melebihi nilai belanja (%)',
      notif_rupiah(patungan_terpakai(new.transaksi_id, new.aset_id) + new.jumlah), notif_rupiah(s.nilai);
  end if;
  return new;
end $$;

create trigger a_patungan_insert before insert on patungan
  for each row execute function patungan_insert();

-- ---------------------------------------------------------------------
-- C. Update dari aplikasi: hanya tolak (oleh yang ditagih) / batalkan (oleh penagih), dari terbuka.
--    Perubahan oleh sistem (fungsi security definer: pengingat, ikut batal) tidak lewat jalur ini.
-- ---------------------------------------------------------------------
-- Bukan security definer: current_user membedakan aplikasi (authenticated) dari fungsi sistem.
create or replace function patungan_jaga() returns trigger
language plpgsql set search_path = public as $$
declare
  v record;
begin
  if old.status <> 'terbuka' then
    raise exception 'Patungan yang sudah % tidak bisa diubah', old.status;
  end if;
  if current_user not in ('authenticated', 'anon') then
    return new; -- sistem
  end if;

  if (new.id, new.transaksi_id, new.aset_id, new.penagih_id, new.tertagih_id, new.jumlah,
      new.pengingat_terakhir, new.dibuat_pada)
     is distinct from
     (old.id, old.transaksi_id, old.aset_id, old.penagih_id, old.tertagih_id, old.jumlah,
      old.pengingat_terakhir, old.dibuat_pada) then
    raise exception 'Hanya status dan alasan patungan yang boleh diubah';
  end if;
  if new.status = old.status then
    raise exception 'Tidak ada perubahan status';
  end if;
  if new.status = 'ditolak' and auth.uid() is distinct from old.tertagih_id then
    raise exception 'Hanya yang ditagih yang bisa menolak patungan';
  end if;
  if new.status = 'dibatalkan' and auth.uid() is distinct from old.penagih_id then
    raise exception 'Hanya yang meminta yang bisa membatalkan patungan';
  end if;

  select * into v from v_patungan where id = old.id;
  if v.diproses > 0 then
    raise exception 'Masih ada ganti % yang menunggu persetujuan untuk tagihan ini — selesaikan dulu',
      notif_rupiah(v.diproses);
  end if;
  if v.dibayar >= old.jumlah then
    raise exception 'Tagihan ini sudah lunas';
  end if;

  new.alasan          := btrim(new.alasan);
  new.diputuskan_pada := now();
  return new;
end $$;

create trigger a_patungan_jaga before update on patungan
  for each row execute function patungan_jaga();
create trigger audit_patungan after insert or update on patungan
  for each row execute function catat_audit();

-- Belanja sumber dibatalkan -> tagihan terbukanya ikut dibatalkan
create or replace function patungan_ikut_sumber() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'batal' and old.status <> 'batal' then
    update patungan
       set status = 'dibatalkan',
           alasan = 'Belanja sumber dibatalkan: ' || coalesce(new.alasan_batal, ''),
           diputuskan_pada = now()
     where status = 'terbuka'
       and ((tg_table_name = 'transaksi' and transaksi_id = new.id)
            or (tg_table_name = 'aset' and aset_id = new.id));
  end if;
  return new;
end $$;

create trigger patungan_ikut_transaksi after update on transaksi for each row execute function patungan_ikut_sumber();
create trigger patungan_ikut_aset      after update on aset      for each row execute function patungan_ikut_sumber();

-- ---------------------------------------------------------------------
-- D. Ganti (migrasi 007) + patungan: ganti dari yang ditagih otomatis tertaut ke tagihannya,
--    tidak boleh melebihi sisa tagihan; ganti lepas tidak boleh memakan jatah tagihan terbuka.
-- ---------------------------------------------------------------------
create or replace function ganti_modal_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s     record;
  v_p   record;
  v_sisa numeric;
begin
  new.dicatat_oleh   := coalesce(auth.uid(), new.dicatat_oleh);
  new.status         := 'menunggu';
  new.disetujui_oleh := null;
  new.alasan_batal   := null;

  if new.dicatat_oleh not in (new.penerima_id, new.pengganti_id) then
    raise exception 'Ganti dicatat oleh yang mengganti atau yang menerima';
  end if;
  if not exists (select 1 from profil where id = new.pengganti_id and peran = 'owner' and aktif)
     or not exists (select 1 from profil where id = new.penerima_id and peran = 'owner' and aktif) then
    raise exception 'Penerima dan pengganti harus owner aktif';
  end if;

  select * into s from patungan_sumber(new.transaksi_id, new.aset_id);
  if s.pemilik is null then
    raise exception 'Ganti hanya untuk belanja yang dibayar uang pribadi sebagai modal';
  end if;
  if s.pemilik <> new.penerima_id then
    raise exception 'Penerima harus owner yang membayar belanja itu';
  end if;
  if s.status <> 'aktif' then
    raise exception 'Belanja harus sudah disetujui (aktif) sebelum diganti';
  end if;

  -- Tagihan patungan terbuka milik pengganti untuk belanja ini -> tautkan otomatis
  if new.patungan_id is null then
    select id into new.patungan_id from patungan
     where status = 'terbuka' and tertagih_id = new.pengganti_id
       and (transaksi_id = new.transaksi_id or aset_id = new.aset_id);
  end if;

  if new.patungan_id is not null then
    select * into v_p from v_patungan where id = new.patungan_id;
    if v_p.id is null or v_p.status <> 'terbuka'
       or v_p.tertagih_id <> new.pengganti_id or v_p.penagih_id <> new.penerima_id
       or v_p.transaksi_id is distinct from new.transaksi_id or v_p.aset_id is distinct from new.aset_id then
      raise exception 'Tagihan patungan tidak cocok dengan ganti ini';
    end if;
    if new.jumlah > v_p.sisa then
      raise exception 'Melebihi sisa tagihan patungan (%)', notif_rupiah(v_p.sisa);
    end if;
    -- jatahnya sudah dihitung saat tagihan dibuat, jadi tidak menambah total terpakai
  else
    v_sisa := s.nilai - patungan_terpakai(new.transaksi_id, new.aset_id);
    if new.jumlah > v_sisa then
      raise exception 'Total ganti (%) melebihi nilai belanja (%) — termasuk patungan yang sudah diminta',
        notif_rupiah(s.nilai - v_sisa + new.jumlah), notif_rupiah(s.nilai);
    end if;
  end if;
  return new;
end $$;

-- patungan_id tidak boleh diubah setelah ganti dicatat (jaga_perubahan menjaga kolom lain)
create or replace function ganti_patungan_tetap() returns trigger
language plpgsql as $$
begin
  if new.patungan_id is distinct from old.patungan_id then
    raise exception 'Tautan patungan pada ganti tidak bisa diubah';
  end if;
  return new;
end $$;
create trigger a_ganti_patungan_tetap before update on ganti_modal
  for each row execute function ganti_patungan_tetap();

-- ---------------------------------------------------------------------
-- E. RLS
-- ---------------------------------------------------------------------
alter table patungan enable row level security;
create policy owner_baca_patungan on patungan for select using (adalah_owner());
create policy owner_minta_patungan on patungan for insert with check (adalah_owner());
create policy pihak_putuskan_patungan on patungan for update
  using (adalah_owner() and status = 'terbuka' and auth.uid() in (penagih_id, tertagih_id))
  with check (adalah_owner());
revoke delete, truncate on patungan from anon, authenticated;
revoke all on patungan from anon;
revoke all on v_patungan from anon;

-- ---------------------------------------------------------------------
-- F. Notifikasi (migrasi 006)
-- ---------------------------------------------------------------------
create or replace function patungan_label(p patungan) returns text
language sql stable security definer set search_path = public as $$
  select case when p.transaksi_id is not null
              then notif_label('transaksi', (select to_jsonb(t) from transaksi t where t.id = p.transaksi_id))
              else notif_label('aset', (select to_jsonb(a) from aset a where a.id = p.aset_id)) end
$$;

create or replace function notif_patungan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform notif_kirim(array[new.tertagih_id], 'Diminta patungan',
        notif_nama(new.penagih_id) || ' minta patungan ' || notif_rupiah(new.jumlah) || ' untuk '
          || patungan_label(new), '/beranda#patungan', 'patungan-' || new.id);
    elsif new.status = 'ditolak' and old.status = 'terbuka' then
      perform notif_kirim(array[new.penagih_id], 'Patungan ditolak',
        notif_nama(new.tertagih_id) || ' tidak ikut patungan ' || notif_rupiah(new.jumlah) || ': ' || new.alasan,
        '/beranda#patungan', 'patungan-' || new.id);
    elsif new.status = 'dibatalkan' and old.status = 'terbuka' then
      perform notif_kirim(array[new.tertagih_id], 'Patungan dibatalkan',
        'Tagihan ' || notif_rupiah(new.jumlah) || ' dari ' || notif_nama(new.penagih_id) || ' dibatalkan: ' || new.alasan,
        '/beranda#patungan', 'patungan-' || new.id);
    end if;
  exception when others then
    raise warning 'Notifikasi gagal (patungan tetap tersimpan): %', sqlerrm;
  end;
  return null;
end $$;

create trigger z_notif_patungan after insert or update on patungan
  for each row execute function notif_patungan();

-- ---------------------------------------------------------------------
-- G. Pengingat: manual (tombol Ingatkan, oleh penagih) dan otomatis (tiap 3 hari)
--    Hanya tagihan terbuka yang masih ada sisa belum dibayar dan belanjanya sudah aktif
--    (belanja yang masih menunggu belum bisa diganti).
-- ---------------------------------------------------------------------
create or replace function ingatkan_patungan(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v record;
begin
  select * into v from v_patungan where id = p_id;
  if v.id is null or v.penagih_id is distinct from auth.uid() then
    raise exception 'Hanya yang meminta yang bisa mengingatkan';
  end if;
  if v.status_efektif <> 'terbuka' or v.sisa <= 0 then
    raise exception 'Tidak ada sisa tagihan yang perlu diingatkan';
  end if;
  update patungan set pengingat_terakhir = now() where id = p_id;
  perform notif_kirim(array[v.tertagih_id], 'Pengingat patungan',
    notif_nama(v.penagih_id) || ' mengingatkan: sisa patungan ' || notif_rupiah(v.sisa) || ' untuk '
      || patungan_label((select p from patungan p where p.id = p_id)),
    '/beranda#patungan', 'patungan-' || p_id);
end $$;

-- Dipanggil pg_cron sekali sehari; satu notifikasi per orang yang ditagih. Mengembalikan jumlah notifikasi.
create or replace function kirim_pengingat_patungan() returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select v.tertagih_id, array_agg(v.id) as ids, sum(v.sisa) as total,
           string_agg(notif_rupiah(v.sisa) || ' ke ' || notif_nama(v.penagih_id), ', ' order by v.dibuat_pada) as rincian
    from v_patungan v
    join lateral patungan_sumber(v.transaksi_id, v.aset_id) s on true
    where v.status_efektif = 'terbuka' and v.sisa > 0 and s.status = 'aktif'
      and v.pengingat_terakhir <= now() - interval '3 days'
    group by v.tertagih_id
  loop
    update patungan set pengingat_terakhir = now() where id = any (r.ids);
    perform notif_kirim(array[r.tertagih_id], 'Patungan belum lunas',
      'Total ' || notif_rupiah(r.total) || ': ' || r.rincian, '/beranda#patungan', 'pengingat-patungan');
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function patungan_sumber(uuid, uuid), patungan_terpakai(uuid, uuid, uuid), patungan_insert(),
  patungan_jaga(), patungan_ikut_sumber(), ganti_patungan_tetap(), patungan_label(patungan),
  notif_patungan(), kirim_pengingat_patungan()
  from public, anon, authenticated;
revoke all on function ingatkan_patungan(uuid) from public, anon;
grant execute on function ingatkan_patungan(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- H. Jadwal pengingat harian 02:00 UTC (= 09:00 WIB) lewat pg_cron.
--    Aktifkan dulu: Dashboard -> Integrations -> Cron -> Enable. Bila belum aktif, migrasi tetap
--    jalan; jalankan ulang blok ini setelah pg_cron diaktifkan.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $j$select cron.schedule('pengingat-patungan', '0 2 * * *', 'select public.kirim_pengingat_patungan()')$j$;
    raise notice 'Jadwal pengingat-patungan terpasang (tiap hari 09:00 WIB).';
  else
    raise notice 'pg_cron belum aktif: pengingat otomatis belum terjadwal.';
  end if;
end $$;
