param(
  [string]$BackupDir = $env:BACKUP_DIR,
  [int]$RetentionDays = $(if ($env:BACKUP_RETENTION_DAYS) { [int]$env:BACKUP_RETENTION_DAYS } else { 14 })
)

if (-not $BackupDir) {
  $BackupDir = "backups"
}

if (-not $env:DATABASE_URL) {
  Write-Error "DATABASE_URL is required."
  exit 1
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  Write-Error "pg_dump not found in PATH. Install PostgreSQL client tools first."
  exit 1
}

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "tradebay-$timestamp.dump"
$filePath = Join-Path $BackupDir $fileName

Write-Output "Creating backup: $filePath"
& $pgDump.Source --format=custom --dbname="$env:DATABASE_URL" --file="$filePath"
if ($LASTEXITCODE -ne 0) {
  Write-Error "pg_dump failed with exit code $LASTEXITCODE"
  exit $LASTEXITCODE
}

Write-Output "Backup complete: $filePath"

$cutoff = (Get-Date).AddDays(-1 * $RetentionDays)
Get-ChildItem -Path $BackupDir -File | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
  Write-Output "Removing old backup: $($_.FullName)"
  Remove-Item -LiteralPath $_.FullName -Force
}

Write-Output "Retention cleanup complete (days=$RetentionDays)."
