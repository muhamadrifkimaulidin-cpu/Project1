-- =====================================================================
-- Skema Kedai Jus v2: kontribusi modal bertahap per owner
-- Jalankan sekali di SQL Editor Supabase pada proyek baru.
-- =====================================================================

-- 1. Profil pengguna
create table profil (
  id          uuid primary key references auth.users (id) on delete restrict,
  nama        text not null,
  peran       text not null check (peran in ('owner', 'karyawan')),
  aktif       boolean not null default true,
  dibuat_pada timestamptz not null default now()
);

-- 2. Outlet
create table outlet (
  id     uuid primary key default gen_random_uuid(),
  nama   text not null,
  alamat text
);

-- 3. Kategori transaksi
--    fase 'pra_operasi' = biaya R&D dan persiapan sebelum buka
create table kategori (
  id    uuid primary key default gen_random_uuid(),
  nama  text not null,
  jenis text not null check (jenis in ('pemasukan', 'pengeluaran')),
  fase  text not null default 'operasi' check (fase in ('pra_operasi', 'operasi')),
  unique (nama, jenis)
);

-- 4. Transaksi pemasukan dan pengeluaran
--    sumber_dana 'owner' = dibayar dari uang pribadi owner
--    klaim 'modal'       = dihitung sebagai kontribusi modal (menambah porsi)
--    klaim 'talangan'    = dipinjamkan, nanti dikembalikan dari kas usaha (tidak menambah porsi)
create table transaksi (
  id               uuid primary key default gen_random_uuid(),
  outlet_id        uuid not null references outlet (id),
  tanggal          date not null default current_date,
  jenis            text not null check (jenis in ('pemasukan', 'pengeluaran')),
  kategori_id      uuid not null references kategori (id),
  jumlah           numeric(14, 2) not null check (jumlah > 0),
  metode           text not null check (metode in ('tunai', 'qris', 'transfer')),
  sumber_dana      text not null default 'kas_usaha' check (sumber_dana in ('kas_usaha', 'owner')),
  dibayar_owner_id uuid references profil (id),
  klaim            text check (klaim in ('modal', 'talangan')),
  keterangan       text,
  bukti_path       text,
  status           text not null default 'aktif' check (status in ('menunggu', 'aktif', 'batal')),
  dicatat_oleh     uuid not null default auth.uid() references profil (id),
  disetujui_oleh   uuid references profil (id),
  alasan_batal     text,
  dibuat_pada      timestamptz not null default now(),
  check ((sumber_dana = 'kas_usaha' and dibayar_owner_id is null and klaim is null)
      or (sumber_dana = 'owner' and jenis = 'pengeluaran' and dibayar_owner_id is not null and klaim is not null)),
  check (disetujui_oleh is null or disetujui_oleh <> dicatat_oleh),
  check (disetujui_oleh is null or dibayar_owner_id is null or disetujui_oleh <> dibayar_owner_id),
  check (status <> 'batal' or alasan_batal is not null)
);

-- 5. Penjualan harian
create table penjualan_harian (
  id           uuid primary key default gen_random_uuid(),
  outlet_id    uuid not null references outlet (id),
  tanggal      date not null default current_date,
  cup_terjual  integer not null check (cup_terjual >= 0),
  omzet_tunai  numeric(14, 2) not null default 0 check (omzet_tunai >= 0),
  omzet_qris   numeric(14, 2) not null default 0 check (omzet_qris >= 0),
  selisih_kas  numeric(14, 2) not null default 0,
  keterangan   text,
  dicatat_oleh uuid not null default auth.uid() references profil (id),
  dibuat_pada  timestamptz not null default now(),
  unique (outlet_id, tanggal)
);

