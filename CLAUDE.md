# 3Rally — Aplikasi Manajemen Owner

Instruksi proyek untuk Claude Code. Baca seluruh file ini sebelum menulis kode.

## 1. Konteks

Tiga orang (owner) merintis kedai jus **3Rally** di Rengasdengklok, Karawang. Usaha **belum buka**; sekarang tahap R&D
(uji racikan, belanja alat). Modal tidak disetor sekaligus — masuk sedikit demi sedikit, sering dalam bentuk
owner membayar sendiri belanja kecil. Aplikasi ini harus memastikan **setiap rupiah yang dikeluarkan owner
tercatat sebagai kontribusi modal dan langsung menggeser persentase kepemilikan**, dengan bukti dan
persetujuan silang supaya bisa dipercaya bertiga dan diaudit.

Pemilik repo: Rifki (salah satu owner). Rifki bisa membaca kode (pernah memakai Next.js, Firebase, GAS),
tapi **belum pernah memakai Supabase** — jelaskan langkah yang harus ia lakukan di dashboard Supabase
secara eksplisit.

## 2. Stack

- Next.js (App Router, TypeScript), dibuat dari template resmi `with-supabase`. Repo sudah berisi file
  (CLAUDE.md, supabase/, .gitignore), jadi scaffold di folder sementara lalu pindahkan isinya ke root:
  `npx create-next-app@latest /tmp/scaffold -e with-supabase`, lalu gabungkan `.gitignore`-nya.
