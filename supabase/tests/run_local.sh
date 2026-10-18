#!/usr/bin/env bash
# Uji skema + migrasi di PostgreSQL lokal dengan Supabase tiruan (bukan Supabase sungguhan).
# Pakai: supabase/tests/run_local.sh   (butuh psql + server PostgreSQL yang bisa diakses sebagai superuser)
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${DB:-trally_uji}
PSQL=${PSQL:-"psql -X -q -v ON_ERROR_STOP=1"}

dropdb --if-exists "$DB"
createdb "$DB"
$PSQL -d "$DB" -f tests/_mock_supabase.sql
$PSQL -d "$DB" -f schema.sql
for f in migrations/*.sql; do $PSQL -d "$DB" -f "$f"; done

status=0
for t in tests/[0-9]*.sql; do
  out=$(psql -X -q -d "$DB" -f "$t" 2>&1 || true)
  echo "$out" | sed -n '/HASIL UJI/,$p'
  echo "$out" | grep -q "SEMUA LULUS" || status=1
done
exit $status
