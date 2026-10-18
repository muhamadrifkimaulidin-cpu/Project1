-- =====================================================================
-- Migrasi 006: notifikasi push ke HP owner
-- Jalankan sekali di SQL Editor Supabase SETELAH migrasi 005.
--
-- Alur: trigger di database -> pg_net POST ke /api/notifikasi (Vercel) dengan kunci rahasia
--       -> Vercel mengirim Web Push ke HP penerima.
-- Notifikasi dipicu database (bukan aplikasi) supaya: hanya data yang benar-benar tersimpan yang
-- memicu notifikasi, pengguna tidak bisa mengirim notifikasi palsu, dan kegagalan kirim tidak
-- pernah menggagalkan pencatatan.
--
-- Kejadian (keputusan Rifki):
--   1. Catatan baru berstatus menunggu   -> owner yang boleh menyetujui
--   2. Pengajuan batal baru              -> owner selain pengaju
--   3. Catatan disetujui/ditolak/dibatalkan, pengajuan diputuskan -> pencatat & pemilik uang / pengaju
-- Tanpa jam tenang.
--
-- Konfigurasi (TIDAK ada di file ini, diisi Rifki lewat Vault):
--   notif_url    = https://<domain produksi>/api/notifikasi
--   notif_secret = kunci acak yang sama dengan env NOTIF_SECRET di Vercel
-- Selama keduanya belum diisi, trigger tidak mengirim apa pun.
-- =====================================================================

-- pg_net untuk HTTP dari database (di Supabase: Database -> Extensions). Uji lokal memakai tiruan.
do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net tidak dipasang (%), lewati — hanya wajar di uji lokal', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- A. Langganan push per perangkat
-- ---------------------------------------------------------------------
create table push_langganan (
  id          uuid primary key default gen_random_uuid(),
  profil_id   uuid not null references profil (id),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  perangkat   text,
  dibuat_pada timestamptz not null default now()
);

alter table push_langganan enable row level security;
create policy push_baca_sendiri on push_langganan for select using (profil_id = auth.uid());
-- Tulis hanya lewat fungsi di bawah (bukan catatan keuangan, jadi boleh dihapus pemiliknya)
revoke insert, update, delete, truncate on push_langganan from anon, authenticated;
revoke all on push_langganan from anon;

-- Daftarkan perangkat untuk saya. Endpoint yang sama milik orang lain (HP dipakai login bergantian)
-- dipindah ke saya, supaya notifikasi tidak nyasar ke owner yang sudah keluar dari HP itu.
create or replace function daftar_push(p_endpoint text, p_p256dh text, p_auth text, p_perangkat text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not adalah_owner() then
    raise exception 'Hanya owner yang bisa menerima notifikasi';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'Endpoint push tidak sah';
  end if;
  delete from push_langganan where endpoint = p_endpoint;
  insert into push_langganan (profil_id, endpoint, p256dh, auth, perangkat)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_perangkat, 200));
end $$;

create or replace function hapus_push(p_endpoint text)
returns void
language sql security definer set search_path = public as $$
  delete from push_langganan where endpoint = p_endpoint and profil_id = auth.uid();
$$;

revoke all on function daftar_push(text, text, text, text), hapus_push(text) from public, anon;
grant execute on function daftar_push(text, text, text, text), hapus_push(text) to authenticated;

-- ---------------------------------------------------------------------
-- B. Pengirim
-- ---------------------------------------------------------------------
create or replace function notif_rupiah(x numeric) returns text
language sql immutable as $$
  select 'Rp' || replace(to_char(round(coalesce(x, 0)), 'FM999,999,999,990'), ',', '.')
$$;

create or replace function notif_nama(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nama from profil where id = p), '?')
$$;

-- Label singkat satu catatan, mis. "Pengeluaran Bahan uji racikan Rp750.000"
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
    else p_tabel
  end;
end $$;

-- Kirim satu notifikasi ke daftar profil. Diam (tanpa error) bila belum dikonfigurasi,
-- tidak ada penerima, atau penerima belum mengaktifkan notifikasi.
create or replace function notif_kirim(p_penerima uuid[], p_judul text, p_isi text, p_url text, p_tag text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
  v_subs   jsonb;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'notif_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notif_secret';
  if v_url is null or v_secret is null or coalesce(cardinality(p_penerima), 0) = 0 then
    return;
  end if;

  select jsonb_agg(jsonb_build_object('endpoint', l.endpoint, 'p256dh', l.p256dh, 'auth', l.auth))
    into v_subs
  from push_langganan l
  join profil p on p.id = l.profil_id and p.peran = 'owner' and p.aktif
  where l.profil_id = any (p_penerima);
  if v_subs is null then
    return;
  end if;

  -- pg_net mengantre permintaan; dikirim setelah transaksi commit (rollback = tidak terkirim)
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('langganan', v_subs, 'judul', p_judul, 'isi', left(p_isi, 300),
                                  'url', p_url, 'tag', p_tag),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-3rally-secret', v_secret)
  );
end $$;

-- ---------------------------------------------------------------------
-- C. Trigger catatan: transaksi, aset, kontribusi, distribusi, rnd_catatan
-- ---------------------------------------------------------------------
create or replace function notif_catatan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r        jsonb := to_jsonb(new);
  pemilik  uuid  := coalesce(r ->> 'dibayar_owner_id', r ->> 'owner_id')::uuid;
  pelaku   uuid  := auth.uid();
  label    text;
  penerima uuid[];
  judul    text;
