param(
  [string]$HostName = "127.0.0.1",
  [int]$Port = 5432,
  [string]$DatabaseName = "m1_dev",
  [string]$PgBin = $env:PG_BIN
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-LocalHost {
  param([string]$Value)
  $allowed = @("127.0.0.1", "localhost", "::1")
  if ($allowed -notcontains $Value) {
    throw "Refusing to check a non-local database host: $Value"
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

function Invoke-Psql {
  param([string]$Role, [string]$Sql)
  $args = @("-h", $HostName, "-p", [string]$Port, "-U", $Role, "-d", $DatabaseName, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", $Sql)
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $script:Psql @args 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  [pscustomobject]@{
    exit_code = $exitCode
    output = ($output -join "`n").Trim()
  }
}

function Add-Test {
  param([string]$Name, [bool]$Passed, [string]$Detail)
  $script:Results += [pscustomobject]@{
    name = $Name
    passed = $Passed
    detail = $Detail
  }
}

Assert-LocalHost $HostName
$script:Psql = Resolve-Tool "psql"
$script:Results = @()

$rw = Invoke-Psql "application_rw" "SELECT current_user;"
Add-Test "application_rw_can_connect" ($rw.exit_code -eq 0 -and $rw.output -eq "application_rw") $rw.output

$ro = Invoke-Psql "application_ro" "SELECT current_user;"
Add-Test "application_ro_can_connect" ($ro.exit_code -eq 0 -and $ro.output -eq "application_ro") $ro.output

$worker = Invoke-Psql "background_worker" "SELECT current_user;"
Add-Test "background_worker_can_connect" ($worker.exit_code -eq 0 -and $worker.output -eq "background_worker") $worker.output

$tz = Invoke-Psql "application_ro" "SHOW TimeZone;"
Add-Test "database_timezone_is_utc" ($tz.exit_code -eq 0 -and $tz.output -eq "UTC") $tz.output

$view = Invoke-Psql "application_ro" "SELECT count(*) FROM m1.v_current_income;"
Add-Test "formal_view_query_available" ($view.exit_code -eq 0) $view.output

$flyway = Invoke-Psql "application_ro" "SELECT version FROM flyway_history.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1;"
Add-Test "application_ro_can_read_flyway_schema_version" ($flyway.exit_code -eq 0 -and $flyway.output -eq "0060.290") $flyway.output

$state = Invoke-Psql "background_worker" "SELECT lifecycle_status FROM m1.system_state WHERE id = 1;"
Add-Test "system_state_initial_status_readable" ($state.exit_code -eq 0 -and $state.output -eq "schema_initialized") $state.output

$roWrite = Invoke-Psql "application_ro" "INSERT INTO m1.channel(channel_code, display_name) VALUES ('synthetic_ro_write_probe', 'synthetic');"
Add-Test "application_ro_cannot_write" ($roWrite.exit_code -ne 0) $roWrite.output

$rwFact = Invoke-Psql "application_rw" "DELETE FROM m1.income_fact WHERE false;"
Add-Test "application_rw_cannot_direct_modify_income_fact" ($rwFact.exit_code -ne 0) $rwFact.output

$workerActivate = Invoke-Psql "background_worker" "SELECT has_function_privilege(current_user, 'm1.activate_bill_batch(bigint,bigint,text)', 'EXECUTE');"
Add-Test "background_worker_cannot_activate_versions" ($workerActivate.exit_code -eq 0 -and $workerActivate.output -eq "f") $workerActivate.output

$secDef = Invoke-Psql "migration_owner" "SELECT bool_and(EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg WHERE cfg = 'search_path=pg_catalog, m1')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='m1' AND p.prosecdef;"
Add-Test "security_definer_functions_fix_search_path" ($secDef.exit_code -eq 0 -and $secDef.output -eq "t") $secDef.output

$passed = -not ($script:Results | Where-Object { -not $_.passed })
$summary = [pscustomobject]@{
  status = $(if ($passed) { "ok" } else { "failed" })
  database = $DatabaseName
  host = $HostName
  port = $Port
  tests = $script:Results
  real_data_imported = $false
}

$summary | ConvertTo-Json -Depth 6
if (-not $passed) {
  exit 1
}
