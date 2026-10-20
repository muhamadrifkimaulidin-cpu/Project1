---
title: Panduan Owner 3Rally
subtitle: Cara memakai aplikasi 3Rally dari HP
---

<!-- Sumber panduan untuk owner. Setiap perubahan file ini di branch main otomatis
     dijadikan .docx dan diunggah ke Google Drive "Audit 3Rally/panduan/"
     (.github/workflows/panduan.yml). Jangan cantumkan hal teknis pengembang
     (database uji, URL Preview, dsb.) di sini. -->

Versi: 20 Okt 2026 · tahap 1 · alamat aplikasi: **3rally.vercel.app** · bantuan: Rifki

Cara memakai aplikasi 3Rally dari HP: mencatat uang dan barang, saling menyetujui, membetulkan catatan yang salah, memantau R&D, dan membaca porsi kepemilikan.

## Enam aturan yang dijaga aplikasi

Aturan ini dikunci di database, bukan hanya di tampilan. Siapa pun yang membuka aplikasi tidak bisa melewatinya, termasuk Rifki.

- **Setiap rupiah owner = modal.** Uang pribadi yang kamu pakai untuk usaha, termasuk belanja R&D kecil, otomatis tercatat sebagai modal dan menambah porsimu. Kecuali kamu memilih *talangan*.
- **Persetujuan silang.** Catatan yang menyangkut uang atau barang pribadimu harus disetujui owner lain. Kamu tidak bisa menyetujui catatanmu sendiri.
- **Tidak ada tombol hapus.** Catatan yang salah dibatalkan dengan alasan, dan jejaknya tetap tersimpan untuk audit.
- **Foto bukti.** Setiap pengeluaran dan setoran sebaiknya disertai foto nota atau bukti transfer. Catatan tanpa foto tetap tersimpan, tapi masuk daftar "belum ada bukti".
- **Tanpa sinyal, tidak tersimpan.** Aplikasi tidak menyimpan diam-diam lalu mengirim belakangan. Kalau sinyal hilang, tombol simpan mati. Coba lagi setelah tersambung.
- **Porsi dari catatan aktif saja.** Porsi dan saldo kas hanya menghitung catatan yang sudah disetujui. Angkanya sama di HP ketiga owner.

## Masuk, pasang di HP, nyalakan notifikasi

### 1. Masuk

1.  Buka **3rally.vercel.app**. Akunmu sudah dibuat Rifki; tidak ada halaman daftar.
2.  Isi email dan password, lalu masuk. Lupa password? Tekan `lupa-password/` di halaman masuk.

### 2. Pasang ke layar utama

- **Android (Chrome):** menu ⋮ → **Tambahkan ke layar utama** / **Instal aplikasi**.
- **iPhone (harus Safari):** tombol **Share** → **Add to Home Screen** → **Add**.

Setelah itu buka 3Rally dari ikon di layar utama. Pembaruan aplikasi masuk otomatis, tidak perlu instal ulang.

### 3. Nyalakan notifikasi

Di **Beranda**, gulir ke kartu `notifikasi/`, tekan `Aktifkan notifikasi`, lalu pilih **Izinkan**. Tekan `kirim-tes/` untuk mencoba. Penjelasan lengkapnya ada di bagian bagian "notifikasi".

## Empat menu di bawah layar

- **Beranda**: porsi, saldo kas, yang menunggu kamu, tagihan patungan
- **Catat**: uang, R&D, aset, setor uang
- **Setujui**: antrean dengan angka merah
- **Laporan**: rincian + ekspor CSV

Dua halaman lain dibuka dari tombol di Beranda: `riwayat/` untuk semua catatan beserta pembatalannya, dan `r&d/` untuk ide dan uji coba.

Arti status di seluruh aplikasi:

| status   | artinya                                              | dihitung ke porsi & kas? |
|----------|------------------------------------------------------|--------------------------|
| menunggu | sudah dicatat, belum disetujui owner lain            | belum                    |
| aktif    | sah, sudah disetujui (atau tidak perlu persetujuan)  | ya                       |
| batal    | ditolak, ditarik, atau dibatalkan, beserta alasannya | tidak                    |

## Mencatat pengeluaran atau pemasukan