-- 6. Aset
--    sumber 'beli_kas'     = dibeli dari kas usaha (dicatat juga sebagai transaksi pengeluaran)
--    sumber 'beli_owner'   = dibeli owner dengan uang pribadi -> otomatis jadi kontribusi modal
--    sumber 'setor_barang' = barang milik owner diserahkan ke usaha, nilainya disepakati -> kontribusi modal
create table aset (
  id               uuid primary key default gen_random_uuid(),
  outlet_id        uuid not null references outlet (id),
  nama             text not null,
  tanggal_beli     date not null,
  harga_beli       numeric(14, 2) not null check (harga_beli >= 0),
  umur_bulan       integer not null default 36 check (umur_bulan > 0),
  nilai_sisa       numeric(14, 2) not null default 0 check (nilai_sisa >= 0),
  sumber           text not null default 'beli_kas' check (sumber in ('beli_kas', 'beli_owner', 'setor_barang')),
  dibayar_owner_id uuid references profil (id),
  transaksi_id     uuid references transaksi (id),
  kondisi          text not null default 'baik' check (kondisi in ('baik', 'rusak', 'dijual', 'hilang')),
  lokasi           text,
  foto_path        text,
  bukti_path       text,
  status           text not null default 'aktif' check (status in ('menunggu', 'aktif', 'batal')),
  dicatat_oleh     uuid not null default auth.uid() references profil (id),
  disetujui_oleh   uuid references profil (id),
  alasan_batal     text,
  dibuat_pada      timestamptz not null default now(),
  check ((sumber = 'beli_kas' and dibayar_owner_id is null)
      or (sumber in ('beli_owner', 'setor_barang') and dibayar_owner_id is not null)),
  check (disetujui_oleh is null or disetujui_oleh <> dicatat_oleh),
  check (disetujui_oleh is null or dibayar_owner_id is null or disetujui_oleh <> dibayar_owner_id),
  check (status <> 'batal' or alasan_batal is not null)
);

-- 7. Kontribusi modal owner (sumber perhitungan porsi kepemilikan)
--    'setor_uang'        dicatat manual: owner menyetor uang ke kas usaha
--    'bayar_pengeluaran' dibuat otomatis dari transaksi sumber_dana owner + klaim modal
--    'beli_aset'         dibuat otomatis dari aset sumber beli_owner
--    'setor_barang'      dibuat otomatis dari aset sumber setor_barang
create table kontribusi (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profil (id),
  tanggal        date not null default current_date,
  bentuk         text not null check (bentuk in ('setor_uang', 'bayar_pengeluaran', 'beli_aset', 'setor_barang')),
  jumlah         numeric(14, 2) not null check (jumlah > 0),
  transaksi_id   uuid unique references transaksi (id),
  aset_id        uuid unique references aset (id),
  keterangan     text,
  bukti_path     text,
  status         text not null default 'menunggu' check (status in ('menunggu', 'aktif', 'batal')),
  dicatat_oleh   uuid not null default auth.uid() references profil (id),
  disetujui_oleh uuid references profil (id),
  alasan_batal   text,
  dibuat_pada    timestamptz not null default now(),
  check ((bentuk = 'setor_uang' and transaksi_id is null and aset_id is null)
      or (bentuk = 'bayar_pengeluaran' and transaksi_id is not null)
      or (bentuk in ('beli_aset', 'setor_barang') and aset_id is not null)),
  check (disetujui_oleh is null or (disetujui_oleh <> owner_id and disetujui_oleh <> dicatat_oleh)),
  check (status <> 'batal' or alasan_batal is not null)
);

-- 8. Uang keluar ke owner
--    'penarikan_modal'    mengurangi porsi kepemilikan
--    'bagi_laba'          tidak mengurangi porsi
--    'pelunasan_talangan' mengembalikan talangan, tidak mengurangi porsi
create table distribusi (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profil (id),
  tanggal        date not null default current_date,
  jenis          text not null check (jenis in ('penarikan_modal', 'bagi_laba', 'pelunasan_talangan')),
  jumlah         numeric(14, 2) not null check (jumlah > 0),
  metode         text not null check (metode in ('tunai', 'transfer')),
  keterangan     text,
  bukti_path     text,
  status         text not null default 'menunggu' check (status in ('menunggu', 'aktif', 'batal')),
  dicatat_oleh   uuid not null default auth.uid() references profil (id),
  disetujui_oleh uuid references profil (id),
  alasan_batal   text,
  dibuat_pada    timestamptz not null default now(),
  check (disetujui_oleh is null or (disetujui_oleh <> owner_id and disetujui_oleh <> dicatat_oleh)),
  check (status <> 'batal' or alasan_batal is not null)
);

-- 9. Porsi yang dikunci (foto porsi pada tanggal yang disepakati, misalnya hari buka)
create table porsi_terkunci (
  id               uuid primary key default gen_random_uuid(),
  tanggal_kunci    date not null,
  owner_id         uuid not null references profil (id),
  total_kontribusi numeric(14, 2) not null,
  persen           numeric(7, 4) not null,
  catatan          text,
  dikunci_oleh     uuid not null default auth.uid() references profil (id),
  dibuat_pada      timestamptz not null default now(),
  unique (tanggal_kunci, owner_id)
);

