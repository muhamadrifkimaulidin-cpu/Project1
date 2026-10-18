-- =====================================================================
-- Migrasi 005: aset yang dibeli dari kas usaha mengikuti status transaksinya (fitur Catat aset)
-- Jalankan sekali di SQL Editor Supabase SETELAH migrasi 004.
--
-- Form aset (CLAUDE.md §6.4) boleh sekaligus membuat transaksi "Pembelian aset" dan mengisi
-- aset.transaksi_id. Tanpa migrasi ini aset beli_kas langsung 'aktif' walaupun transaksinya masih
-- 'menunggu' (> Rp500.000), ditolak, atau dibatalkan -> aset tercatat padahal uang tidak keluar.
--
-- Aturan:
--   A. Aset bertransaksi: hanya asal beli_kas, transaksi pengeluaran kas usaha yang belum batal,
--      dicatat orang yang sama, satu transaksi untuk satu aset. Status awal = status transaksinya.
--   B. Status transaksi berubah (disetujui / ditolak / ditarik / dibatalkan lewat pengajuan)
--      -> aset ikut berubah dengan alasan yang sama.
--   C. Aset bertransaksi tidak bisa disetujui/dibatalkan/ditarik/diajukan batal sendiri:
--      semua lewat transaksinya (satu antrean, satu keputusan).
-- =====================================================================

create unique index if not exists aset_satu_transaksi on aset (transaksi_id) where transaksi_id is not null;

-- ---------------------------------------------------------------------
-- A. Insert aset bertransaksi. Nama diawali 'z_' supaya jalan setelah a_paksa_insert_aset
--    dan status_awal_aset (urutan abjad), sehingga status akhirnya = status transaksi.
-- ---------------------------------------------------------------------
create or replace function aset_ikut_transaksi_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v transaksi;
begin
  if new.transaksi_id is null then
    return new;
  end if;
  select * into v from transaksi where id = new.transaksi_id;
  if not found then
    raise exception 'Transaksi % tidak ditemukan', new.transaksi_id;
  end if;
  if new.sumber <> 'beli_kas' then
    raise exception 'Hanya aset yang dibeli dari kas usaha yang ditautkan ke transaksi';
  end if;
  if v.jenis <> 'pengeluaran' or v.sumber_dana <> 'kas_usaha' then
    raise exception 'Transaksi aset harus pengeluaran kas usaha';
  end if;
  if v.status = 'batal' then
    raise exception 'Transaksi sudah batal';
  end if;
  if v.dicatat_oleh <> new.dicatat_oleh then
    raise exception 'Aset dan transaksinya harus dicatat orang yang sama';
  end if;
  new.status := v.status;
  return new;
end $$;

create trigger z_aset_ikut_transaksi_insert before insert on aset
  for each row execute function aset_ikut_transaksi_insert();

-- ---------------------------------------------------------------------
-- B. Transaksi berubah status -> aset ikut (trigger di dalam trigger: lolos aturan C dan
--    aturan "aktif -> batal lewat pengajuan" di jaga_perubahan, auth.uid() tetap pelakunya)
-- ---------------------------------------------------------------------
create or replace function aset_ikut_transaksi_sinkron() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    update aset
       set status = new.status,
           alasan_batal = case when new.status = 'batal' then new.alasan_batal end
     where transaksi_id = new.id and status <> new.status;
  end if;
  return new;
end $$;

create trigger aset_ikut_transaksi after update on transaksi
  for each row execute function aset_ikut_transaksi_sinkron();

-- ---------------------------------------------------------------------
-- C. Aset bertransaksi tidak diubah langsung
-- ---------------------------------------------------------------------
create or replace function aset_ikut_transaksi_jaga() returns trigger
language plpgsql as $$
begin
  if old.transaksi_id is not null and pg_trigger_depth() = 1 then
    raise exception 'Aset ini mengikuti transaksinya: setujui atau batalkan transaksinya';
  end if;
  return new;
end $$;

create trigger a_aset_ikut_transaksi_jaga before update on aset
  for each row execute function aset_ikut_transaksi_jaga();

-- Pengajuan batal untuk aset bertransaksi ditolak (ajukan batal transaksinya).
-- Nama 'b_' supaya jalan setelah a_pengajuan_batal_insert (migrasi 004).
create or replace function pengajuan_batal_aset_tertaut() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tabel = 'aset'
     and exists (select 1 from aset where id = new.baris_id and transaksi_id is not null) then
    raise exception 'Aset ini mengikuti transaksinya: ajukan batal transaksinya';
  end if;
  return new;
end $$;

create trigger b_pengajuan_batal_aset_tertaut before insert on pengajuan_batal
  for each row execute function pengajuan_batal_aset_tertaut();