- `@supabase/supabase-js` + `@supabase/ssr` (sudah ada di template)
- Tailwind (sudah ada di template)
- Deploy: Vercel
- Env (`.env.local`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- **Jangan pernah** memakai secret key / service role key di kode aplikasi.

### Mode kerja: Claude Code cloud (claude.ai/code)

Proyek ini dikerjakan di sesi cloud, bukan di laptop Rifki. Konsekuensinya:

- Rifki **tidak bisa membuka localhost**. Pengujian dilakukan lewat **Vercel Preview**: setiap branch/PR
  yang di-push otomatis mendapat URL preview, dan Rifki mengujinya dari HP.
- Alur tiap fitur: kerjakan di branch → `npm run build` + `npm run lint` lulus di sesi → push → buat PR →
  tulis di deskripsi PR langkah uji manual → Rifki uji di URL preview → Rifki merge.
- Sesi hanya punya `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (dari environment
  variables cloud). Sesi **tidak** punya password database atau secret key, jadi **Claude tidak menjalankan
  migrasi sendiri**: tulis file migrasi + tes SQL, lalu minta Rifki menjalankannya di SQL Editor Supabase
  dan menempelkan hasilnya kembali.
- Jangan menulis kunci apa pun ke file yang di-commit. `.env.local` tetap di `.gitignore`.
- Jika `npm run build` gagal karena tidak bisa mengunduh font atau menjangkau domain tertentu, sebutkan
  domainnya ke Rifki untuk ditambahkan ke allowlist environment, jangan mengganti dependensi diam-diam.

## 3. Database

Skema lengkap ada di `supabase/schema.sql` (sudah diuji di PostgreSQL 16 dengan auth Supabase tiruan;
belum dijalankan di Supabase sungguhan). Skema ini adalah sumber kebenaran. Ringkasan:

| Tabel | Isi |
|---|---|
| profil | id = auth.users.id, nama, peran (owner/karyawan), aktif |
| outlet | lokasi kedai |
| kategori | nama, jenis (pemasukan/pengeluaran), fase (pra_operasi/operasi) |
| transaksi | pemasukan/pengeluaran; `sumber_dana` kas_usaha/owner; `dibayar_owner_id`; `klaim` modal/talangan |
| penjualan_harian | per hari: cup, omzet tunai, omzet QRIS, selisih kas (tahap 2) |
| aset | alat; `sumber` beli_kas/beli_owner/setor_barang; umur_bulan default 36 |
| kontribusi | modal owner: setor_uang (manual) / bayar_pengeluaran / beli_aset / setor_barang (otomatis via trigger) |
| distribusi | penarikan_modal (mengurangi porsi) / bagi_laba / pelunasan_talangan (tahap 3) |
| porsi_terkunci | snapshot porsi via fungsi `kunci_porsi(tanggal, catatan)` |
| log_audit | otomatis via trigger untuk transaksi, aset, kontribusi, distribusi |

View: `v_porsi_kepemilikan`, `v_kontribusi_per_bentuk`, `v_talangan_owner`, `v_saldo_kas`,
`v_biaya_pra_operasi`, `v_nilai_buku_aset`, `v_kas_bulanan`, `v_penjualan_bulanan` (semua `security_invoker`).

Perubahan skema: **jangan edit `schema.sql` setelah dijalankan.** Buat file baru
`supabase/migrations/NNN_deskripsi.sql`, jelaskan ke Rifki isinya, dan minta ia menjalankannya di SQL Editor.

## 4. Aturan bisnis (wajib ditegakkan di database, bukan hanya di UI)

1. **Tidak ada hapus.** Catatan salah → status `batal` + `alasan_batal` wajib. Tidak ada tombol delete.
2. **Persetujuan silang.** Status awal `menunggu` untuk: semua transaksi sumber_dana owner, semua aset
   beli_owner/setor_barang, semua kontribusi, semua distribusi, dan pengeluaran kas > Rp500.000.
   Penyetuju ≠ pencatat dan ≠ owner yang bersangkutan.
3. **Satu kali catat.** Owner yang bayar sendiri cukup mencatat transaksi atau aset; baris kontribusi dibuat
   trigger. UI kontribusi manual hanya untuk `setor_uang`.
4. **Modal vs talangan.** Klaim `modal` menambah porsi. Klaim `talangan` tidak — itu utang usaha ke owner,
   tampil di `v_talangan_owner`.
5. **Bukti wajib** untuk setiap pengeluaran dan kontribusi (foto nota/transfer/barang). Catatan tanpa bukti
   boleh disimpan tapi masuk daftar "belum ada bukti".
6. **Karyawan**: hanya penjualan harian dan pengeluaran kas_usaha ≤ Rp100.000; hanya melihat catatannya
   sendiri hari itu; tidak melihat porsi, modal, omzet bulanan.
7. **Porsi** = modal bersih owner (kontribusi aktif − penarikan modal aktif) ÷ total modal bersih × 100.
   Rp1 R&D = Rp1 modal lain. Nilai barang setor_barang = nilai yang disepakati saat persetujuan.
8. **Penyusutan** garis lurus per bulan, umur default 36 bulan.

## 5. Celah yang diketahui di skema — perbaiki lewat migrasi pertama

- Policy update owner (`owner_setujui_*`) saat ini mengizinkan mengubah **semua kolom**, termasuk `jumlah`.
  Buat trigger `before update` yang hanya mengizinkan perubahan `status`, `disetujui_oleh`, `alasan_batal`
  (dan `harga_beli` aset setor_barang **hanya** saat transisi menunggu → aktif, untuk nilai yang disepakati).
  Transisi yang sah: menunggu → aktif, menunggu → batal, aktif → batal. Tidak boleh batal → apa pun.
- Saat menyetujui, `disetujui_oleh` harus di-set ke `auth.uid()` oleh trigger, bukan dari input klien.
- Storage belum ada di skema. Buat bucket private `bukti` dan policy: authenticated boleh insert ke bucket
  `bukti`; select hanya `public.adalah_owner()` atau pemilik object. Path: `{tabel}/{yyyy-mm}/{uuid}.webp`.
- Profil karyawan bisa membaca semua profil (nama owner). Itu dapat diterima; jangan perluas akses lain.

Setiap migrasi harus disertai skrip uji SQL (`supabase/tests/NNN_*.sql`) yang mensimulasikan login per
peran dengan `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>"}';` dan
membuktikan: yang boleh berhasil, yang dilarang gagal.

## 6. Fitur — Tahap 1 (kerjakan ini dulu)

Semua halaman **mobile-first** (dipakai dari HP), Bahasa Indonesia, format uang `Rp1.234.567`,
tanggal `18 Okt 2026`.

1. **Login** email + password (akun dibuat manual oleh owner di dashboard; tidak ada halaman daftar).
2. **Beranda owner**: kartu porsi kepemilikan tiga owner (dari `v_porsi_kepemilikan`), saldo kas,
   jumlah item menunggu persetujuan saya, total biaya pra-operasi.
3. **Catat pengeluaran/pemasukan**: tanggal (boleh mundur untuk backfill R&D), kategori (difilter per jenis),
   jumlah, metode, keterangan, foto bukti. Toggle "Dibayar dari uang pribadi saya" → set sumber_dana owner,
   dibayar_owner_id = saya, pilih klaim **Modal** (default) atau **Talangan**, dengan penjelasan satu baris
   bedanya.
4. **Catat aset**: nama, tanggal, harga/nilai, asal (kas usaha / saya beli sendiri / barang pribadi saya),
   umur bulan, lokasi, foto barang, foto nota. Jika asal kas usaha, tawarkan sekaligus membuat transaksi
   kategori "Pembelian aset" dan isi `transaksi_id`.
5. **Setor uang**: jumlah, tanggal, metode, bukti transfer → kontribusi bentuk setor_uang.
6. **Antrean persetujuan**: daftar item `menunggu` yang **boleh saya setujui** (bukan catatan saya, bukan
   uang saya), dengan foto bukti. Tombol Setujui / Tolak (tolak = batal + alasan wajib). Untuk setor_barang,
   penyetuju bisa mengubah nilai yang disepakati sebelum setuju.
7. **Riwayat**: semua transaksi/aset/kontribusi dengan filter status, owner, kategori; tombol "Batalkan"
   (alasan wajib) pada catatan aktif.
8. **Laporan**: porsi + rincian per bentuk kontribusi, talangan per owner, biaya pra-operasi per kategori,
   daftar aset + nilai buku, daftar "belum ada bukti". Tombol **Ekspor CSV** per laporan.
9. **Kompresi foto** sebelum upload, di klien: canvas → WebP, sisi terpanjang 1600 px, quality 0.7,
   fallback JPEG jika browser tidak mendukung WebP. Tampilkan foto via signed URL (berlaku 1 jam).

10. **Pakai di HP** (wajib sejak PR pertama):
    - Desain untuk layar 360–430 px dulu; desktop hanya pelebaran.
    - Navigasi bawah (bottom nav) 4 item: Beranda, Catat, Setujui (dengan badge jumlah menunggu), Laporan.
    - Target sentuh minimal 44 px; form satu kolom; tombol simpan menempel di bawah layar.
    - Input uang `inputmode="numeric"` dengan format ribuan otomatis saat mengetik.
    - Input foto `accept="image/*"` dengan pilihan kamera langsung (`capture="environment"`) atau galeri.
    - **PWA bisa dipasang ke layar utama**: `app/manifest.ts` (nama "3Rally", ikon 192 dan 512 px,
      `display: "standalone"`, warna tema), meta `apple-mobile-web-app-capable` untuk iPhone. Tulis cara
      memasangnya di Android (Chrome → Tambahkan ke layar utama) dan iPhone (Safari → Share → Add to Home Screen).
    - **Tidak ada mode offline** untuk pencatatan: tampilkan pesan jelas saat tidak ada sinyal dan jangan
      simpan antrean diam-diam, supaya tidak ada catatan ganda atau persetujuan yang tertunda tanpa diketahui.
    - Uji setiap PR di Chrome DevTools mode perangkat (mis. 390 px) dan tulis di PR bahwa sudah dicek.

Tahap 2 (setelah kedai buka): penjualan harian + tutup hari, laporan kas bulanan, akun karyawan.
Tahap 3: distribusi (penarikan modal, bagi laba sesuai porsi terkunci terakhir, pelunasan talangan),
tombol kunci porsi. **Jangan kerjakan tahap 2–3 sebelum diminta.**

## 7. Backup untuk audit

Supabase paket gratis tidak menyediakan backup harian yang bisa diunduh. Buat
`.github/workflows/backup.yml`: tiap Senin 01.00 WIB (`cron: '0 18 * * 0'`) + `workflow_dispatch`,
container `postgres:17`, `pg_dump --schema=public --no-owner --no-privileges`, `\copy` CSV untuk semua
tabel dan view laporan, `sha256sum` → `SHA256SUMS.txt`, unggah dengan rclone ke
`gdrive:Audit 3Rally/backup/<tanggal>/`. Secrets: `SUPABASE_DB_URL` (Session pooler), 
`RCLONE_GDRIVE_TOKEN`. Folder per tanggal tidak pernah ditimpa.

## 8. Cara kerja dengan Rifki

- Mulai setiap tahap dengan rencana singkat (file yang akan dibuat, migrasi yang dibutuhkan), lalu kerjakan.
- Langkah yang harus Rifki lakukan sendiri di dashboard Supabase/GitHub/Vercel: tulis sebagai daftar
  bernomor dengan nama menu persis, dan tandai jelas `>>> RIFKI LAKUKAN:`.
- Jangan mengarang angka bisnis (harga, batas, persentase). Angka yang ada di file ini sudah disepakati
  sebagai nilai awal; angka lain tanyakan.
- Selesai tiap fitur: jalankan `npm run build` dan `npm run lint`, buat PR, lalu tulis di PR cara mengujinya
  manual di URL Vercel Preview (login sebagai owner A, catat X, login sebagai B, setujui, cek porsi).
- Satu PR = satu fitur dari daftar Tahap 1, supaya mudah diuji dan di-review dari HP.
- **Panduan owner** ada di `docs/panduan-owner.md`. Setiap fitur yang mengubah cara pakai ikut memperbarui
  file ini di PR yang sama; workflow `panduan.yml` menjadikannya .docx di Drive `Audit 3Rally/panduan/`.
  Jangan cantumkan hal pengembang (database uji, URL Preview, aplikasi "3Rally UJI") di panduan.
- Komunikasi campur Bahasa Indonesia dan istilah teknis English. Ringkas.

## 9. Definisi selesai Tahap 1

Semua pengeluaran R&D sejak awal bisa dicatat mundur dengan bukti, tiga owner melihat porsi yang sama di
beranda, tidak ada owner yang bisa menyetujui catatan/uangnya sendiri (dibuktikan dengan tes SQL), dan
backup pertama muncul di Google Drive.
