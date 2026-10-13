#!/usr/bin/env bash

set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI is required: https://supabase.com/docs/guides/local-development/cli/getting-started"
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "OpenSSL is required to encrypt the backup."
  exit 1
fi

if [ -z "${SUPABASE_DB_URL:-}" ] || [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "Set SUPABASE_DB_URL and BACKUP_ENCRYPTION_KEY before running this script."
  exit 1
fi

backup_dir="$(mktemp -d)"
trap 'rm -rf "$backup_dir"' EXIT

mkdir -p backups
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output="backups/supabase-${timestamp}.sql.tar.gz.enc"

supabase db dump --db-url "$SUPABASE_DB_URL" --file "$backup_dir/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" --file "$backup_dir/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" --file "$backup_dir/data.sql" --data-only --use-copy \
  --exclude storage.buckets_vectors \
  --exclude storage.vector_indexes

tar -C "$backup_dir" -czf - roles.sql schema.sql data.sql \
  | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
      -pass env:BACKUP_ENCRYPTION_KEY \
      -out "$output"

echo "Encrypted backup created at $output"