-- 10. Log audit
create table log_audit (
  id        bigint generated always as identity primary key,
  tabel     text not null,
  baris_id  uuid not null,
  aksi      text not null,
  oleh      uuid default auth.uid(),
  data_lama jsonb,
  data_baru jsonb,
  waktu     timestamptz not null default now()
);

-- =====================================================================
-- Fungsi dan pemicu
-- =====================================================================

-- 11. Audit setiap catatan baru dan perubahan
create or replace function catat_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into log_audit (tabel, baris_id, aksi, data_lama, data_baru)
  values (tg_table_name, coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger audit_transaksi  after insert or update on transaksi  for each row execute function catat_audit();
create trigger audit_aset       after insert or update on aset       for each row execute function catat_audit();
create trigger audit_kontribusi after insert or update on kontribusi for each row execute function catat_audit();
create trigger audit_distribusi after insert or update on distribusi for each row execute function catat_audit();

-- 12. Status awal: semua yang menyangkut uang owner dan pengeluaran besar menunggu persetujuan
create or replace function status_awal_transaksi() returns trigger
language plpgsql as $$
begin
  if new.sumber_dana = 'owner'
     or (new.jenis = 'pengeluaran' and new.jumlah > 500000) then
    new.status := 'menunggu';
  end if;
  return new;
end $$;

create trigger status_awal_transaksi before insert on transaksi
  for each row execute function status_awal_transaksi();

create or replace function status_awal_aset() returns trigger
language plpgsql as $$
begin
  if new.sumber in ('beli_owner', 'setor_barang') then
    new.status := 'menunggu';
  end if;
  return new;
end $$;

create trigger status_awal_aset before insert on aset
  for each row execute function status_awal_aset();

-- 13. Transaksi yang dibayar owner dengan klaim modal -> kontribusi otomatis
create or replace function sinkron_kontribusi_transaksi() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sumber_dana = 'owner' and new.klaim = 'modal' then
    insert into kontribusi (owner_id, tanggal, bentuk, jumlah, transaksi_id, keterangan,
                            bukti_path, status, dicatat_oleh, disetujui_oleh, alasan_batal)
    values (new.dibayar_owner_id, new.tanggal, 'bayar_pengeluaran', new.jumlah, new.id, new.keterangan,
            new.bukti_path, new.status, new.dicatat_oleh, new.disetujui_oleh, new.alasan_batal)
    on conflict (transaksi_id) do update
      set status = excluded.status,
          disetujui_oleh = excluded.disetujui_oleh,
          alasan_batal = excluded.alasan_batal;
  end if;
  return new;
end $$;

create trigger sinkron_kontribusi_transaksi after insert or update on transaksi
  for each row execute function sinkron_kontribusi_transaksi();

-- 14. Aset yang dibeli atau disetor owner -> kontribusi otomatis
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
          disetujui_oleh = excluded.disetujui_oleh,
          alasan_batal = excluded.alasan_batal;
  end if;
  return new;
end $$;

create trigger sinkron_kontribusi_aset after insert or update on aset
  for each row execute function sinkron_kontribusi_aset();

-- =====================================================================
-- View laporan (security_invoker: view ikut aturan RLS pembacanya)
-- =====================================================================

-- 15. Porsi kepemilikan berjalan
create view v_porsi_kepemilikan with (security_invoker = true) as
with masuk as (
  select owner_id, sum(jumlah) as total from kontribusi where status = 'aktif' group by owner_id
), tarik as (
  select owner_id, sum(jumlah) as total from distribusi
  where status = 'aktif' and jenis = 'penarikan_modal' group by owner_id
), bersih as (
  select p.id as owner_id, p.nama,
         coalesce(m.total, 0) as total_kontribusi,
         coalesce(t.total, 0) as total_penarikan,
         coalesce(m.total, 0) - coalesce(t.total, 0) as modal_bersih
  from profil p
  left join masuk m on m.owner_id = p.id
  left join tarik t on t.owner_id = p.id
  where p.peran = 'owner'
)
select b.*,
       round(100 * b.modal_bersih / nullif(sum(b.modal_bersih) over (), 0), 2) as persen
from bersih b;

-- 16. Rincian kontribusi per owner per bentuk
create view v_kontribusi_per_bentuk with (security_invoker = true) as
select k.owner_id, p.nama, k.bentuk, count(*) as jumlah_catatan, sum(k.jumlah) as total
from kontribusi k
join profil p on p.id = k.owner_id
where k.status = 'aktif'
group by k.owner_id, p.nama, k.bentuk;

-- 17. Talangan yang belum dikembalikan ke owner
create view v_talangan_owner with (security_invoker = true) as
select p.id as owner_id, p.nama,
       coalesce((select sum(t.jumlah) from transaksi t
                 where t.dibayar_owner_id = p.id and t.klaim = 'talangan' and t.status = 'aktif'), 0)
     - coalesce((select sum(d.jumlah) from distribusi d
                 where d.owner_id = p.id and d.jenis = 'pelunasan_talangan' and d.status = 'aktif'), 0)
       as sisa_talangan
from profil p
where p.peran = 'owner';

-- 18. Saldo kas usaha
create view v_saldo_kas with (security_invoker = true) as
select
    coalesce((select sum(jumlah) from kontribusi where status = 'aktif' and bentuk = 'setor_uang'), 0)
  + coalesce((select sum(omzet_tunai + omzet_qris) from penjualan_harian), 0)
  + coalesce((select sum(jumlah) from transaksi where status = 'aktif' and jenis = 'pemasukan'), 0)
  - coalesce((select sum(jumlah) from transaksi
              where status = 'aktif' and jenis = 'pengeluaran' and sumber_dana = 'kas_usaha'), 0)
  - coalesce((select sum(jumlah) from distribusi where status = 'aktif'), 0)
  as saldo_kas;

-- 19. Biaya pra-operasi (R&D dan persiapan) per kategori
create view v_biaya_pra_operasi with (security_invoker = true) as
select k.nama as kategori, t.sumber_dana, count(*) as jumlah_catatan, sum(t.jumlah) as total
from transaksi t
join kategori k on k.id = t.kategori_id
where t.status = 'aktif' and t.jenis = 'pengeluaran' and k.fase = 'pra_operasi'
group by k.nama, t.sumber_dana;

-- 20. Nilai buku aset
create view v_nilai_buku_aset with (security_invoker = true) as
select a.*,
       least(greatest((extract(year from age(current_date, tanggal_beli)) * 12
                     + extract(month from age(current_date, tanggal_beli)))::int, 0), umur_bulan) as bulan_terpakai,
       harga_beli - (harga_beli - nilai_sisa)
         * least(greatest((extract(year from age(current_date, tanggal_beli)) * 12
                         + extract(month from age(current_date, tanggal_beli)))::int, 0), umur_bulan)
         / umur_bulan as nilai_buku
from aset a
where a.status = 'aktif' and a.kondisi in ('baik', 'rusak');

-- 21. Kas bulanan dan penjualan bulanan
create view v_kas_bulanan with (security_invoker = true) as
select date_trunc('month', tanggal)::date as bulan,
       sum(case when jenis = 'pemasukan' then jumlah else 0 end) as pemasukan_lain,
       sum(case when jenis = 'pengeluaran' then jumlah else 0 end) as pengeluaran
from transaksi
where status = 'aktif'
group by 1;

create view v_penjualan_bulanan with (security_invoker = true) as
select date_trunc('month', tanggal)::date as bulan,
       sum(cup_terjual) as cup,
       sum(omzet_tunai + omzet_qris) as omzet
from penjualan_harian
group by 1;

-- 22. Mengunci porsi pada tanggal tertentu (dijalankan owner setelah disepakati bertiga)
create or replace function kunci_porsi(p_tanggal date, p_catatan text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profil where id = auth.uid() and peran = 'owner' and aktif) then
    raise exception 'Hanya owner yang boleh mengunci porsi';
  end if;
  insert into porsi_terkunci (tanggal_kunci, owner_id, total_kontribusi, persen, catatan)
  select p_tanggal, owner_id, modal_bersih, coalesce(persen, 0), p_catatan
  from v_porsi_kepemilikan;
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================

create or replace function adalah_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profil where id = auth.uid() and peran = 'owner' and aktif);
$$;

