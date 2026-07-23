[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,

    [Parameter(Mandatory = $true)]
    [string]$TargetRepoRoot,

    [string]$Sha256Path,

    [string]$SevenZipPath = "C:\Program Files\7-Zip\7z.exe",

    [string]$ValidationPasswordEnvironmentVariable,

    [switch]$Force,

    [string]$FaultInjectionPoint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
        return $stdout
    }
    finally {
        $plainText = $null
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

function Assert-ArchiveListingSafe([string]$Listing) {
    foreach ($line in ($Listing -split "`r?`n")) {
        if ($line -notmatch '^Path = (.+)$') {
            continue
        }
        $path = $Matches[1].Replace('\', '/')
        if ([string]::IsNullOrWhiteSpace($path) -or $path.StartsWith('/') -or
            $path.StartsWith('//') -or $path.Contains(':') -or
            ($path.Split('/') -contains '..') -or ($path.Split('/') -contains '.')) {
            throw "migration_archive_member_path_invalid"
        }
    }
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
    $password = Read-Host "Enter the encrypted migration package password" -AsSecureString
}

if ($FaultInjectionPoint) {
    $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $repoFull = [IO.Path]::GetFullPath($resolvedRepo)
    if (-not $repoFull.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        -not (Split-Path -Leaf $repoFull).StartsWith("m2-v2-migration-restore-validation-")) {
        throw "migration_fault_injection_requires_temp_validation_target"
    }
}

$extractRoot = Join-Path ([IO.Path]::GetTempPath()) ("m2-v2-private-restore-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $extractRoot | Out-Null

try {
    $listing = Invoke-SevenZipSecure -Executable $resolvedSevenZip -WorkingDirectory $extractRoot -Password $password -Arguments @(
        "l", "-slt", "-ba", "-bb0", "-bd", (Quote-NativeArgument $resolvedArchive)
    )
    Assert-ArchiveListingSafe $listing
    Invoke-SevenZipSecure -Executable $resolvedSevenZip -WorkingDirectory $extractRoot -Password $password -Arguments @(
        "x", "-y", "-bb0", "-bd", ("-o" + (Quote-NativeArgument $extractRoot)), (Quote-NativeArgument $resolvedArchive)
    ) | Out-Null

    $cliPath = Join-Path $resolvedRepo "scripts/m2-v2-evidence-pilot/apply_m2_v2_private_state_migration.mjs"
    if (-not (Test-Path -LiteralPath $cliPath -PathType Leaf)) {
        throw "migration_restore_cli_missing"
    }
    $arguments = @($cliPath, "--extract-root", $extractRoot, "--target-repo-root", $resolvedRepo)
    if ($Force) {
        $arguments += "--force"
    }
    if ($FaultInjectionPoint) {
        $arguments += @("--fault-at", $FaultInjectionPoint)
    }
    $output = @(& node @arguments)
    if ($LASTEXITCODE -ne 0) {
        throw "migration_restore_cli_failed"
    }
    $output -join [Environment]::NewLine
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
