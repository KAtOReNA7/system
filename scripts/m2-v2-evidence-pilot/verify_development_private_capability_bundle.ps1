[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ArchivePath,

    [string]$Sha256Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
if (-not $Sha256Path) {
    $Sha256Path = "$resolvedArchive.sha256"
}
$resolvedSha256 = (Resolve-Path -LiteralPath $Sha256Path).Path
$line = (Get-Content -LiteralPath $resolvedSha256 -Raw -Encoding UTF8).Trim()
if ($line -notmatch '^([A-Fa-f0-9]{64})\s+\*?(.+)$') {
    throw "private_capability_sha256_sidecar_invalid"
}

$expected = $Matches[1].ToLowerInvariant()
$listedName = [IO.Path]::GetFileName($Matches[2].Trim())
$archiveName = [IO.Path]::GetFileName($resolvedArchive)
if ($listedName -ne $archiveName) {
    throw "private_capability_sha256_filename_mismatch"
}
$actual = (Get-FileHash -LiteralPath $resolvedArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) {
    throw "private_capability_archive_sha256_mismatch"
}

[ordered]@{
    status = "verified"
    archiveFileName = $archiveName
    sha256 = $actual
    sizeBytes = (Get-Item -LiteralPath $resolvedArchive).Length
} | ConvertTo-Json -Compress