alter table profil           enable row level security;
alter table outlet           enable row level security;
alter table kategori         enable row level security;
alter table transaksi        enable row level security;
alter table penjualan_harian enable row level security;
alter table aset             enable row level security;
alter table kontribusi       enable row level security;
alter table distribusi       enable row level security;
alter table porsi_terkunci   enable row level security;
alter table log_audit        enable row level security;

-- Semua pengguna yang login: baca profil, outlet, kategori
create policy baca_profil   on profil   for select using (auth.uid() is not null);
create policy baca_outlet   on outlet   for select using (auth.uid() is not null);
create policy baca_kategori on kategori for select using (auth.uid() is not null);

-- Owner: baca semua
create policy owner_baca_transaksi  on transaksi        for select using (adalah_owner());
create policy owner_baca_penjualan  on penjualan_harian for select using (adalah_owner());
create policy owner_baca_aset       on aset             for select using (adalah_owner());
create policy owner_baca_kontribusi on kontribusi       for select using (adalah_owner());
create policy owner_baca_distribusi on distribusi       for select using (adalah_owner());
create policy owner_baca_porsi      on porsi_terkunci   for select using (adalah_owner());
create policy owner_baca_log        on log_audit        for select using (adalah_owner());

-- Owner: mencatat
create policy owner_catat_transaksi  on transaksi        for insert with check (adalah_owner());
create policy owner_catat_penjualan  on penjualan_harian for insert with check (adalah_owner());
create policy owner_catat_aset       on aset             for insert with check (adalah_owner());
create policy owner_catat_kontribusi on kontribusi       for insert
  with check (adalah_owner() and bentuk = 'setor_uang');
