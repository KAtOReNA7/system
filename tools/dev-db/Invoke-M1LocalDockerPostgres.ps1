param(
  [ValidateSet("m1-local-dev", "m1-local-dry-run")]
  [string]$EnvironmentName = "m1-local-dev",
  [string]$EnvFile = ".env.local",
  [switch]$Reset,
  [string]$DockerExecutable,
  [string]$PgBin = $env:PG_BIN,
  [string]$FlywayExecutable = "flyway"
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

function Resolve-Executable {
  param([string]$Name, [string[]]$Fallbacks)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  foreach ($candidate in $Fallbacks) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }
  throw "Required executable not found: $Name"
}

function Resolve-PgTool {
  param([string]$Name)
  if ($PgBin -and $PgBin.Trim().Length -gt 0) {
    $candidate = Join-Path $PgBin "$Name.exe"
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }
  return Resolve-Executable -Name $Name -Fallbacks @("C:\Program Files\PostgreSQL\16\bin\$Name.exe")
}

function Assert-LocalEnvironment {
  param([string]$Name, [string]$HostName, [string]$DatabaseName)
  if ($Name -notin @("m1-local-dev", "m1-local-dry-run")) {
    throw "Unexpected local environment name: $Name"
  }
  if ($HostName -notin @("127.0.0.1", "localhost", "::1")) {
    throw "Refusing non-local host: $HostName"
  }
  $joined = "$Name $DatabaseName".ToLowerInvariant()
  if ($joined -match "prod|production|staging|shared|formal") {
    throw "Refusing formal/staging/production/shared target: $Name / $DatabaseName"
  }
}

function ConvertTo-SqlLiteral {
  param([string]$Value)
  return "'" + $Value.Replace("'", "''") + "'"
}

function ConvertTo-SqlIdentifier {
  param([string]$Value)
  return '"' + $Value.Replace('"', '""') + '"'
}

function Invoke-Checked {
  param([string]$File, [string[]]$Arguments, [string]$FailureMessage)
  $output = & $File @Arguments 2>&1
  $exit = $LASTEXITCODE
  if ($output) {
    $output | Write-Output
  }
  if ($exit -ne 0) {
    throw "$FailureMessage (exit $exit)"
  }
}

function Invoke-PsqlAdmin {
  param([string]$Sql)
  $env:PGPASSWORD = $script:AdminPassword
  try {
    $Sql | & $script:Psql -h $script:HostName -p ([string]$script:Port) -U $script:AdminUser -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
      throw "psql admin command failed"
    }
  }
  finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
}

$envValues = Read-DotEnv -Path $EnvFile
$script:HostName = Require-Value $envValues "M1_LOCAL_DB_HOST"
$script:AdminUser = Require-Value $envValues "M1_POSTGRES_ADMIN_USER"
$script:AdminPassword = Require-Value $envValues "M1_POSTGRES_ADMIN_PASSWORD"
$migrationPassword = Require-Value $envValues "M1_MIGRATION_OWNER_PASSWORD"
$rwPassword = Require-Value $envValues "M1_APPLICATION_RW_PASSWORD"
$roPassword = Require-Value $envValues "M1_APPLICATION_RO_PASSWORD"
$workerPassword = Require-Value $envValues "M1_BACKGROUND_WORKER_PASSWORD"
$backupPassword = Require-Value $envValues "M1_BACKUP_OPERATOR_PASSWORD"

if ($EnvironmentName -eq "m1-local-dev") {
  $script:Port = [int](Require-Value $envValues "M1_LOCAL_DEV_DB_PORT")
  $databaseName = Require-Value $envValues "M1_LOCAL_DEV_DB_NAME"
} else {
  $script:Port = [int](Require-Value $envValues "M1_LOCAL_DRY_RUN_DB_PORT")
  $databaseName = Require-Value $envValues "M1_LOCAL_DRY_RUN_DB_NAME"
}

