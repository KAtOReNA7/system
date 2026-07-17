[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,

    [Parameter(Mandatory = $true)]
    [string]$TargetRepoRoot,

    [string]$Sha256Path,

    [string]$SevenZipPath = "C:\Program Files\7-Zip\7z.exe",

    [string]$ValidationPasswordEnvironmentVariable,

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$AllowedEnvNames = @(
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "M2_V2_EVIDENCE_API_BASE_URL",
    "M2_V2_EVIDENCE_PROVIDER",
    "M2_V2_PILOT_COST_MODE",
    "M2_V2_PILOT_MAX_REQUESTS",
    "M2_V2_PROVIDER_PROBE_MAX_REQUESTS"
)

function Quote-NativeArgument([string]$Value) {
    if ($Value.IndexOf('"') -ge 0) {
        throw "native_argument_contains_quote"
    }
    return '"' + $Value + '"'
}

function Invoke-SevenZipSecure {
    param(
        [string]$Executable,
        [string[]]$Arguments,
        [Security.SecureString]$Password,
        [string]$WorkingDirectory,
        [switch]$IncludePasswordSwitch
    )

    $bstr = [IntPtr]::Zero
    $plainText = $null
    try {
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
        $plainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $Executable
        $startInfo.WorkingDirectory = $WorkingDirectory
        $nativeArguments = if ($IncludePasswordSwitch) { $Arguments + @("-p") } else { $Arguments }
        $startInfo.Arguments = ($nativeArguments -join " ")
        $startInfo.UseShellExecute = $false
        $startInfo.RedirectStandardInput = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true
        $startInfo.CreateNoWindow = $true

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $startInfo
        [void]$process.Start()
        $process.StandardInput.WriteLine($plainText)
        $process.StandardInput.Close()
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw "seven_zip_failed_exit_$($process.ExitCode)"
        }
    }
    finally {
        $plainText = $null
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

function Assert-SafeRelativePath([string]$RelativePath) {
    $normalized = $RelativePath.Replace('\', '/')
    if (-not $normalized -or $normalized.StartsWith('/') -or $normalized.Contains(':')) {
        throw "migration_manifest_path_invalid"
    }
    if ($normalized.Split('/') -contains '..') {
        throw "migration_manifest_path_traversal"
    }
    if ($normalized -ne "payload/env/m2-v2-evidence.env.private" -and
        -not $normalized.StartsWith("payload/data/private-output/m2-v2-evidence-pilot/")) {
        throw "migration_manifest_path_out_of_scope"
    }
    return $normalized
}

function Read-EnvFragment([string]$Path) {
    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
            $name = $Matches[1]
            if ($AllowedEnvNames -notcontains $name) {
                throw "migration_env_name_out_of_scope"
            }
            if ($values.ContainsKey($name)) {
                throw "migration_env_name_duplicate"
            }
            $values[$name] = $Matches[2]
        }
    }
    foreach ($name in $AllowedEnvNames) {
        if (-not $values.ContainsKey($name) -or [string]::IsNullOrWhiteSpace([string]$values[$name])) {
            throw "migration_env_required_value_missing"
        }
    }
    return $values
}

function Write-MergedEnvLocal {
    param(
        [string]$Destination,
        [hashtable]$Values
    )

    $preserved = New-Object System.Collections.Generic.List[string]
    if (Test-Path -LiteralPath $Destination) {
        foreach ($line in Get-Content -LiteralPath $Destination -Encoding UTF8) {
            $managed = $false
            foreach ($name in $AllowedEnvNames) {
                if ($line -match ('^\s*' + [regex]::Escape($name) + '\s*=')) {
                    $managed = $true
                    break
                }
            }
            if (-not $managed) {
                $preserved.Add($line)
            }
        }
    }

    if ($preserved.Count -gt 0 -and $preserved[$preserved.Count - 1] -ne "") {
        $preserved.Add("")
    }
    $preserved.Add("# M2 v2 evidence provider state restored from encrypted migration package")
    foreach ($name in $AllowedEnvNames) {
        $preserved.Add($name + "=" + [string]$Values[$name])
    }

    $tempPath = "$Destination.restore-$([guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::WriteAllLines($tempPath, $preserved, (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $tempPath -Destination $Destination -Force
}

$resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
$resolvedRepo = (Resolve-Path -LiteralPath $TargetRepoRoot).Path
$resolvedSevenZip = (Resolve-Path -LiteralPath $SevenZipPath).Path

if (-not (Test-Path -LiteralPath (Join-Path $resolvedRepo ".git")) -or
    -not (Test-Path -LiteralPath (Join-Path $resolvedRepo "package.json"))) {
    throw "migration_target_is_not_project_repository"
}

if (-not $Sha256Path) {
    $Sha256Path = "$resolvedArchive.sha256"
}
& (Join-Path $PSScriptRoot "verify_m2_v2_private_state_migration.ps1") `
    -ArchivePath $resolvedArchive -Sha256Path $Sha256Path | Out-Null

& git -C $resolvedRepo check-ignore -q --no-index -- ".env.local"
if ($LASTEXITCODE -ne 0) {
    throw "migration_env_local_not_ignored"
}
& git -C $resolvedRepo check-ignore -q --no-index -- "data/private-output/m2-v2-evidence-pilot/probe.json"
if ($LASTEXITCODE -ne 0) {
    throw "migration_private_output_not_ignored"
}

$password = $null
if ($ValidationPasswordEnvironmentVariable) {
    if ($ValidationPasswordEnvironmentVariable -ne "M2_V2_MIGRATION_VALIDATION_PASSWORD") {
        throw "migration_validation_password_environment_name_invalid"
    }
    $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $repoFull = [IO.Path]::GetFullPath($resolvedRepo)
    if (-not $repoFull.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        -not (Split-Path -Leaf $repoFull).StartsWith("m2-v2-migration-restore-validation-")) {
        throw "migration_noninteractive_password_requires_temp_validation_target"
    }
    $validationPassword = [Environment]::GetEnvironmentVariable($ValidationPasswordEnvironmentVariable, "Process")
    if ([string]::IsNullOrWhiteSpace($validationPassword)) {
        throw "migration_validation_password_environment_missing"
    }
    $password = ConvertTo-SecureString -String $validationPassword -AsPlainText -Force
    [Environment]::SetEnvironmentVariable($ValidationPasswordEnvironmentVariable, $null, "Process")
    $validationPassword = $null
}
else {
    $password = Read-Host "请输入迁移包密码（输入不会回显）" -AsSecureString
}
$extractRoot = Join-Path ([IO.Path]::GetTempPath()) ("m2-v2-private-restore-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $extractRoot | Out-Null

try {
    Invoke-SevenZipSecure -Executable $resolvedSevenZip -WorkingDirectory $extractRoot -Password $password -Arguments @(
        "x",
        "-y",
        "-bb0",
        "-bd",
        ("-o" + (Quote-NativeArgument $extractRoot)),
        (Quote-NativeArgument $resolvedArchive)
    )

    $manifestPath = Join-Path $extractRoot "metadata/migration-manifest.private.json"
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "migration_manifest_missing"
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.schema -ne "m2.v2.private-state-migration-manifest.v0.1" -or $manifest.privateOnly -ne $true) {
        throw "migration_manifest_contract_invalid"
    }
    if ([string]$manifest.sourceGit.commit -notmatch '^[a-f0-9]{40}$' -or
        [string]::IsNullOrWhiteSpace([string]$manifest.sourceGit.branch) -or
        @($manifest.entries).Count -eq 0) {
        throw "migration_manifest_source_or_entries_invalid"
    }

    $entryPaths = New-Object System.Collections.Generic.List[string]
    foreach ($entry in $manifest.entries) {
        $relative = Assert-SafeRelativePath([string]$entry.relativePath)
        $entryPaths.Add($relative)
        $fullPath = [IO.Path]::GetFullPath((Join-Path $extractRoot ($relative.Replace('/', '\'))))
        $safePrefix = [IO.Path]::GetFullPath($extractRoot).TrimEnd('\') + '\'
        if (-not $fullPath.StartsWith($safePrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "migration_manifest_path_escape"
        }
        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
            throw "migration_payload_file_missing"
        }
        $item = Get-Item -LiteralPath $fullPath
        if ($item.Length -ne [int64]$entry.sizeBytes) {
            throw "migration_payload_size_mismatch"
        }
        $hash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($hash -ne ([string]$entry.sha256).ToLowerInvariant()) {
            throw "migration_payload_sha256_mismatch"
        }
    }

    $payloadRoot = Join-Path $extractRoot "payload"
    $actualPayloadFiles = @(Get-ChildItem -LiteralPath $payloadRoot -Recurse -File -Force)
    if ($actualPayloadFiles.Count -ne $entryPaths.Count) {
        throw "migration_payload_manifest_count_mismatch"
    }

    $envFragment = Join-Path $extractRoot "payload/env/m2-v2-evidence.env.private"
    $envValues = Read-EnvFragment $envFragment
    $sourcePrivate = Join-Path $extractRoot "payload/data/private-output/m2-v2-evidence-pilot"
    $destinationPrivate = Join-Path $resolvedRepo "data/private-output/m2-v2-evidence-pilot"

    if ((Test-Path -LiteralPath $destinationPrivate) -and -not $Force) {
        $existing = @(Get-ChildItem -LiteralPath $destinationPrivate -Recurse -File -Force)
        if ($existing.Count -gt 0) {
            throw "migration_private_destination_exists_use_force"
        }
    }

    $restoreStage = Join-Path $resolvedRepo ("data/private-output/.m2-v2-evidence-pilot-restore-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $restoreStage -Force | Out-Null
    Get-ChildItem -LiteralPath $sourcePrivate -Force | Copy-Item -Destination $restoreStage -Recurse -Force

    if (Test-Path -LiteralPath $destinationPrivate) {
        $backup = $destinationPrivate + ".backup-" + (Get-Date -Format "yyyyMMdd-HHmmss")
        Move-Item -LiteralPath $destinationPrivate -Destination $backup
    }
    Move-Item -LiteralPath $restoreStage -Destination $destinationPrivate

    Write-MergedEnvLocal -Destination (Join-Path $resolvedRepo ".env.local") -Values $envValues

    $tracked = @(& git -C $resolvedRepo ls-files -- ".env.local" "data/private-output/m2-v2-evidence-pilot")
    if ($tracked.Count -ne 0) {
        throw "migration_restored_private_state_is_tracked"
    }

    [ordered]@{
        status = "restored"
        sourceCommit = $manifest.sourceGit.commit
        apiKeyConfigured = $envValues.ContainsKey("OPENAI_API_KEY")
        restoredPrivateFileCount = @(Get-ChildItem -LiteralPath $destinationPrivate -Recurse -File -Force).Count
        gitTrackedPrivateCount = 0
        evidenceQueriesExecuted = 0
    } | ConvertTo-Json -Compress
}
finally {
    $password = $null
    $safeTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $resolvedExtract = [IO.Path]::GetFullPath($extractRoot)
    if ($resolvedExtract.StartsWith($safeTempRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedExtract).StartsWith("m2-v2-private-restore-")) {
        Remove-Item -LiteralPath $resolvedExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
}
