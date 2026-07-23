[CmdletBinding()]
param(
    [string]$RepoRoot,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^B[0-7]$')]
    [string]$BatchId,

    [string]$CapabilityId = "m2-pr7-s1",

    [string]$OutputDirectory,

    [string]$RecoveryKeyDirectory = [Environment]::GetFolderPath("MyDocuments"),

    [string]$SevenZipPath = "C:\Program Files\7-Zip\7z.exe"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
}

function Quote-NativeArgument([string]$Value) {
    if ($Value.IndexOf('"') -ge 0) {
        throw "private_capability_native_argument_contains_quote"
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
        $startInfo.Arguments = ((if ($IncludePasswordSwitch) { $Arguments + @("-p") } else { $Arguments }) -join " ")
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
        [void]$process.StandardOutput.ReadToEnd()
        [void]$process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw "private_capability_seven_zip_failed_exit_$($process.ExitCode)"
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
        throw "private_capability_output_must_be_outside_repository"
    }
}

function Assert-SeparateDirectories([string]$First, [string]$Second) {
    $firstFull = [IO.Path]::GetFullPath($First).TrimEnd('\')
    $secondFull = [IO.Path]::GetFullPath($Second).TrimEnd('\')
    if ($firstFull.Equals($secondFull, [StringComparison]::OrdinalIgnoreCase) -or
        ($firstFull + '\').StartsWith($secondFull + '\', [StringComparison]::OrdinalIgnoreCase) -or
        ($secondFull + '\').StartsWith($firstFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "private_capability_recovery_key_directory_not_separate"
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
if ($CapabilityId -ne "m2-pr7-s1") {
    throw "private_capability_id_not_supported"
}
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRepo ".git")) -or
    -not (Test-Path -LiteralPath (Join-Path $resolvedRepo "package.json"))) {
    throw "private_capability_source_is_not_project_repository"
}

if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path (Split-Path $resolvedRepo -Parent) "development-private-capability-bundles"
}
$outputFull = [IO.Path]::GetFullPath($OutputDirectory)
$keyDirectoryFull = [IO.Path]::GetFullPath($RecoveryKeyDirectory)
Assert-OutsideRepository $outputFull $resolvedRepo
Assert-OutsideRepository $keyDirectoryFull $resolvedRepo
Assert-SeparateDirectories $outputFull $keyDirectoryFull
New-Item -ItemType Directory -Path $outputFull -Force | Out-Null
New-Item -ItemType Directory -Path $keyDirectoryFull -Force | Out-Null

$status = @(& git -C $resolvedRepo status --short --untracked-files=all)
if ($status.Count -ne 0) {
    throw "private_capability_requires_clean_worktree"
}
$commit = (& git -C $resolvedRepo rev-parse HEAD).Trim()
$upstream = (& git -C $resolvedRepo rev-parse '@{u}').Trim()
if ($commit -ne $upstream) {
    throw "private_capability_requires_head_equal_upstream"
}

& npm --prefix $resolvedRepo run m2:v2:pr7:s1:doctor -- "--expected-head=$commit" "--batch-id=$BatchId"
if ($LASTEXITCODE -ne 0) {
    throw "private_capability_s1_doctor_failed"
}

$stagingRoot = Join-Path ([IO.Path]::GetTempPath()) ("development-private-capability-build-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stagingRoot | Out-Null
$passwordPlain = $null
$passwordSecure = $null
try {
    $prepareCli = Join-Path $resolvedRepo "scripts/m2-v2-evidence-pilot/prepare_development_private_capability_bundle.mjs"
    $prepareOutput = @(& node $prepareCli `
        --capability-id $CapabilityId `
        --repo-root $resolvedRepo `
        --staging-root $stagingRoot `
        --source-commit $commit)
    if ($LASTEXITCODE -ne 0) {
        throw "private_capability_prepare_cli_failed"
    }
    $prepareReceipt = ($prepareOutput -join [Environment]::NewLine) | ConvertFrom-Json
    if ($prepareReceipt.status -ne "staged" -or
        $prepareReceipt.payloadFileCount -ne 9 -or
        $prepareReceipt.environmentIncluded -ne $false) {
        throw "private_capability_prepare_receipt_invalid"
    }

    $dateStamp = Get-Date -Format "yyyyMMdd"
    $shortCommit = $commit.Substring(0, 12)
    $archiveName = "$CapabilityId-private-$dateStamp-$shortCommit.7z"
    $archivePath = Join-Path $outputFull $archiveName
    if (Test-Path -LiteralPath $archivePath) {
        throw "private_capability_archive_already_exists"
    }

    $passwordPlain = New-RandomPassword
    $passwordSecure = ConvertTo-Secure $passwordPlain
    Invoke-SevenZipSecure -Executable $resolvedSevenZip -WorkingDirectory $stagingRoot -Password $passwordSecure -IncludePasswordSwitch -Arguments @(
        "a", "-t7z", "-mhe=on", "-mx=9", "-bb0", "-bd",
        (Quote-NativeArgument $archivePath), ".\*"
    )
    Invoke-SevenZipSecure -Executable $resolvedSevenZip -WorkingDirectory $stagingRoot -Password $passwordSecure -Arguments @(
        "t", "-bb0", "-bd", (Quote-NativeArgument $archivePath)
    )

    $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $shaPath = "$archivePath.sha256"
    Write-Utf8NoBom $shaPath ($archiveHash + " *" + $archiveName + [Environment]::NewLine)

    $keyPath = Join-Path $keyDirectoryFull "$CapabilityId-recovery-key-$dateStamp-$shortCommit.txt"
    if (Test-Path -LiteralPath $keyPath) {
        throw "private_capability_recovery_key_file_already_exists"
    }
    Write-Utf8NoBom $keyPath ((@(
        "Development private capability recovery key",
        "Capability: $CapabilityId",
        "Archive: $archiveName",
        "SHA-256: $archiveHash",
        "Password: $passwordPlain",
        "Store and transfer this file separately from the encrypted archive."
    ) -join [Environment]::NewLine) + [Environment]::NewLine)
    Set-KeyFileAcl $keyPath

    $receipt = [ordered]@{
        schema = "development.private-capability-bundle-transport-receipt.v0.1"
        status = "ready_for_manual_transfer"
        capabilityId = $CapabilityId
        archiveFileName = $archiveName
        archiveSha256 = $archiveHash
        archiveSizeBytes = (Get-Item -LiteralPath $archivePath).Length
        encryption = "7z_aes256_header_encrypted"
        passwordTransport = "secure_stdin_not_process_arguments"
        sourceCommit = $commit
        payloadFileCount = $prepareReceipt.payloadFileCount
        environmentIncluded = $false
        providerCredentialsIncluded = $false
        databaseCredentialsIncluded = $false
        providerRequestDelta = 0
        databaseConnections = 0
        recoveryKeyDirectorySeparationVerified = $true
        separateTransferVerified = $false
        operatorSeparateTransferRequired = $true
    }
    $receiptPath = "$archivePath.receipt.json"
    Write-Utf8NoBom $receiptPath (($receipt | ConvertTo-Json -Depth 5) + [Environment]::NewLine)

    Copy-Item -LiteralPath (Join-Path $resolvedRepo "scripts/m2-v2-evidence-pilot/verify_development_private_capability_bundle.ps1") -Destination $outputFull -Force
    Copy-Item -LiteralPath (Join-Path $resolvedRepo "scripts/m2-v2-evidence-pilot/restore_development_private_capability_bundle.ps1") -Destination $outputFull -Force

    [ordered]@{
        status = "created_and_tested"
        capabilityId = $CapabilityId
        archivePath = $archivePath
        sha256Path = $shaPath
        receiptPath = $receiptPath
        recoveryKeyPath = $keyPath
        archiveSha256 = $archiveHash
        payloadFileCount = $prepareReceipt.payloadFileCount
        encryption = "7z_aes256_header_encrypted"
        passwordPrinted = $false
        passwordInProcessArguments = $false
        environmentIncluded = $false
        providerCredentialsIncluded = $false
        databaseCredentialsIncluded = $false
        providerRequestDelta = 0
        databaseConnections = 0
    } | ConvertTo-Json -Compress
}
finally {
    $passwordPlain = $null
    $passwordSecure = $null
    $safeTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $resolvedStaging = [IO.Path]::GetFullPath($stagingRoot)
    if ($resolvedStaging.StartsWith($safeTempRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedStaging).StartsWith("development-private-capability-build-")) {
        Remove-Item -LiteralPath $resolvedStaging -Recurse -Force -ErrorAction SilentlyContinue
    }
}