Assert-LocalEnvironment -Name $EnvironmentName -HostName $script:HostName -DatabaseName $databaseName

if (-not $DockerExecutable) {
  $DockerExecutable = Resolve-Executable -Name "docker" -Fallbacks @("C:\Program Files\Docker\Docker\resources\bin\docker.exe")
}
$dockerDir = Split-Path -Parent $DockerExecutable
if ($env:PATH -notlike "*$dockerDir*") {
  $env:PATH = "$dockerDir;$env:PATH"
}

$script:Psql = Resolve-PgTool "psql"
$createdb = Resolve-PgTool "createdb"
$migrationDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..\db\migrations")).Path
if ($migrationDir -match [regex]::Escape("experiments")) {
  throw "Refusing to use experiments migration directory: $migrationDir"
}
$sqlCount = (Get-ChildItem -LiteralPath $migrationDir -Filter "*.sql" | Measure-Object).Count

$volumeName = "$EnvironmentName-pgdata"
if ($Reset) {
  $existingResetContainer = & $DockerExecutable ps -a --filter "name=^/$EnvironmentName$" --format "{{.ID}}"
  if ($existingResetContainer) {
    & $DockerExecutable rm -f $EnvironmentName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to remove existing local container: $EnvironmentName"
    }
  }
  $existingResetVolume = & $DockerExecutable volume ls --filter "name=^$volumeName$" --format "{{.Name}}"
  if ($existingResetVolume) {
    & $DockerExecutable volume rm $volumeName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to remove existing local volume: $volumeName"
    }
  }
}

$containerId = & $DockerExecutable ps -a --filter "name=^/$EnvironmentName$" --format "{{.ID}}"
if (-not $containerId) {
  Invoke-Checked -File $DockerExecutable -Arguments @(
    "run", "-d",
    "--name", $EnvironmentName,
    "-e", "POSTGRES_PASSWORD=$script:AdminPassword",
    "-e", "POSTGRES_USER=$script:AdminUser",
    "-p", "$script:HostName`:$script:Port`:5432",
    "-v", "$volumeName`:/var/lib/postgresql/data",
    "postgres:16"
  ) -FailureMessage "Docker PostgreSQL container start failed"
} else {
  $running = & $DockerExecutable inspect -f "{{.State.Running}}" $EnvironmentName
  if ($running -ne "true") {
    Invoke-Checked -File $DockerExecutable -Arguments @("start", $EnvironmentName) -FailureMessage "Docker PostgreSQL container start failed"
  }
}

$ready = $false
for ($i = 1; $i -le 90; $i++) {
  & $DockerExecutable exec $EnvironmentName pg_isready -U $script:AdminUser -d postgres | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $ready = $true
    break
  }
  Start-Sleep -Seconds 1
}
if (-not $ready) {
  throw "PostgreSQL container did not become ready: $EnvironmentName"
}

$roleSql = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_owner') THEN
    CREATE ROLE migration_owner LOGIN PASSWORD $(ConvertTo-SqlLiteral $migrationPassword);
  ELSE
    ALTER ROLE migration_owner WITH LOGIN PASSWORD $(ConvertTo-SqlLiteral $migrationPassword);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'application_rw') THEN
    CREATE ROLE application_rw LOGIN PASSWORD $(ConvertTo-SqlLiteral $rwPassword);
  ELSE
    ALTER ROLE application_rw WITH LOGIN PASSWORD $(ConvertTo-SqlLiteral $rwPassword);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'application_ro') THEN
    CREATE ROLE application_ro LOGIN PASSWORD $(ConvertTo-SqlLiteral $roPassword);
  ELSE
    ALTER ROLE application_ro WITH LOGIN PASSWORD $(ConvertTo-SqlLiteral $roPassword);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'background_worker') THEN
    CREATE ROLE background_worker LOGIN PASSWORD $(ConvertTo-SqlLiteral $workerPassword);
  ELSE
    ALTER ROLE background_worker WITH LOGIN PASSWORD $(ConvertTo-SqlLiteral $workerPassword);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_operator') THEN
    CREATE ROLE backup_operator LOGIN PASSWORD $(ConvertTo-SqlLiteral $backupPassword);
  ELSE
    ALTER ROLE backup_operator WITH LOGIN PASSWORD $(ConvertTo-SqlLiteral $backupPassword);
  END IF;