1.  **Catat** → **Pengeluaran / pemasukan**.
2.  Pilih **Pengeluaran** atau **Pemasukan**, lalu isi tanggal, kategori, jumlah, dan metode (Tunai, QRIS, atau Transfer). Tanggal boleh mundur untuk mencatat belanja R&D yang sudah lewat.
3.  Tambahkan foto nota: `kamera/` untuk memotret langsung atau `galeri/` untuk memilih foto. Foto dikecilkan otomatis sebelum diunggah.
4.  Kalau belanjanya untuk ide R&D tertentu, pilih idenya di **Untuk ide R&D (opsional)**. Biayanya masuk ke "biaya R&D" ide itu.
5.  Kalau kamu membayar dengan uang sendiri, centang **Dibayar dari uang pribadi saya**, lalu pilih:
    - **Modal** (bawaan): uangmu menjadi modal dan menambah porsimu.
    - **Talangan**: uangmu dipinjamkan ke usaha dan nanti dikembalikan dari **kas usaha**. Tidak menambah porsi. Kalau nanti yang mengganti adalah *owner lain*, jangan pilih Talangan — pilih Modal, lalu pakai bagian "ganti antar-owner".
6.  Kalau belanja ini mau ditanggung bersama (Modal), centang **Minta patungan ke owner lain**, lalu isi bagian tiap owner atau ketuk `bagi rata`. Lihat bagian "patungan".
7.  Tekan `Simpan`.

Catatan akan **menunggu persetujuan** owner lain kalau dibayar dari uang pribadi, atau kalau pengeluaran kas usaha di atas Rp500.000. Pengeluaran kas sampai Rp500.000 langsung aktif.

Cukup catat **satu kali**. Kalau kamu membayar sendiri, catatan modalnya dibuat otomatis, jadi jangan dicatat lagi sebagai setor uang.

## Mencatat aset

Aset adalah alat yang dipakai lebih dari setahun: blender, juicer, kulkas, gerobak. Nilainya disusutkan per bulan sesuai umur pakai (bawaan 36 bulan).

1.  **Catat** → **Aset**, lalu pilih asalnya:
    | asal            | kapan dipilih                        | yang terjadi                                                                                                                    |
    |-----------------|--------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|
    | **Kas usaha**   | dibeli pakai uang usaha              | Pengeluaran "Pembelian aset" ikut tercatat (bisa dimatikan kalau sudah dicatat terpisah). Aset mengikuti status pengeluarannya. |
    | **Uang saya**   | kamu membeli sendiri                 | Harga beli menjadi modalmu setelah disetujui.                                                                                   |
    | **Barang saya** | barang pribadimu diserahkan ke usaha | Kamu mengisi **nilai usulan**. Penyetuju menetapkan nilai yang disepakati, dan nilai itulah yang menjadi modalmu.               |
2.  Isi nama barang, harga atau nilai, tanggal, umur pakai, dan lokasi kalau perlu.
3.  Untuk **Uang saya**, kamu bisa sekalian **Minta patungan ke owner lain** di bagian `patungan/`.
4.  Tambahkan foto barang dan foto nota. Untuk **Barang saya**, foto barang saja sudah dihitung sebagai bukti.
5.  Tekan `Simpan`.

## Setor uang ke kas usaha

Dipakai saat kamu memasukkan uang ke kas atau rekening usaha, bukan saat membayar belanja langsung.

1.  **Catat** → **Setor uang**.
2.  Isi jumlah, tanggal, metode, dan foto bukti transfer atau tanda terima.
3.  `Simpan`. Statusnya selalu menunggu, dan baru menambah porsi setelah disetujui owner lain.

## Menyetujui catatan owner lain

Angka merah di menu **Setujui** menunjukkan jumlah catatan yang menunggu keputusanmu. Yang muncul di sana hanya catatan yang **boleh kamu setujui**, yaitu bukan catatanmu dan bukan menyangkut uangmu.

1.  Buka **Setujui**. Catatan yang paling lama menunggu ada di atas.
2.  Periksa rinciannya dan **buka foto buktinya**. Pastikan jumlah di catatan sama dengan jumlah di nota.
3.  Kalau benar, tekan `Setujui`. Catatan menjadi aktif dan langsung dihitung ke kas dan porsi.
4.  Kalau salah, tekan `tolak/`, tulis alasannya (wajib), lalu **Tolak**. Catatan menjadi batal, dan alasannya terlihat oleh pencatat.

**Barang pribadi yang disetor:** sebelum menyetujui, ubah **Nilai yang disepakati** kalau bertiga sepakat nilai yang berbeda dari usulan.

Di bagian bawah halaman Setujui ada `catatan-saya-menunggu/`, berisi catatanmu yang masih menunggu, lengkap dengan nama owner yang bisa menyetujuinya.

## Kalau ada catatan yang salah

