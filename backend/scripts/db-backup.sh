#!/usr/bin/env bash
# PostgreSQL backup for Attendance SaaS.
# Usage: ./scripts/db-backup.sh [backup_dir]
# Requires: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD in env or .env in backend root.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${1:-$BACKEND_ROOT/backups}"

if [ -f "$BACKEND_ROOT/.env" ]; then
  set -a
  source "$BACKEND_ROOT/.env"
  set +a
fi

: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"
: "${DB_NAME:=attendance_saas}"
: "${DB_USER:=postgres}"

mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/attendance_saas_$STAMP.sql"

export PGPASSWORD="$DB_PASSWORD"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --no-owner --no-acl -f "$FILE"
unset PGPASSWORD

echo "Backup written to $FILE"
# Optional: keep only last 7 days
# find "$BACKUP_DIR" -name 'attendance_saas_*.sql' -mtime +7 -delete
