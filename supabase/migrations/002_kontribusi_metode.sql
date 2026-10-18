-- =====================================================================
-- Migrasi 002: metode pembayaran untuk kontribusi (fitur Setor uang)
-- CLAUDE.md §6.5 meminta "jumlah, tanggal, metode, bukti transfer", tapi tabel kontribusi
-- belum punya kolom metode. Kolom boleh kosong: kontribusi otomatis dari transaksi/aset
-- tidak mengisinya (metodenya ada di transaksi sumbernya).
-- Jalankan sekali di SQL Editor Supabase SETELAH migrasi 001.
-- =====================================================================

alter table kontribusi
  add column if not exists metode text check (metode in ('tunai', 'qris', 'transfer'));

-- Setor uang wajib menyebut metode (hanya untuk baris baru; data lama tidak dicek ulang)
alter table kontribusi
  add constraint kontribusi_setor_uang_metode
  check (bentuk <> 'setor_uang' or metode is not null) not valid;
