param(
  [string]$Path = ".env.local",
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-LocalSecret {
  $bytes = [byte[]]::new(24)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }
  return ([Convert]::ToBase64String($bytes) -replace "[+/=]", "")
}

function Join-DatabaseUrl {
  param(
    [string]$Role,
    [string]$Password,
    [string]$HostName,
    [int]$Port,
    [string]$DatabaseName
  )
  $scheme = "postgresql" + "://"
  return "$scheme$Role`:$Password@$HostName`:$Port/$DatabaseName"
}

if ((Test-Path -LiteralPath $Path) -and -not $Force) {
  [pscustomobject]@{
    status = "exists"
    path = (Resolve-Path -LiteralPath $Path).Path
    changed = $false
    note = "Existing local env file was left unchanged."
  } | ConvertTo-Json -Depth 3
  exit 0
}

$hostName = "127.0.0.1"
$devPort = 55432
$dryRunPort = 55433
$devDb = "m1_local_dev"
$adminPassword = New-LocalSecret
$migrationPassword = New-LocalSecret
$rwPassword = New-LocalSecret
$roPassword = New-LocalSecret
$workerPassword = New-LocalSecret
$backupPassword = New-LocalSecret

$lines = @(
  "# Local-only M1 development settings. Never commit this file.",
  "M1_APP_ENV=local",
  "M1_HTTP_PORT=3000",
  "M1_LOCAL_DEV_ENVIRONMENT_NAME=m1-local-dev",
  "M1_LOCAL_DRY_RUN_ENVIRONMENT_NAME=m1-local-dry-run",
  "M1_LOCAL_DB_HOST=$hostName",
  "M1_LOCAL_DEV_DB_PORT=$devPort",
  "M1_LOCAL_DRY_RUN_DB_PORT=$dryRunPort",
  "M1_LOCAL_DEV_DB_NAME=$devDb",
  "M1_LOCAL_DRY_RUN_DB_NAME=m1_local_dry_run",
  "M1_POSTGRES_ADMIN_USER=postgres",
  "M1_POSTGRES_ADMIN_PASSWORD=$adminPassword",
  "M1_MIGRATION_OWNER_PASSWORD=$migrationPassword",
  "M1_APPLICATION_RW_PASSWORD=$rwPassword",
  "M1_APPLICATION_RO_PASSWORD=$roPassword",
  "M1_BACKGROUND_WORKER_PASSWORD=$workerPassword",
  "M1_BACKUP_OPERATOR_PASSWORD=$backupPassword",
  "M1_DATABASE_URL=$(Join-DatabaseUrl -Role "application_rw" -Password $rwPassword -HostName $hostName -Port $devPort -DatabaseName $devDb)",
  "M1_DATABASE_READONLY_URL=$(Join-DatabaseUrl -Role "application_ro" -Password $roPassword -HostName $hostName -Port $devPort -DatabaseName $devDb)",
  "M1_DATABASE_BACKGROUND_URL=$(Join-DatabaseUrl -Role "background_worker" -Password $workerPassword -HostName $hostName -Port $devPort -DatabaseName $devDb)"
)

Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8

[pscustomobject]@{
  status = "ok"
  path = (Resolve-Path -LiteralPath $Path).Path
  changed = $true
  realDataImported = $false
  formalDatabaseConnected = $false
} | ConvertTo-Json -Depth 3
