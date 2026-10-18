#!/usr/bin/env bash
# Backup audit 3Rally (CLAUDE.md §7): dump skema public + CSV semua tabel & view + SHA256SUMS,
# lalu unggah ke Google Drive lewat rclone. Dipanggil oleh .github/workflows/backup.yml.
#
# Env wajib : SUPABASE_DB_URL  (connection string Session pooler, berisi password — dari GitHub secret)
# Env rclone: remote bernama "gdrive" (di workflow dikonfigurasi lewat RCLONE_CONFIG_GDRIVE_*)
# Opsional  : TUJUAN (default "gdrive:Audit 3Rally/backup"), KERJA (folder sementara)
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL belum diisi (GitHub → Settings → Secrets and variables → Actions)}"
TUJUAN=${TUJUAN:-"gdrive:Audit 3Rally/backup"}
KERJA=${KERJA:-$(mktemp -d)}

# Tanggal WIB (UTC+7) tanpa bergantung pada tzdata: Senin 01.00 WIB = Minggu 18.00 UTC
TANGGAL=$(date -u -d '+7 hours' +%F)
OUT="$KERJA/$TANGGAL"
mkdir -p "$OUT/csv"

PSQL=(psql "$SUPABASE_DB_URL" -X -q -v ON_ERROR_STOP=1)

echo "== pg_dump skema public"
pg_dump "$SUPABASE_DB_URL" --schema=public --no-owner --no-privileges --file="$OUT/3rally-public.sql"

echo "== CSV semua tabel & view di schema public"
# Daftar diambil dari database, jadi tabel/view baru (migrasi berikutnya) ikut tanpa mengubah skrip ini
mapfile -t OBJEK < <("${PSQL[@]}" -At -c \
  "select table_name from information_schema.tables where table_schema = 'public' order by table_type, table_name")
for t in "${OBJEK[@]}"; do
  [[ $t =~ ^[a-z0-9_]+$ ]] || { echo "lewati nama tidak wajar: $t"; continue; }
  "${PSQL[@]}" -c "\\copy (select * from public.\"$t\") to '$OUT/csv/$t.csv' with (format csv, header true)"
  echo "  $t: $(($(wc -l < "$OUT/csv/$t.csv") - 1)) baris"
done

echo "== SHA256SUMS.txt"
(cd "$OUT" && find . -type f ! -name SHA256SUMS.txt -printf '%P\n' | sort | xargs sha256sum > SHA256SUMS.txt)

# Folder per tanggal tidak pernah ditimpa: bila sudah ada (mis. dijalankan manual dua kali
# di hari yang sama), pakai folder baru bersufiks jam WIB.
NAMA=$TANGGAL
if [[ -n $(rclone lsf "$TUJUAN/$NAMA" 2>/dev/null || true) ]]; then
  NAMA="${TANGGAL}_$(date -u -d '+7 hours' +%H%M%S)"
  echo "Folder $TANGGAL sudah ada → unggah ke $NAMA"
fi

echo "== unggah ke $TUJUAN/$NAMA"
# copy (bukan sync): tidak pernah menghapus; --immutable: gagal bila ada file yang akan diubah
rclone copy "$OUT" "$TUJUAN/$NAMA" --immutable
rclone check "$OUT" "$TUJUAN/$NAMA" --one-way

echo "Selesai: $TUJUAN/$NAMA ($(find "$OUT" -type f | wc -l) file)"
