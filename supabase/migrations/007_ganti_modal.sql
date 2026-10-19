-- =====================================================================
-- Migrasi 007: ganti ke owner (pindah modal antar-owner)
-- Jalankan sekali di SQL Editor Supabase SETELAH migrasi 006.
--
-- Kejadian nyata: Ray membayar belanja usaha Rp300.000 dengan uang pribadi, lalu Rifki dan
-- Ramdani masing-masing mengganti Rp100.000 ke Ray. Uang yang akhirnya terpakai untuk usaha
-- adalah uang bertiga, jadi modal (dan porsi) ikut pindah: Ray -100.000, Rifki +100.000.
-- Total modal usaha tidak berubah; kas usaha tidak berubah (uang berpindah antar-owner).
-- Juga dipakai untuk "bayar bersama di kasir": satu orang mencatat belanjanya, yang lain
-- mencatat bagiannya sebagai ganti ke orang itu.
--
-- Aturan (keputusan Rifki: porsi ikut bergeser):
--   - Satu ganti tertaut ke satu belanja yang dibayar uang pribadi (transaksi klaim modal, atau
--     aset beli_owner) milik penerima, yang masih aktif. Total ganti <= nilai belanja.
--   - Dicatat oleh salah satu pihak (pengganti atau penerima), disetujui pihak lainnya. Owner ketiga
--     tidak terdampak (modal & persennya tetap), jadi tidak ikut menyetujui.
--   - Status awal menunggu; aktif -> batal hanya lewat pengajuan batal (migrasi 004) atau ikut
--     batal otomatis bila belanja sumbernya dibatalkan.
-- =====================================================================

create table ganti_modal (
  id             uuid primary key default gen_random_uuid(),
  tanggal        date not null default current_date,
  penerima_id    uuid not null references profil (id),   -- yang tadinya membayar; modalnya berkurang
  pengganti_id   uuid not null references profil (id),   -- yang mengganti; modalnya bertambah
  jumlah         numeric(14, 2) not null check (jumlah > 0),
  transaksi_id   uuid references transaksi (id),
  aset_id        uuid references aset (id),
  metode         text not null check (metode in ('tunai', 'qris', 'transfer')),
  keterangan     text,
  bukti_path     text,
  status         text not null default 'menunggu' check (status in ('menunggu', 'aktif', 'batal')),
  dicatat_oleh   uuid not null default auth.uid() references profil (id),
  disetujui_oleh uuid references profil (id),
  alasan_batal   text,
  dibuat_pada    timestamptz not null default now(),
  check (penerima_id <> pengganti_id),
  check ((transaksi_id is null) <> (aset_id is null)),
  check (disetujui_oleh is null or (disetujui_oleh in (penerima_id, pengganti_id) and disetujui_oleh <> dicatat_oleh)),
  check (status <> 'batal' or alasan_batal is not null)
);
create index ganti_modal_transaksi on ganti_modal (transaksi_id);
create index ganti_modal_aset on ganti_modal (aset_id);

-- ---------------------------------------------------------------------
-- A. Insert: nilai server dipaksa, sumber divalidasi, tidak melebihi nilai belanja
-- ---------------------------------------------------------------------
create or replace function ganti_modal_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pemilik uuid;
  v_nilai   numeric;
  v_status  text;
  v_sudah   numeric;
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

  if new.transaksi_id is not null then
    select dibayar_owner_id, jumlah, status into v_pemilik, v_nilai, v_status
    from transaksi where id = new.transaksi_id and sumber_dana = 'owner' and klaim = 'modal';
  else
    select dibayar_owner_id, harga_beli, status into v_pemilik, v_nilai, v_status
    from aset where id = new.aset_id and sumber = 'beli_owner';
  end if;
  if v_pemilik is null then
    raise exception 'Ganti hanya untuk belanja yang dibayar uang pribadi sebagai modal';
  end if;
  if v_pemilik <> new.penerima_id then
    raise exception 'Penerima harus owner yang membayar belanja itu';
  end if;
  if v_status <> 'aktif' then
    raise exception 'Belanja harus sudah disetujui (aktif) sebelum diganti';
  end if;

  select coalesce(sum(jumlah), 0) into v_sudah
  from ganti_modal
  where status in ('menunggu', 'aktif')
    and (transaksi_id = new.transaksi_id or aset_id = new.aset_id);
  if v_sudah + new.jumlah > v_nilai then
    raise exception 'Total ganti (%) melebihi nilai belanja (%)', notif_rupiah(v_sudah + new.jumlah), notif_rupiah(v_nilai);
  end if;
  return new;