begin
  begin
    -- Catatan turunan mengikuti sumbernya: cukup satu notifikasi dari sumbernya
    if tg_table_name = 'kontribusi' and r ->> 'bentuk' <> 'setor_uang' then return null; end if;
    if tg_table_name = 'aset' and r ->> 'transaksi_id' is not null then return null; end if;
    if tg_table_name = 'rnd_catatan' and r ->> 'jenis' <> 'keputusan' then return null; end if;

    label := notif_label(tg_table_name, r);

    if tg_op = 'INSERT' then
      if new.status <> 'menunggu' then return null; end if;
      -- Sama dengan aturan persetujuan silang: bukan pencatat, bukan pemilik uang
      select array_agg(id) into penerima
      from profil
      where peran = 'owner' and aktif and id <> new.dicatat_oleh and id is distinct from pemilik;
      perform notif_kirim(penerima, 'Perlu persetujuanmu',
                          notif_nama(new.dicatat_oleh) || ' mencatat ' || label, '/setujui', 'setujui');

    elsif new.status is distinct from old.status then
      select array_agg(distinct x) into penerima
      from unnest(array[new.dicatat_oleh, pemilik]) x
      where x is not null and x is distinct from pelaku;
      judul := case
        when old.status = 'menunggu' and new.status = 'aktif' then 'Disetujui'
        when old.status = 'menunggu' then 'Ditolak'
        else 'Dibatalkan'
      end;
      perform notif_kirim(penerima, judul,
                          label || ' — oleh ' || notif_nama(pelaku)
                            || case when new.status = 'batal' then ': ' || coalesce(new.alasan_batal, '') else '' end,
                          '/riwayat', 'catatan-' || new.id);
    end if;
  exception when others then
    raise warning 'Notifikasi gagal (catatan tetap tersimpan): %', sqlerrm;
  end;
  return null;
end $$;

create trigger z_notif_transaksi   after insert or update on transaksi   for each row execute function notif_catatan();
create trigger z_notif_aset        after insert or update on aset        for each row execute function notif_catatan();
create trigger z_notif_kontribusi  after insert or update on kontribusi  for each row execute function notif_catatan();
create trigger z_notif_distribusi  after insert or update on distribusi  for each row execute function notif_catatan();
create trigger z_notif_rnd_catatan after insert or update on rnd_catatan for each row execute function notif_catatan();

-- ---------------------------------------------------------------------
-- D. Trigger pengajuan batal
-- ---------------------------------------------------------------------
create or replace function notif_pengajuan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target   jsonb;
  label    text;
  penerima uuid[];
begin
  begin
    execute format('select to_jsonb(t) from %I t where id = $1', new.tabel) into target using new.baris_id;
    label := notif_label(new.tabel, target);

    if tg_op = 'INSERT' then
      select array_agg(id) into penerima
      from profil where peran = 'owner' and aktif and id <> new.diajukan_oleh;
      perform notif_kirim(penerima, 'Pengajuan batal',
                          notif_nama(new.diajukan_oleh) || ' mengajukan batal ' || label || ': ' || new.alasan,
                          '/setujui', 'setujui');

    elsif new.status is distinct from old.status then
      -- Pencatat & pemilik uang sudah dikabari "Dibatalkan" oleh trigger catatan; jangan dobel
      select array_agg(x) into penerima
      from unnest(array[new.diajukan_oleh]) x
      where x is distinct from auth.uid()
        and not (new.status = 'disetujui'
                 and (x = (target ->> 'dicatat_oleh')::uuid
                      or x is not distinct from coalesce(target ->> 'dibayar_owner_id', target ->> 'owner_id')::uuid));
      perform notif_kirim(penerima,
                          case new.status when 'disetujui' then 'Pembatalan disetujui' else 'Pembatalan ditolak' end,
                          label || ' — oleh ' || notif_nama(auth.uid())
                            || case when new.status = 'ditolak' then ': ' || coalesce(new.alasan_tolak, '') else '' end,
                          '/riwayat', 'pengajuan-' || new.id);
    end if;
  exception when others then
    raise warning 'Notifikasi gagal (pengajuan tetap tersimpan): %', sqlerrm;
  end;
  return null;
end $$;

create trigger z_notif_pengajuan after insert or update on pengajuan_batal
  for each row execute function notif_pengajuan();

-- ---------------------------------------------------------------------
-- E. Tes dari tombol "Kirim tes" di aplikasi: hanya ke diri sendiri (tidak bisa mengganggu owner lain)
-- ---------------------------------------------------------------------
create or replace function tes_notifikasi() returns text
language plpgsql security definer set search_path = public as $$
begin
  if not adalah_owner() then
    raise exception 'Hanya owner yang bisa menerima notifikasi';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'notif_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'notif_secret') then
    return 'belum-dikonfigurasi';
  end if;
  if not exists (select 1 from push_langganan where profil_id = auth.uid()) then
    return 'tidak-ada-langganan';
  end if;
  perform notif_kirim(array[auth.uid()], 'Tes notifikasi 3Rally', 'Notifikasi di HP ini sudah aktif.', '/beranda', 'tes');
  return 'terkirim';
end $$;

revoke all on function tes_notifikasi() from public, anon;
grant execute on function tes_notifikasi() to authenticated;

-- Fungsi internal: tidak boleh dipanggil klien lewat API (mis. untuk mengirim notifikasi palsu)
revoke all on function notif_rupiah(numeric), notif_nama(uuid), notif_label(text, jsonb),
  notif_kirim(uuid[], text, text, text, text), notif_catatan(), notif_pengajuan()
  from public, anon, authenticated;