Buka **Beranda** → `riwayat/`. Di sana kamu bisa memfilter menurut status, jenis, owner, dan kategori. Cara membetulkan tergantung status catatannya:

| status catatan              | tombol           | yang terjadi                                                                                                                      |
|-----------------------------|------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| menunggu, catatanmu sendiri | `tarik-catatan/` | Langsung batal setelah alasan diisi, karena belum dihitung ke mana pun. Lalu catat ulang dengan benar.                            |
| aktif                       | `ajukan-batal/`  | Pengajuan masuk ke menu Setujui owner lain. Catatan tetap aktif sampai pengajuan disetujui; kalau ditolak, catatan tidak berubah. |

Kenapa pembatalan perlu disetujui? Membatalkan modal seseorang menggeser porsi. Jadi satu orang saja tidak bisa memotong porsi owner lain. Yang mengajukan juga tidak bisa menyetujui pengajuannya sendiri.

Aset yang dibeli lewat pengeluaran kas mengikuti pengeluarannya. Untuk membatalkan aset seperti ini, ajukan batal pada kartu **pengeluarannya**, bukan pada kartu asetnya.

## Satu orang bayar duluan, yang lain mengganti

Kalau Ray membayar belanja usaha dengan uangnya, lalu kamu mengganti sebagian ke Ray, modal ikut pindah: modal Ray berkurang, modalmu bertambah. Total modal usaha dan kas usaha tidak berubah.

1.  Ray mencatat belanjanya seperti biasa: **Dibayar dari uang pribadi saya** → **Modal**, lalu disetujui owner lain.
2.  Setelah kamu mengganti ke Ray, buka **Beranda** → `riwayat/` → kartu belanja itu → `ganti-ke-ray/`.
3.  Isi jumlahnya, atau ketuk `bagi rata` / `sisa`, lalu tambahkan foto bukti transfer dan tekan `Simpan ganti`.
4.  **Ray yang menyetujui** di menu Setujui setelah uangnya diterima. Porsi bergeser setelah disetujui.

Ray juga bisa mencatatnya sendiri lewat `catat-ganti-diterima/`. Dalam hal itu, orang yang mengganti yang menyetujui. Owner ketiga tidak ikut menyetujui karena porsinya tidak berubah.

**Bayar bersama di kasir** (misalnya Rifki Rp200.000 dan Ray Rp100.000 untuk satu nota): satu orang mencatat seluruh belanjanya, lalu yang lain mencatat bagiannya sebagai ganti ke orang itu.

Kartu belanja menampilkan `pembagian-bayar/`: siapa yang sudah mengganti dan berapa yang masih ditanggung pembayar. Kalau belanjanya dibatalkan, gantinya ikut batal.

Kalau kamu ingin **menagih** (supaya yang lain diingatkan dan kamu tahu siapa yang belum bayar), pakai bagian "patungan". Ganti yang dicatat oleh orang yang punya tagihan otomatis tertaut ke tagihannya.

## Minta patungan, seperti split bill

Patungan adalah **tagihan**: "Ray, tolong ikut tanggung Rp100.000 untuk belanja ini." Tagihan belum memindahkan uang maupun porsi. Porsi baru bergeser setelah yang ditagih benar-benar mengganti dan kamu menyetujuinya.

|                 | patungan                            | ganti                                   |
|-----------------|-------------------------------------|-----------------------------------------|
| artinya         | permintaan: "tolong ikut Rp100.000" | bukti bayar: "sudah transfer Rp100.000" |
| uang pindah?    | belum                               | sudah                                   |
| porsi bergeser? | tidak                               | ya, setelah disetujui penerima          |

### Meminta patungan (yang membayar duluan)

1.  Saat mencatat belanja uang pribadi (Modal) atau aset **Uang saya**, centang **Minta patungan ke owner lain**, lalu isi bagian tiap orang. `bagi rata` membagi nilai belanja untuk bertiga.
2.  Belanja yang sudah tercatat juga bisa: `riwayat/` → kartu belanjanya → `minta-patungan/`.
3.  Yang ditagih menerima notifikasi. Mereka baru bisa membayar setelah belanjanya disetujui.

### Ditagih patungan (yang diminta)

Di **Beranda** muncul kartu **"Kamu belum ganti ke …"**. Pilih salah satu:

