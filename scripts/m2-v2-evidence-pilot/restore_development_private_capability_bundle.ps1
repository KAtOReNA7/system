[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,

    [Parameter(Mandatory = $true)]
    [string]$TargetRepoRoot,

    [string]$Sha256Path,

    [string]$SevenZipPath = "C:\Program Files\7-Zip\7z.exe",

    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Quote-NativeArgument([string]$Value) {
    if ($Value.IndexOf('"') -ge 0) {
        throw "private_capability_native_argument_contains_quote"
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
        [void]$process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw "private_capability_seven_zip_failed_exit_$($process.ExitCode)"
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
    $memberCount = 0
    [int64]$totalUncompressedBytes = 0
    foreach ($line in ($Listing -split "`r?`n")) {
        if ($line -match '^Path = (.+)$') {
            $path = $Matches[1].Replace('\', '/')
            if ([string]::IsNullOrWhiteSpace($path) -or $path.StartsWith('/') -or
                $path.StartsWith('//') -or $path.Contains(':') -or
                ($path.Split('/') -contains '..') -or ($path.Split('/') -contains '.')) {
                throw "private_capability_archive_member_path_invalid"
            }
            $memberCount += 1
        }
        elseif ($line -match '^Size = ([0-9]+)$') {
            [int64]$memberBytes = $Matches[1]
            if ($memberBytes -gt 16777216) {
                throw "private_capability_archive_member_too_large"
            }
            $totalUncompressedBytes += $memberBytes
        }
    }
    if ($memberCount -lt 10 -or $memberCount -gt 64) {
        throw "private_capability_archive_member_count_invalid"
    }
    if ($totalUncompressedBytes -gt 67108864) {
        throw "private_capability_archive_uncompressed_budget_exceeded"
    }
}

$resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
$resolvedRepo = (Resolve-Path -LiteralPath $TargetRepoRoot).Path
$resolvedSevenZip = (Resolve-Path -LiteralPath $SevenZipPath).Path
if (-not (Test-Path -LiteralPath (Join-Path $resolvedRepo ".git")) -or
    -not (Test-Path -LiteralPath (Join-Path $resolvedRepo "package.json"))) {
    throw "private_capability_target_is_not_project_repository"
}
if (-not $Sha256Path) {
    $Sha256Path = "$resolvedArchive.sha256"
}
& (Join-Path $PSScriptRoot "verify_development_private_capability_bundle.ps1") `
    -ArchivePath $resolvedArchive -Sha256Path $Sha256Path | Out-Null

$password = Read-Host "Enter the encrypted capability package password" -AsSecureString
$extractRoot = Join-Path ([IO.Path]::GetTempPath()) ("development-private-capability-restore-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $extractRoot | Out-Null
try {
    $listing = Invoke-SevenZipSecure -Executable $resolvedSevenZip -WorkingDirectory $extractRoot -Password $password -Arguments @(
        "l", "-slt", "-ba", "-bb0", "-bd", (Quote-NativeArgument $resolvedArchive)
    )
    Assert-ArchiveListingSafe $listing
    Invoke-SevenZipSecure -Executable $resolvedSevenZip -WorkingDirectory $extractRoot -Password $password -Arguments @(
        "x", "-y", "-bb0", "-bd", ("-o" + (Quote-NativeArgument $extractRoot)),
        (Quote-NativeArgument $resolvedArchive)
    ) | Out-Null

    $applyCli = Join-Path $resolvedRepo "scripts/m2-v2-evidence-pilot/apply_development_private_capability_bundle.mjs"
    if (-not (Test-Path -LiteralPath $applyCli -PathType Leaf)) {
        throw "private_capability_apply_cli_missing"
    }
    $arguments = @($applyCli, "--extract-root", $extractRoot, "--target-repo-root", $resolvedRepo)
    if ($Force) {
        $arguments += "--force"
    }
    $output = @(& node @arguments)
    if ($LASTEXITCODE -ne 0) {
        throw "private_capability_apply_cli_failed"
    }
    $output -join [Environment]::NewLine
}
finally {
    $password = $null
    $safeTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    $resolvedExtract = [IO.Path]::GetFullPath($extractRoot)
    if ($resolvedExtract.StartsWith($safeTempRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Split-Path -Leaf $resolvedExtract).StartsWith("development-private-capability-restore-")) {
        Remove-Item -LiteralPath $resolvedExtract -Recurse -Force -ErrorAction SilentlyContinue
    }
}
