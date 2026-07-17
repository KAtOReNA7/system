[CmdletBinding()]
param(
    [string]$RepoRoot,

    [string]$OutputDirectory,

    [string]$RecoveryKeyDirectory = [Environment]::GetFolderPath("MyDocuments"),

    [string]$SevenZipPath = "C:\Program Files\7-Zip\7z.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
}

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

function New-RandomPassword {
    $bytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function ConvertTo-Secure([string]$PlainText) {
    return ConvertTo-SecureString -String $PlainText -AsPlainText -Force
}

function Invoke-SevenZipSecure {
    param(
        [string]$Executable,
        [string[]]$Arguments,
        [Security.SecureString]$Password,
        [string]$WorkingDirectory
    )

    $bstr = [IntPtr]::Zero
    $plainText = $null
    try {
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
        $plainText = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $Executable
        $startInfo.WorkingDirectory = $WorkingDirectory
        $startInfo.Arguments = (($Arguments + @("-p")) -join " ")
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

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Assert-OutsideRepository([string]$Candidate, [string]$Repository) {
    $candidateFull = [IO.Path]::GetFullPath($Candidate).TrimEnd('\') + '\'
    $repoFull = [IO.Path]::GetFullPath($Repository).TrimEnd('\') + '\'
    if ($candidateFull.StartsWith($repoFull, [StringComparison]::OrdinalIgnoreCase)) {
        throw "migration_output_must_be_outside_repository"
    }
}

function Set-KeyFileAcl([string]$Path) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $security = New-Object Security.AccessControl.FileSecurity
    $security.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule(
        $identity,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
    )
    $security.AddAccessRule($rule)
    Set-Acl -LiteralPath $Path -AclObject $security
}

$resolvedRepo = (Resolve-Path -LiteralPath $RepoRoot).Path
$resolvedSevenZip = (Resolve-Path -LiteralPath $SevenZipPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRepo ".git")) -or
    -not (Test-Path -LiteralPath (Join-Path $resolvedRepo "package.json"))) {
    throw "migration_source_is_not_project_repository"
}

if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path (Split-Path $resolvedRepo -Parent) "m2-v2-private-migration"
}
$outputFull = [IO.Path]::GetFullPath($OutputDirectory)
$keyDirectoryFull = [IO.Path]::GetFullPath($RecoveryKeyDirectory)
Assert-OutsideRepository $outputFull $resolvedRepo
Assert-OutsideRepository $keyDirectoryFull $resolvedRepo
New-Item -ItemType Directory -Path $outputFull -Force | Out-Null
New-Item -ItemType Directory -Path $keyDirectoryFull -Force | Out-Null

$status = @(& git -C $resolvedRepo status --short --untracked-files=all)
if ($status.Count -ne 0) {
    throw "migration_requires_clean_worktree"
}
$branch = (& git -C $resolvedRepo branch --show-current).Trim()
$commit = (& git -C $resolvedRepo rev-parse HEAD).Trim()
$upstream = (& git -C $resolvedRepo rev-parse '@{u}').Trim()
if ($commit -ne $upstream) {
    throw "migration_requires_head_equal_upstream"
}

$envLocal = Join-Path $resolvedRepo ".env.local"
$privateRoot = Join-Path $resolvedRepo "data/private-output/m2-v2-evidence-pilot"
if (-not (Test-Path -LiteralPath $envLocal -PathType Leaf)) {
    throw "migration_env_local_missing"
}
if (-not (Test-Path -LiteralPath $privateRoot -PathType Container)) {
    throw "migration_evidence_private_state_missing"
}
$sourcePrivateFiles = @(Get-ChildItem -LiteralPath $privateRoot -Recurse -File -Force)
if ($sourcePrivateFiles.Count -eq 0) {
    throw "migration_evidence_private_state_empty"
}

& git -C $resolvedRepo check-ignore -q --no-index -- ".env.local"
if ($LASTEXITCODE -ne 0) {
    throw "migration_env_local_not_ignored"
}
& git -C $resolvedRepo check-ignore -q --no-index -- "data/private-output/m2-v2-evidence-pilot/probe.json"
if ($LASTEXITCODE -ne 0) {
    throw "migration_private_output_not_ignored"
}
$trackedPrivate = @(& git -C $resolvedRepo ls-files -- ".env.local" "data/private-output/m2-v2-evidence-pilot")
if ($trackedPrivate.Count -ne 0) {
    throw "migration_private_state_is_tracked"
}

$envLines = Get-Content -LiteralPath $envLocal -Encoding UTF8
$managedLines = New-Object System.Collections.Generic.List[string]
foreach ($name in $AllowedEnvNames) {
    $matches = @($envLines | Where-Object { $_ -match ('^\s*' + [regex]::Escape($name) + '\s*=') })
    if ($matches.Count -ne 1) {
        throw "migration_required_env_value_missing_or_duplicate"
    }
    if ($matches[0] -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*$') {
        throw "migration_required_env_value_empty"
    }
    $managedLines.Add($matches[0])
}

$stagingRoot = Join-Path ([IO.Path]::GetTempPath()) ("m2-v2-private-migration-build-" + [guid]::NewGuid().ToString("N"))
$payloadRoot = Join-Path $stagingRoot "payload"
$payloadPrivate = Join-Path $payloadRoot "data/private-output/m2-v2-evidence-pilot"
$payloadEnvDir = Join-Path $payloadRoot "env"
$metadataDir = Join-Path $stagingRoot "metadata"
$toolsDir = Join-Path $stagingRoot "tools"
New-Item -ItemType Directory -Path $payloadPrivate -Force | Out-Null
New-Item -ItemType Directory -Path $payloadEnvDir -Force | Out-Null
New-Item -ItemType Directory -Path $metadataDir -Force | Out-Null
New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null

$passwordPlain = $null
$passwordSecure = $null
try {
    Get-ChildItem -LiteralPath $privateRoot -Force | Copy-Item -Destination $payloadPrivate -Recurse -Force
    $envFragment = Join-Path $payloadEnvDir "m2-v2-evidence.env.private"
    Write-Utf8NoBom $envFragment (($managedLines -join [Environment]::NewLine) + [Environment]::NewLine)

    Copy-Item -LiteralPath (Join-Path $resolvedRepo "scripts/m2-v2-evidence-pilot/verify_m2_v2_private_state_migration.ps1") -Destination $toolsDir
    Copy-Item -LiteralPath (Join-Path $resolvedRepo "scripts/m2-v2-evidence-pilot/restore_m2_v2_private_state_migration.ps1") -Destination $toolsDir
    Copy-Item -LiteralPath (Join-Path $resolvedRepo "docs/analysis/m2-v2/M2-v2-cross-device-private-state-migration-v0.1.md") -Destination (Join-Path $stagingRoot "README-new-computer.md")

    $entries = New-Object System.Collections.Generic.List[object]
    $payloadFiles = @(Get-ChildItem -LiteralPath $payloadRoot -Recurse -File -Force | Sort-Object FullName)
    foreach ($file in $payloadFiles) {
        $relative = $file.FullName.Substring($stagingRoot.Length).TrimStart('\').Replace('\', '/')
        $role = if ($relative -eq "payload/env/m2-v2-evidence.env.private") { "filtered_m2_v2_environment" } else { "m2_v2_evidence_pilot_private_state" }
        $entries.Add([ordered]@{
            relativePath = $relative
            role = $role
            sensitive = $true
            sizeBytes = $file.Length
            sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        })
    }

    $manifest = [ordered]@{
        schema = "m2.v2.private-state-migration-manifest.v0.1"
        privateOnly = $true
        createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        sourceGit = [ordered]@{
            branch = $branch
            commit = $commit
        }
        scope = [ordered]@{
            environmentVariableNames = $AllowedEnvNames
            privateStateRole = "data/private-output/m2-v2-evidence-pilot"
            unrelatedPrivateOutputIncluded = $false
            privateInputIncluded = $false
            databaseBackupIncluded = $false
        }
        entries = $entries
        payloadFileCount = $entries.Count
        payloadBytes = ($payloadFiles | Measure-Object Length -Sum).Sum
    }
    $manifestPath = Join-Path $metadataDir "migration-manifest.private.json"
    Write-Utf8NoBom $manifestPath (($manifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine)

    $shortCommit = $commit.Substring(0, 12)
    $dateStamp = Get-Date -Format "yyyyMMdd"
    $archiveName = "m2-v2-private-state-$dateStamp-$shortCommit.7z"
    $archivePath = Join-Path $outputFull $archiveName
    if (Test-Path -LiteralPath $archivePath) {
        throw "migration_archive_already_exists"
    }

    $passwordPlain = New-RandomPassword
    $passwordSecure = ConvertTo-Secure $passwordPlain
    Invoke-SevenZipSecure -Executable $resolvedSevenZip -WorkingDirectory $stagingRoot -Password $passwordSecure -Arguments @(
        "a",
        "-t7z",
        "-mhe=on",
        "-mx=9",
        "-bb0",
        "-bd",
        (Quote-NativeArgument $archivePath),
        ".\*"
    )
    Invoke-SevenZipSecure -Executable $resolvedSevenZip -WorkingDirectory $stagingRoot -Password $passwordSecure -Arguments @(
        "t",
        "-bb0",
        "-bd",
        (Quote-NativeArgument $archivePath)
    )

    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $shaPath = "$archivePath.sha256"
    Write-Utf8NoBom $shaPath ($archiveHash + " *" + $archiveName + [Environment]::NewLine)

    $keyFileName = "M2-v2-private-state-recovery-key-$dateStamp-$shortCommit.txt"
    $keyPath = Join-Path $keyDirectoryFull $keyFileName
    if (Test-Path -LiteralPath $keyPath) {
        throw "migration_recovery_key_file_already_exists"
    }
    $keyContent = @(
        "M2 v2 private state migration recovery key",
        "Archive: $archiveName",
        "SHA-256: $archiveHash",
        "Password: $passwordPlain",
        "Store and transfer this file separately from the encrypted archive."
    ) -join [Environment]::NewLine
    Write-Utf8NoBom $keyPath ($keyContent + [Environment]::NewLine)
    Set-KeyFileAcl $keyPath

    $receipt = [ordered]@{
        schema = "m2.v2.private-state-migration-receipt.v0.1"
        status = "ready_for_manual_transfer"
        createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        archiveFileName = $archiveName
        archiveSha256 = $archiveHash
        archiveSizeBytes = (Get-Item -LiteralPath $archivePath).Length
        encryption = "7z_aes256_header_encrypted"
        passwordTransport = "secure_stdin_not_process_arguments"
        payloadFileCount = $entries.Count
        payloadBytes = $manifest.payloadBytes
        sourceBranch = $branch
        sourceCommit = $commit
        recoveryKeyStoredSeparately = $true
        gitTracked = $false
        evidenceQueriesExecuted = 0
    }
    $receiptPath = "$archivePath.receipt.json"
    Write-Utf8NoBom $receiptPath (($receipt | ConvertTo-Json -Depth 5) + [Environment]::NewLine)

    Copy-Item -LiteralPath (Join-Path $resolvedRepo "scripts/m2-v2-evidence-pilot/verify_m2_v2_private_state_migration.ps1") -Destination $outputFull -Force
    Copy-Item -LiteralPath (Join-Path $resolvedRepo "scripts/m2-v2-evidence-pilot/restore_m2_v2_private_state_migration.ps1") -Destination $outputFull -Force
    Copy-Item -LiteralPath (Join-Path $resolvedRepo "docs/analysis/m2-v2/M2-v2-cross-device-private-state-migration-v0.1.md") -Destination (Join-Path $outputFull "README-new-computer.md") -Force

    [ordered]@{
        status = "created_and_tested"
        archivePath = $archivePath
        sha256Path = $shaPath
        receiptPath = $receiptPath
        recoveryKeyPath = $keyPath
        archiveSha256 = $archiveHash
        payloadFileCount = $entries.Count
        encryption = "7z_aes256_header_encrypted"
        passwordPrinted = $false
        passwordInProcessArguments = $false
        gitTrackedPrivateCount = 0
        evidenceQueriesExecuted = 0
    } | ConvertTo-Json -Compress
}
finally {
    $passwordPlain = $null
    $passwordSecure = $null
    $safeTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $resolvedStaging = [IO.Path]::GetFullPath($stagingRoot)
    if ($resolvedStaging.StartsWith($safeTempRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedStaging).StartsWith("m2-v2-private-migration-build-")) {
        Remove-Item -LiteralPath $resolvedStaging -Recurse -Force -ErrorAction SilentlyContinue
    }
}