end $$;

create trigger a_ganti_modal_insert before insert on ganti_modal
  for each row execute function ganti_modal_insert();

-- ---------------------------------------------------------------------
-- B. Update: kolom & transisi lewat jaga_perubahan() (migrasi 001/004), ditambah:
--    - yang menyetujui harus pihak lawan (bukan pencatat, bukan owner ketiga)
--    - aktif -> batal hanya lewat pengajuan batal / ikut sumbernya (kedalaman trigger > 1)
--    Nama 'a_ganti_jaga' jalan sebelum 'a_jaga_ganti_modal' (urutan abjad).
-- ---------------------------------------------------------------------
create or replace function ganti_modal_jaga() returns trigger
language plpgsql as $$
begin
  if pg_trigger_depth() = 1 then
    if old.status = 'menunggu' and new.status = 'aktif'
       and (auth.uid() not in (old.penerima_id, old.pengganti_id) or auth.uid() = old.dicatat_oleh) then
      raise exception 'Ganti disetujui oleh pihak lawannya (yang mengganti atau yang menerima)';
    end if;
    if old.status = 'aktif' and new.status = 'batal' then
      raise exception 'Ganti yang aktif hanya bisa dibatalkan lewat pengajuan batal';
    end if;
  end if;
  return new;
end $$;

create trigger a_ganti_jaga before update on ganti_modal
  for each row execute function ganti_modal_jaga();
create trigger a_jaga_ganti_modal before update on ganti_modal
  for each row execute function jaga_perubahan();
create trigger audit_ganti_modal after insert or update on ganti_modal
  for each row execute function catat_audit();

-- Belanja sumber dibatalkan -> gantinya ikut batal (uangnya kembali diurus di luar aplikasi)
create or replace function ganti_ikut_sumber() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'batal' and old.status <> 'batal' then
    update ganti_modal
       set status = 'batal',
           alasan_batal = 'Belanja sumber dibatalkan: ' || coalesce(new.alasan_batal, '')
     where status <> 'batal'
       and ((tg_table_name = 'transaksi' and transaksi_id = new.id)
            or (tg_table_name = 'aset' and aset_id = new.id));
  end if;
  return new;
end $$;

create trigger ganti_ikut_transaksi after update on transaksi for each row execute function ganti_ikut_sumber();
create trigger ganti_ikut_aset      after update on aset      for each row execute function ganti_ikut_sumber();

-- ---------------------------------------------------------------------
-- C. RLS
-- ---------------------------------------------------------------------
alter table ganti_modal enable row level security;
create policy owner_baca_ganti on ganti_modal for select using (adalah_owner());
create policy owner_catat_ganti on ganti_modal for insert with check (adalah_owner());
-- Pihak lawan menyetujui/menolak
create policy pihak_setujui_ganti on ganti_modal for update
  using (adalah_owner() and status = 'menunggu' and dicatat_oleh <> auth.uid()
         and auth.uid() in (penerima_id, pengganti_id))
  with check (adalah_owner());
-- Pencatat menarik catatannya sendiri yang masih menunggu
create policy pencatat_tarik_ganti on ganti_modal for update
  using (adalah_owner() and dicatat_oleh = auth.uid() and status = 'menunggu')
  with check (adalah_owner() and status = 'batal');
revoke delete, truncate on ganti_modal from anon, authenticated;
revoke all on ganti_modal from anon;

-- ---------------------------------------------------------------------
-- D. Porsi: modal bersih = kontribusi - penarikan + ganti diterima - ganti diberikan
--    Kolom lama tetap (urutan sama), kolom baru pindah_modal di akhir.
-- ---------------------------------------------------------------------
create or replace view v_porsi_kepemilikan with (security_invoker = true) as
with masuk as (
  select owner_id, sum(jumlah) as total from kontribusi where status = 'aktif' group by owner_id
), tarik as (
  select owner_id, sum(jumlah) as total from distribusi
  where status = 'aktif' and jenis = 'penarikan_modal' group by owner_id
), pindah as (
  select owner_id, sum(delta) as total from (
    select pengganti_id as owner_id, jumlah as delta from ganti_modal where status = 'aktif'
    union all
    select penerima_id, -jumlah from ganti_modal where status = 'aktif'
  ) g group by owner_id
), bersih as (
  select p.id as owner_id, p.nama,
         coalesce(m.total, 0) as total_kontribusi,
         coalesce(t.total, 0) as total_penarikan,
         coalesce(g.total, 0) as pindah_modal,
         coalesce(m.total, 0) - coalesce(t.total, 0) + coalesce(g.total, 0) as modal_bersih
  from profil p
  left join masuk m on m.owner_id = p.id
  left join tarik t on t.owner_id = p.id
  left join pindah g on g.owner_id = p.id
  where p.peran = 'owner'
)
select b.owner_id, b.nama, b.total_kontribusi, b.total_penarikan, b.modal_bersih,
       round(100 * b.modal_bersih / nullif(sum(b.modal_bersih) over (), 0), 2) as persen,
       b.pindah_modal
