param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 5432,
  [string]$AdminUser = "postgres",
  [string]$DatabaseName = "m1_dev",
  [string]$PgBin = $env:PG_BIN,
  [string]$FlywayExecutable = "flyway"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-LocalHost {
  param([string]$Value)
  $allowed = @("127.0.0.1", "localhost", "::1")
  if ($allowed -notcontains $Value) {
    throw "Refusing to initialize a non-local database host: $Value"
  }
}

function Assert-Identifier {
  param([string]$Value, [string]$Name)
  if ($Value -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') {
    throw "$Name must be a simple PostgreSQL identifier: $Value"
  }
}

function Resolve-Tool {
  param([string]$Name)
  if ($PgBin -and $PgBin.Trim().Length -gt 0) {
    $candidate = Join-Path $PgBin "$Name.exe"
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw "Required tool not found: $Name. Set PG_BIN or PATH."
  }
  return $cmd.Source
}

function Invoke-Checked {
  param([string]$File, [string[]]$Arguments)
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed: $File $($Arguments -join ' ')"
  }
}

Assert-LocalHost $HostName
Assert-Identifier $DatabaseName "DatabaseName"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$migrationDir = (Resolve-Path (Join-Path $repoRoot "db\migrations")).Path
if ($migrationDir -match [regex]::Escape("experiments")) {
  throw "Refusing to use experiments migration directory: $migrationDir"
}

$sqlCount = (Get-ChildItem -LiteralPath $migrationDir -Filter "*.sql" | Measure-Object).Count
if ($sqlCount -ne 80) {
  throw "Expected 80 SQL migrations in db/migrations, found $sqlCount"
}

$psql = Resolve-Tool "psql"
$createdb = Resolve-Tool "createdb"

$adminBase = @("-h", $HostName, "-p", [string]$Port, "-U", $AdminUser, "-d", "postgres", "-v", "ON_ERROR_STOP=1")

$roleSql = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_owner') THEN
    CREATE ROLE migration_owner LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'application_rw') THEN
    CREATE ROLE application_rw LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'application_ro') THEN
    CREATE ROLE application_ro LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'background_worker') THEN
    CREATE ROLE background_worker LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    CREATE ROLE backup_operator LOGIN;
  END IF;
END
`$`$;
"@

Invoke-Checked -File $psql -Arguments ($adminBase + @("-c", $roleSql))

$exists = & $psql @adminBase "-t" "-A" "-c" "SELECT 1 FROM pg_database WHERE datname = '$DatabaseName';"
if ($LASTEXITCODE -ne 0) {
  throw "Database existence check failed."
}
if (($exists -join "").Trim() -eq "1") {
  throw "Database already exists; refusing to overwrite: $DatabaseName"
}

Invoke-Checked -File $createdb -Arguments @("-h", $HostName, "-p", [string]$Port, "-U", $AdminUser, "-O", "migration_owner", $DatabaseName)
Invoke-Checked -File $psql -Arguments ($adminBase + @("-c", "ALTER DATABASE $DatabaseName SET TimeZone TO 'UTC';"))

$flywayLocation = "filesystem:$($migrationDir.Replace('\', '/'))"
$flywayUrl = [string]::Format("jdbc:postgresql://{0}:{1}/{2}", $HostName, $Port, $DatabaseName)
$flywayArgs = @(
  "-url=$flywayUrl",
  "-user=migration_owner",
  "-locations=$flywayLocation",
  "-schemas=flyway_history,m1",
  "-defaultSchema=flyway_history",
  "-table=flyway_schema_history",
  "-createSchemas=true",
  "-cleanDisabled=true",
  "-placeholderReplacement=false",
  "-connectRetries=3"
)

Invoke-Checked -File $FlywayExecutable -Arguments ($flywayArgs + @("migrate"))
Invoke-Checked -File $FlywayExecutable -Arguments ($flywayArgs + @("info"))
Invoke-Checked -File $FlywayExecutable -Arguments ($flywayArgs + @("validate"))
Invoke-Checked -File $FlywayExecutable -Arguments ($flywayArgs + @("migrate"))

$metadataGrantSql = @"
GRANT USAGE ON SCHEMA flyway_history TO application_ro, background_worker;
GRANT SELECT ON flyway_history.flyway_schema_history TO application_ro, background_worker;
"@
$targetDbBase = @("-h", $HostName, "-p", [string]$Port, "-U", $AdminUser, "-d", $DatabaseName, "-v", "ON_ERROR_STOP=1")
Invoke-Checked -File $psql -Arguments ($targetDbBase + @("-c", $metadataGrantSql))

[pscustomobject]@{
  status = "ok"
  database = $DatabaseName
  host = $HostName
  port = $Port
  migrations = $sqlCount
  migration_source = "db/migrations"
  real_data_imported = $false
} | ConvertTo-Json -Depth 4