create policy owner_catat_distribusi on distribusi       for insert with check (adalah_owner());

-- Owner: menyetujui atau membatalkan catatan yang bukan miliknya (tidak ada delete)
create policy owner_setujui_transaksi on transaksi for update
  using (adalah_owner() and dicatat_oleh <> auth.uid()
         and (dibayar_owner_id is null or dibayar_owner_id <> auth.uid()))
  with check (adalah_owner());
create policy owner_setujui_aset on aset for update
  using (adalah_owner() and dicatat_oleh <> auth.uid()
         and (dibayar_owner_id is null or dibayar_owner_id <> auth.uid()))
  with check (adalah_owner());
create policy owner_setujui_kontribusi on kontribusi for update
  using (adalah_owner() and bentuk = 'setor_uang'
         and owner_id <> auth.uid() and dicatat_oleh <> auth.uid())
  with check (adalah_owner());
create policy owner_setujui_distribusi on distribusi for update
  using (adalah_owner() and owner_id <> auth.uid() and dicatat_oleh <> auth.uid())
  with check (adalah_owner());

-- Karyawan: catat penjualan harian dan pengeluaran kecil dari kas usaha, lihat catatan sendiri hari itu
create policy karyawan_catat_penjualan on penjualan_harian for insert
  with check (dicatat_oleh = auth.uid());
create policy karyawan_lihat_penjualan on penjualan_harian for select
  using (dicatat_oleh = auth.uid() and tanggal = current_date);
create policy karyawan_catat_pengeluaran on transaksi for insert
  with check (dicatat_oleh = auth.uid() and jenis = 'pengeluaran'
              and sumber_dana = 'kas_usaha' and jumlah <= 100000);
create policy karyawan_lihat_transaksi on transaksi for select
  using (dicatat_oleh = auth.uid() and tanggal = current_date);

-- =====================================================================
-- Data awal kategori
-- =====================================================================
insert into kategori (nama, jenis, fase) values
  ('Bahan uji racikan', 'pengeluaran', 'pra_operasi'),
  ('Peralatan uji kecil', 'pengeluaran', 'pra_operasi'),
  ('Sampel dan promosi uji', 'pengeluaran', 'pra_operasi'),
  ('Perizinan dan sertifikasi', 'pengeluaran', 'pra_operasi'),
  ('Desain dan cetak', 'pengeluaran', 'pra_operasi'),
  ('Transportasi', 'pengeluaran', 'pra_operasi'),
  ('Pembelian aset', 'pengeluaran', 'operasi'),
  ('Bahan buah', 'pengeluaran', 'operasi'),
  ('Bahan lain', 'pengeluaran', 'operasi'),
  ('Kemasan', 'pengeluaran', 'operasi'),
  ('Gaji', 'pengeluaran', 'operasi'),
  ('Sewa', 'pengeluaran', 'operasi'),
  ('Listrik dan air', 'pengeluaran', 'operasi'),
  ('Pemasaran', 'pengeluaran', 'operasi'),
  ('Perawatan', 'pengeluaran', 'operasi'),
  ('Iuran', 'pengeluaran', 'operasi'),
  ('Lain-lain', 'pengeluaran', 'operasi'),
  ('Penjualan uji coba', 'pemasukan', 'pra_operasi'),
  ('Pesanan kelompok atau acara', 'pemasukan', 'operasi'),
  ('Lain-lain', 'pemasukan', 'operasi');