END
`$`$;
"@
Invoke-PsqlAdmin -Sql $roleSql

$dbExistsSql = "SELECT 1 FROM pg_database WHERE datname = $(ConvertTo-SqlLiteral $databaseName);"
$env:PGPASSWORD = $script:AdminPassword
try {
  $dbExists = & $script:Psql -h $script:HostName -p ([string]$script:Port) -U $script:AdminUser -d postgres -t -A -v ON_ERROR_STOP=1 -c $dbExistsSql
  if ($LASTEXITCODE -ne 0) {
    throw "Database existence check failed."
  }
  if (($dbExists -join "").Trim() -ne "1") {
    Invoke-Checked -File $createdb -Arguments @(
      "-h", $script:HostName,
      "-p", ([string]$script:Port),
      "-U", $script:AdminUser,
      "-O", "migration_owner",
      $databaseName
    ) -FailureMessage "Database creation failed"
  }
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

$targetDbSql = "ALTER DATABASE $(ConvertTo-SqlIdentifier $databaseName) SET TimeZone TO 'UTC';"
$env:PGPASSWORD = $script:AdminPassword
try {
  $targetDbSql | & $script:Psql -h $script:HostName -p ([string]$script:Port) -U $script:AdminUser -d postgres -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) {
    throw "Database UTC configuration failed."
  }
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

$flywayLocation = "filesystem:$($migrationDir.Replace('\', '/'))"
$flywayUrl = "jdbc:postgresql://$script:HostName`:$script:Port/$databaseName"
$flywayArgs = @(
  "-url=$flywayUrl",
  "-user=migration_owner",
  "-password=$migrationPassword",
  "-locations=$flywayLocation",
  "-schemas=flyway_history,m1",
  "-defaultSchema=flyway_history",
  "-table=flyway_schema_history",
  "-createSchemas=true",
  "-cleanDisabled=true",
  "-placeholderReplacement=false",
  "-connectRetries=3"
)

Invoke-Checked -File $FlywayExecutable -Arguments ($flywayArgs + @("migrate")) -FailureMessage "Flyway migrate failed"
Invoke-Checked -File $FlywayExecutable -Arguments ($flywayArgs + @("info")) -FailureMessage "Flyway info failed"
Invoke-Checked -File $FlywayExecutable -Arguments ($flywayArgs + @("validate")) -FailureMessage "Flyway validate failed"
Invoke-Checked -File $FlywayExecutable -Arguments ($flywayArgs + @("migrate")) -FailureMessage "Flyway second migrate failed"

$grantSql = @"
GRANT USAGE ON SCHEMA flyway_history TO application_ro, background_worker;
GRANT SELECT ON flyway_history.flyway_schema_history TO application_ro, background_worker;
"@
$env:PGPASSWORD = $script:AdminPassword
try {
  $grantSql | & $script:Psql -h $script:HostName -p ([string]$script:Port) -U $script:AdminUser -d $databaseName -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) {
    throw "Flyway metadata grant failed."
  }
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

[pscustomobject]@{
  status = "ok"
  environmentName = $EnvironmentName
  database = $databaseName
  host = $script:HostName
  port = $script:Port
  container = $EnvironmentName
  dockerImage = "postgres:16"
  migrations = $sqlCount
  migrationSource = "db/migrations"
  formalDatabaseConnected = $false
  realDataImported = $false
  mappingVersionActivated = $false
} | ConvertTo-Json -Depth 4