- `Sudah saya transfer`: setelah uangnya benar-benar kamu kirim. Boleh **sebagian** dulu; sisanya tetap tampil. Sertakan foto bukti transfer. Yang menagih mengonfirmasi di menu Setujui, lalu porsimu naik.
- `tidak-ikut/`: kalau kamu tidak ikut menanggung. Alasan wajib. Kalau alasannya karena kamu sudah menanggung belanja lain (misalnya beli sedotan sendiri), pilih belanja itu di **Saya sudah menanggung belanja lain** supaya tercatat untuk audit. Sisa tagihan tetap menjadi modal yang menagih.

### Memantau tagihanmu

Di Beranda, kartu **"Patunganmu belum lunas"** menampilkan status tiap orang: lunas, belum lunas, menunggu konfirmasi, atau tidak ikut beserta alasannya.

- `ingatkan/` mengirim notifikasi pengingat saat itu juga.
- Aplikasi juga mengingatkan **otomatis tiap 3 hari pukul 09.00 WIB** selama tagihan belum lunas.
- `batalkan/` membatalkan tagihan (alasan wajib), misalnya salah orang atau salah jumlah, lalu minta ulang.

&nbsp;

    Rifki beli buah Rp300.000, minta Ray & Ramdani @Rp100.000
      Ray transfer Rp100.000          → Rifki 200.000 · Ray 100.000 · Ramdani 0
      Ramdani transfer Rp50.000 dulu  → Rifki 150.000 · Ray 100.000 · Ramdani 50.000
      Ramdani lunasi Rp50.000         → Rifki 100.000 · Ray 100.000 · Ramdani 100.000
    Total modal tetap Rp300.000 = nilai belanja. Kas usaha tidak berubah.

Aturan yang dijaga database: total patungan dan ganti tidak bisa melebihi nilai belanja; bayar melebihi sisa tagihan ditolak; tagihan tidak bisa ditolak atau dibatalkan selama ada ganti yang menunggu konfirmasi; kalau belanjanya dibatalkan, tagihannya ikut batal.

## Memantau ide dan uji coba (R&D)

Setiap ide dicatat perkembangannya sampai diputuskan bersama. Ada dua jalur ide:

- **Produk:** racikan, menu, kemasan.
- **Sistem:** SOP pembuatan, alat, supplier, alur kas.

Tahap sebuah ide: **Ide** → **Diuji** → **Evaluasi** → **Diadopsi** atau **Dihentikan**.

### Ide baru dan catatannya

1.  **Beranda** → `r&d/` → `Ide baru`. Isi judul, jalur, jenis, PIC, dan tujuan/hipotesis.
2.  Di halaman ide, tambahkan catatan dengan jenis:
    - **Progres**: perkembangan biasa.
    - **Uji**: uji racikan (lihat di bawah).
    - **Keputusan**: Diadopsi atau Dihentikan. Keputusan **harus disetujui owner lain**, sama seperti catatan uang.

### Uji racikan dan biaya per cup

1.  Isi dulu harga bahan di `bahan/`. Contoh: jeruk Rp30.000 untuk 1.000 gram, maka harganya Rp30/gram.
2.  Buat catatan **Uji**. Isi resep satu batch (bahan dan takaran) serta jumlah cup yang dihasilkan. Estimasi **biaya per cup** langsung muncul.
3.  Di kartu uji, tekan `+ skor-penilai/` untuk mencatat skor 1–5 dari penilai. Penilai boleh orang luar, cukup ditulis namanya.

Kartu uji menampilkan dua angka: **biaya/cup saat uji** (harga bahan pada hari uji, tidak berubah) dan **dengan harga kini** (resep yang sama dengan harga bahan terbaru). Angka kedua dipakai saat menentukan harga jual.

## Laporan dan ekspor CSV

Menu **Laporan** berisi lima bagian, dan semuanya hanya menghitung catatan aktif:

- **Porsi kepemilikan**: rincian per bentuk (setor uang, bayar pengeluaran, beli aset, setor barang).
- **Talangan**: sisa utang usaha ke tiap owner.
- **Biaya pra-operasi**: per kategori, dipisah antara dari kas usaha dan dibayar owner.
- **Aset + nilai buku**: setelah penyusutan bulanan.
- **Belum ada bukti**: catatan yang masih perlu difoto.

Tombol `ekspor-csv/` di tiap bagian mengunduh file yang bisa dibuka di Google Sheets atau Excel. Angka uang ditulis polos (mis. 1350000) supaya bisa langsung dijumlah.

## Cara porsi dihitung