from bersih b;

-- ---------------------------------------------------------------------
-- E. Pengajuan batal (migrasi 004) juga untuk ganti_modal
-- ---------------------------------------------------------------------
alter table pengajuan_batal drop constraint if exists pengajuan_batal_tabel_check;
alter table pengajuan_batal add constraint pengajuan_batal_tabel_check
  check (tabel in ('transaksi', 'aset', 'kontribusi', 'distribusi', 'ganti_modal'));

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
  if new.tabel is null or new.tabel not in ('transaksi', 'aset', 'kontribusi', 'distribusi', 'ganti_modal') then
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

-- ---------------------------------------------------------------------
-- F. Notifikasi (migrasi 006): label + kabar ke pihak lawan saja
-- ---------------------------------------------------------------------
create or replace function notif_label(p_tabel text, r jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  return case p_tabel
    when 'transaksi' then
      (case r ->> 'jenis' when 'pemasukan' then 'Pemasukan ' else 'Pengeluaran ' end)
      || coalesce((select nama from kategori where id = (r ->> 'kategori_id')::uuid), '') || ' '
      || notif_rupiah((r ->> 'jumlah')::numeric)
    when 'aset' then 'Aset ' || (r ->> 'nama') || ' ' || notif_rupiah((r ->> 'harga_beli')::numeric)
    when 'kontribusi' then 'Setor uang ' || notif_rupiah((r ->> 'jumlah')::numeric)
    when 'distribusi' then initcap(replace(r ->> 'jenis', '_', ' ')) || ' ' || notif_rupiah((r ->> 'jumlah')::numeric)
    when 'rnd_catatan' then 'Keputusan R&D (' || (r ->> 'keputusan') || '): '
      || coalesce((select judul from rnd_ide where id = (r ->> 'ide_id')::uuid), '?')
    when 'ganti_modal' then 'Ganti ' || notif_nama((r ->> 'pengganti_id')::uuid) || ' ke '
      || notif_nama((r ->> 'penerima_id')::uuid) || ' ' || notif_rupiah((r ->> 'jumlah')::numeric)
    else p_tabel
  end;
end $$;

create or replace function notif_ganti() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  label    text;
  penerima uuid[];
begin
  begin
    label := notif_label('ganti_modal', to_jsonb(new));
    if tg_op = 'INSERT' then
      -- pihak lawan dari pencatat
      penerima := array[case when new.dicatat_oleh = new.penerima_id then new.pengganti_id else new.penerima_id end];
      perform notif_kirim(penerima, 'Perlu persetujuanmu',
                          notif_nama(new.dicatat_oleh) || ' mencatat ' || label, '/setujui', 'setujui');
    elsif new.status is distinct from old.status then
      select array_agg(x) into penerima
      from unnest(array[new.penerima_id, new.pengganti_id]) x where x is distinct from auth.uid();
      perform notif_kirim(penerima,
                          case when old.status = 'menunggu' and new.status = 'aktif' then 'Disetujui'
                               when old.status = 'menunggu' then 'Ditolak' else 'Dibatalkan' end,
                          label || ' — oleh ' || notif_nama(auth.uid())
                            || case when new.status = 'batal' then ': ' || coalesce(new.alasan_batal, '') else '' end,
                          '/riwayat', 'catatan-' || new.id);
    end if;
  exception when others then
    raise warning 'Notifikasi gagal (ganti tetap tersimpan): %', sqlerrm;
  end;
  return null;
end $$;

create trigger z_notif_ganti after insert or update on ganti_modal
  for each row execute function notif_ganti();

-- ---------------------------------------------------------------------
-- G. Foto bukti transfer ganti: folder ganti/{yyyy-mm}/{uuid}.webp|jpg
-- ---------------------------------------------------------------------
drop policy if exists bukti_insert on storage.objects;
create policy bukti_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bukti'
    and name ~ '^(transaksi|aset|kontribusi|distribusi|rnd|ganti)/[0-9]{4}-(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
  );

revoke all on function notif_label(text, jsonb), notif_ganti(), ganti_ikut_sumber(), ganti_modal_insert()
  from public, anon, authenticated;
