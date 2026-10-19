-- =====================================================================
-- Migrasi 009: patungan — tautan "menanggung belanja lain" saat menolak
-- Jalankan sekali di SQL Editor Supabase SETELAH migrasi 008.
--
-- Keputusan Rifki (19 Okt 2026, no. 7a): yang ditagih boleh menolak sambil menautkan belanja uang
-- pribadinya sendiri yang ia tanggung (mis. "tidak ikut gelas, saya sudah beli sedotan").
-- Tautan ini keterangan audit saja: modalnya sudah dihitung dari belanja itu sendiri, jadi tidak ada
-- yang terhitung dua kali. Tidak wajib.
-- =====================================================================

alter table patungan
  add column tanggung_transaksi_id uuid references transaksi (id),
  add column tanggung_aset_id      uuid references aset (id),
  add constraint patungan_tanggung_satu check (tanggung_transaksi_id is null or tanggung_aset_id is null),
  add constraint patungan_tanggung_saat_tolak
    check (status = 'ditolak' or (tanggung_transaksi_id is null and tanggung_aset_id is null));

-- v_patungan memakai p.*: dibuat ulang supaya kolom baru ikut
drop view v_patungan;
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
revoke all on v_patungan from anon;

-- Insert: kolom tautan selalu kosong saat tagihan dibuat
create or replace function patungan_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  new.status             := 'terbuka';
  new.alasan             := null;
  new.tanggung_transaksi_id := null;
  new.tanggung_aset_id      := null;
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

-- Update: tautan hanya saat menolak, harus belanja uang pribadi (modal) milik yang menolak
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

  if new.status <> 'ditolak' and (new.tanggung_transaksi_id is not null or new.tanggung_aset_id is not null) then
    raise exception 'Belanja yang ditanggung hanya diisi saat menolak';
  end if;
  if new.tanggung_transaksi_id is not null or new.tanggung_aset_id is not null then
    -- dibaca dengan hak pengguna (RLS owner), bukan lewat fungsi internal
    select dibayar_owner_id as pemilik, status into v from transaksi
     where id = new.tanggung_transaksi_id and sumber_dana = 'owner' and klaim = 'modal'
    union all
    select dibayar_owner_id, status from aset where id = new.tanggung_aset_id and sumber = 'beli_owner';
    if v.pemilik is distinct from old.tertagih_id or v.status = 'batal' then
      raise exception 'Belanja yang ditanggung harus belanja uang pribadi (modal) milik yang menolak dan belum batal';
    end if;
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
