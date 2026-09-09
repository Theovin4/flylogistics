param(
  [string]$OutputDir = "backups",
  [switch]$SchemaOnly
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
  Write-Error "DATABASE_URL is required. Set it to your Supabase pooled or direct Postgres connection string before exporting."
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  Write-Error "pg_dump was not found. Install PostgreSQL client tools or use Supabase dashboard exports."
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$suffix = if ($SchemaOnly) { "schema" } else { "full" }
$outputPath = Join-Path $OutputDir "fly-logistics-$suffix-$timestamp.sql"

$args = @("--no-owner", "--no-privileges", "--file", $outputPath)
if ($SchemaOnly) {
  $args += "--schema-only"
}
$args += $env:DATABASE_URL

& $pgDump.Source @args

Write-Host "Supabase export written to $outputPath"