Porsi = modal bersih kamu ÷ modal bersih bertiga × 100. Modal bersih adalah kontribusi aktif dikurangi penarikan modal, ditambah ganti yang kamu bayar ke owner lain dan dikurangi ganti yang kamu terima. Rp1 untuk belanja R&D bernilai sama dengan Rp1 setoran. Talangan tidak dihitung. Tagihan patungan juga belum dihitung sampai benar-benar dibayar dan disetujui.

    Rifki    setor Rp1.000.000 + belanja R&D Rp350.000 = Rp1.350.000
    Ray      setor barang Rp600.000 + belanja Rp250.000 = Rp  850.000
    Ramdani  setor Rp800.000                           = Rp  800.000
                                              total    = Rp3.000.000

    Porsi Rifki   = 1.350.000 ÷ 3.000.000 × 100 = 45,00%
    Porsi Ray     =   850.000 ÷ 3.000.000 × 100 = 28,33%
    Porsi Ramdani =   800.000 ÷ 3.000.000 × 100 = 26,67%

Porsi berubah setiap ada kontribusi yang disetujui. Karena itu, catat semua belanja R&D sejak awal beserta fotonya, lalu saling setujui. Setelah itu baru angka porsi mencerminkan kenyataan.

## Notifikasi di HP

Setelah notifikasi aktif, HP-mu memberi kabar saat:

- ada catatan baru yang perlu **kamu** setujui ("Perlu persetujuanmu");
- ada pengajuan batal yang perlu kamu putuskan;
- catatanmu disetujui, ditolak, atau dibatalkan, beserta alasannya;
- pengajuan batalmu disetujui atau ditolak;
- kamu diminta patungan, diingatkan (manual atau otomatis tiap 3 hari), atau tagihanmu dibatalkan;
- owner lain tidak ikut patungan yang kamu minta.

Ketuk notifikasinya untuk langsung membuka halaman yang dimaksud.

- **iPhone:** butuh iOS 16.4 atau lebih baru, dan 3Rally harus dibuka dari ikon layar utama, bukan dari tab Safari.
- Notifikasi diaktifkan **per HP**. Kalau ganti HP, aktifkan lagi di HP baru.
- Notifikasi hanya pengingat. Yang menjadi patokan tetap angka di menu **Setujui**.

## Backup untuk audit

Setiap **Senin pukul 01.00 WIB**, seluruh data otomatis disalin ke Google Drive akun usaha, di folder **Audit 3Rally/backup/\<tanggal\>/**. Isinya: salinan database, file CSV per tabel dan laporan, serta daftar checksum (SHA256SUMS) sebagai bukti file tidak diubah. Folder lama tidak pernah ditimpa. Folder ini dibagikan Rifki ke kalian bertiga sebagai **Viewer** (hanya bisa melihat).

Foto bukti tersimpan di aplikasi dan belum ikut ter-backup ke Drive.

## Kalau ada masalah

**Tombol simpan bertuliskan "Tidak ada sinyal"**  
Tidak ada yang tersimpan. Cari sinyal, lalu tekan simpan lagi. Isian form tetap ada, dan catatan tidak akan tercatat ganda.

**Catatanku tidak muncul di menu Setujui**  
Memang begitu: kamu tidak bisa menyetujui catatanmu sendiri. Catatanmu ada di bagian bawah halaman Setujui, di `catatan-saya-menunggu/`.

**Salah ketik jumlah**  
Masih menunggu: `tarik-catatan/`, lalu catat ulang. Sudah aktif: `ajukan-batal/`, lalu catat ulang setelah pengajuan disetujui. Lihat bagian "Kalau ada catatan yang salah".

**Lupa memotret nota**  
Catatan tetap tersimpan dan muncul di "belum ada bukti" (Beranda dan Laporan). Sertakan foto nota sejak awal di catatan berikutnya.

**Notifikasi tidak muncul**  
Tekan `kirim-tes/` dan baca pesan di bawahnya. Kalau izin diblokir, buka pengaturan HP → aplikasi/situs 3Rally → Notifikasi → Izinkan. Di iPhone, pastikan aplikasi dibuka dari ikon layar utama.

**Tombol "Sudah saya transfer" tidak ada**  
Belanjanya belum disetujui (kartu menulis "masih menunggu persetujuan"), atau tagihan sudah lunas / sedang menunggu konfirmasi. Tunggu persetujuan dulu.

**Lupa password / perlu akun baru**  
Pakai `lupa-password/` di halaman masuk, atau hubungi Rifki.

**Bantuan:** Rifki. Untuk akun, kendala aplikasi, dan perubahan aturan, termasuk batas persetujuan Rp500.000 yang disepakati bertiga.
