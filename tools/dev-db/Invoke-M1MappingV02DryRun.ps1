param(
  [string]$EnvFile = ".env.local",
  [string]$StageJsonPath = "experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.2.json",
  [string]$PreflightSqlPath = "experiments/m1-mapping-version-import-candidate/00_preflight_gate.sql",
  [string]$ControlledImportSqlPath = "experiments/m1-mapping-version-import-candidate/01_controlled_import_candidate.sql",
  [string]$AssertionSqlPath = "experiments/m1-mapping-version-import-candidate/03_rehearsal_assertions_v0.2.sql",
  [string]$SummaryPath,
  [string]$ReportPath,
  [string]$PgBin = $env:PG_BIN
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-DotEnv {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing local env file: $Path. Run tools/dev-db/New-M1LocalEnvFile.ps1 first."
  }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
      continue
    }
    $parts = $trimmed.Split("=", 2)
    if ($parts.Count -eq 2) {
      $values[$parts[0]] = $parts[1]
    }
  }
  return $values
}

function Require-Value {
  param([hashtable]$Values, [string]$Name)
  if (-not $Values.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Values[$Name])) {
    throw "$Name is required in .env.local"
  }
  return [string]$Values[$Name]
}

function Resolve-PgTool {
  param([string]$Name)
  if ($PgBin -and $PgBin.Trim().Length -gt 0) {
    $candidate = Join-Path $PgBin "$Name.exe"
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  $fallback = "C:\Program Files\PostgreSQL\16\bin\$Name.exe"
  if (Test-Path -LiteralPath $fallback) {
    return $fallback
  }
  throw "Required PostgreSQL tool not found: $Name"
}

function Assert-LocalDryRunTarget {
  param([string]$HostName, [string]$DatabaseName)
  if ($HostName -notin @("127.0.0.1", "localhost", "::1")) {
    throw "Refusing non-local host: $HostName"
  }
  $joined = "$HostName $DatabaseName".ToLowerInvariant()
  if ($joined -match "prod|production|staging|shared|formal") {
    throw "Refusing formal/staging/production/shared target: $HostName / $DatabaseName"
  }
}

function ConvertTo-DryRunScript {
  param(
    [string]$SqlPath,
    [string]$StageJsonBase64,
    [switch]$WrapInRollbackTransaction,
    [switch]$SetCandidateVariables
  )
  $source = Get-Content -LiteralPath $SqlPath -Raw -Encoding UTF8
  $patched = $source.Replace("(:'stage_json')::jsonb", "(convert_from(decode(:'stage_json_base64','base64'),'UTF8'))::jsonb")
  $lines = @("\set ON_ERROR_STOP on", "\set stage_json_base64 $StageJsonBase64")
  if ($SetCandidateVariables) {
    $lines += "\set candidate_version_no 2026062102"
    $lines += "\set actor local_docker_dry_run"
  }
  if ($WrapInRollbackTransaction) {
    $lines += "BEGIN;"
    $lines += $patched
    $lines += "ROLLBACK;"
  } else {
    $lines += $patched
  }
  $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("m1-dry-run-" + [Guid]::NewGuid().ToString("N") + ".sql")
  Set-Content -LiteralPath $tempFile -Value $lines -Encoding UTF8
  return $tempFile
}

function Invoke-PsqlFile {
  param([string]$SqlPath)
  $env:PGPASSWORD = $script:MigrationPassword
  try {
    $output = & $script:Psql -h $script:HostName -p ([string]$script:Port) -U migration_owner -d $script:DatabaseName -X -v ON_ERROR_STOP=1 -A -F "|" -P pager=off -f $SqlPath 2>&1
    $exit = $LASTEXITCODE
  }
  finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
  if ($exit -ne 0) {
    throw "psql dry-run file failed: $SqlPath`n$($output -join "`n")"
  }
  return ($output -join "`n").Trim()
}

function Invoke-PsqlScalar {
  param([string]$Sql)
  $env:PGPASSWORD = $script:MigrationPassword
  try {
    $output = & $script:Psql -h $script:HostName -p ([string]$script:Port) -U migration_owner -d $script:DatabaseName -X -v ON_ERROR_STOP=1 -t -A -c $Sql 2>&1
    $exit = $LASTEXITCODE
  }
  finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
  if ($exit -ne 0) {
    throw "psql scalar check failed: $Sql`n$($output -join "`n")"
  }
  return ($output -join "").Trim()
}

function Test-OutputContains {
  param([string]$Output, [string]$Needle)
  return $Output -like "*$Needle*"
}

$envValues = Read-DotEnv -Path $EnvFile
$script:HostName = Require-Value $envValues "M1_LOCAL_DB_HOST"
$script:Port = [int](Require-Value $envValues "M1_LOCAL_DRY_RUN_DB_PORT")
$script:DatabaseName = Require-Value $envValues "M1_LOCAL_DRY_RUN_DB_NAME"
$script:MigrationPassword = Require-Value $envValues "M1_MIGRATION_OWNER_PASSWORD"
Assert-LocalDryRunTarget -HostName $script:HostName -DatabaseName $script:DatabaseName

foreach ($path in @($StageJsonPath, $PreflightSqlPath, $ControlledImportSqlPath, $AssertionSqlPath)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required dry-run artifact not found: $path"
  }
}

$script:Psql = Resolve-PgTool "psql"
$stageJson = Get-Content -LiteralPath $StageJsonPath -Raw -Encoding UTF8
$stageJsonBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($stageJson))

$tempFiles = @()
try {
  $preflightFile = ConvertTo-DryRunScript -SqlPath $PreflightSqlPath -StageJsonBase64 $stageJsonBase64 -WrapInRollbackTransaction
  $tempFiles += $preflightFile
  $preflightOutput = Invoke-PsqlFile -SqlPath $preflightFile

  $importFile = ConvertTo-DryRunScript -SqlPath $ControlledImportSqlPath -StageJsonBase64 $stageJsonBase64 -SetCandidateVariables
  $tempFiles += $importFile
  $importOutput = Invoke-PsqlFile -SqlPath $importFile

  $assertionFile = ConvertTo-DryRunScript -SqlPath $AssertionSqlPath -StageJsonBase64 $stageJsonBase64
  $tempFiles += $assertionFile
  $assertionOutput = Invoke-PsqlFile -SqlPath $assertionFile
}
finally {
  foreach ($file in $tempFiles) {
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
  }
}

$preflightPass = ($preflightOutput -notmatch "\|FAIL\|") -and ($preflightOutput -match "COUNT_PHYSICAL_ROWS\|PASS")
$importRolledBack = (Invoke-PsqlScalar "SELECT count(*) FROM m1.mapping_version WHERE trigger_ref = 'MVC-M1-V0.1-20260621';") -eq "0"
$assertionsPass = @(
  "G06_Y167972_FOLD|PASS",
  "G07_RAW_IDENTITY_COMPATIBILITY|PASS",
  "G07_RAW_UNIQUE_COMPATIBILITY|PASS",
  "G07_REVISED_STRATEGY|PASS"
) | ForEach-Object { Test-OutputContains -Output $assertionOutput -Needle $_ }
$assertionsPass = -not ($assertionsPass -contains $false)
$activeMappingCount = Invoke-PsqlScalar "SELECT count(*) FROM m1.mapping_version WHERE status = 'active';"
$switchPrivilegeCheck = Invoke-PsqlScalar "SELECT has_function_privilege('background_worker', 'm1.switch_mapping_version(bigint,text)', 'EXECUTE');"

$status = if ($preflightPass -and $importRolledBack -and $assertionsPass -and $activeMappingCount -eq "0" -and $switchPrivilegeCheck -eq "f") { "ok" } else { "failed" }

$summary = [pscustomobject]@{
  status = $status
  environmentName = "m1-local-dry-run"
  database = $script:DatabaseName
  host = $script:HostName
  port = $script:Port
  stageArtifact = "mapping_import_stage-v0.2.json"
  preflightPassed = $preflightPass
  controlledImportRolledBack = $importRolledBack
  g06g07Passed = $assertionsPass
  activeMappingCount = [int]$activeMappingCount
  backgroundWorkerCanSwitchMappingVersion = ($switchPrivilegeCheck -eq "t")
  formalDatabaseConnected = $false
  realDataImported = $false
  mappingVersionActivated = $false
  switchMappingVersionCalled = $false
}

if ($SummaryPath) {
  $parent = Split-Path -Parent $SummaryPath
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  $summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $SummaryPath -Encoding UTF8
}

if ($ReportPath) {
  $parent = Split-Path -Parent $ReportPath
  if ($parent) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  $report = @(
    "# M1 mapping_version v0.2 local Docker dry-run report",
    "",
    "- status: $($summary.status)",
    "- environment: $($summary.environmentName)",
    "- database: $($summary.database)",
    "- host: $($summary.host)",
    "- port: $($summary.port)",
    "- stage artifact: $($summary.stageArtifact)",
    "- preflight passed: $($summary.preflightPassed)",
    "- controlled import rolled back: $($summary.controlledImportRolledBack)",
    "- G06/G07 passed: $($summary.g06g07Passed)",
    "- active mapping count: $($summary.activeMappingCount)",
    "- background_worker can switch mapping version: $($summary.backgroundWorkerCanSwitchMappingVersion)",
    "- formal database connected: false",
    "- real data imported: false",
    "- mapping version activated: false",
    "- switch_mapping_version called: false",
    "",
    "## Preflight output",
    "",
    '```text',
    $preflightOutput,
    '```',
    "",
    "## Controlled import dry-run output",
    "",
    '```text',
    $importOutput,
    '```',
    "",
    "## G06/G07 output",
    "",
    '```text',
    $assertionOutput,
    '```'
  )
  Set-Content -LiteralPath $ReportPath -Value $report -Encoding UTF8
}

$summary | ConvertTo-Json -Depth 6
if ($status -ne "ok") {
  exit 1
}
