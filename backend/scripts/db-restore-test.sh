#!/usr/bin/env bash
# Restore a backup into a test database (optional DB name).
# Usage: ./scripts/db-restore-test.sh <backup.sql> [test_db_name]
# Example: ./scripts/db-restore-test.sh ../backups/attendance_saas_20250101_120000.sql attendance_saas_test
# Creates test_db_name if it doesn't exist, then restores. Use for verifying backups.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_FILE="${1:?Usage: $0 <backup.sql> [test_db_name]}"
TEST_DB="${2:-attendance_saas_test}"

if [ -f "$BACKEND_ROOT/.env" ]; then
  set -a
  source "$BACKEND_ROOT/.env"
  set +a
fi

: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"
: "${DB_USER:=postgres}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

export PGPASSWORD="$DB_PASSWORD"
# Create test DB if not exists (connect to postgres DB to create)
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$TEST_DB'" | grep -q 1 || \
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $TEST_DB;"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB" -f "$BACKUP_FILE"
unset PGPASSWORD

echo "Restored $BACKUP_FILE into database $TEST_DB. Verify with: psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $TEST_DB -c '\\dt'"
