$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$requestSchema = "m2.v2.migration-path-native-observation-request.private.v0.1"
$observationSchema = "m2.v2.migration-path-native-observation.private.v0.1"
$platform = "WINDOWS_POWERSHELL_5_1_NATIVE"
$stages = @(
  "BEFORE_ENUMERATION",
  "BEFORE_COPY",
  "BEFORE_ARCHIVE",
  "BEFORE_KEY_WRITE",
  "BEFORE_RECEIPT",
  "AFTER_OPERATION"
)
$endpointRoles = @("REPOSITORY", "SOURCE", "OUTPUT", "KEY", "STAGING")

function Stop-NativeObserver {
  param([string]$Code)

  if ($Code -notmatch '^migration_[a-z0-9_]+$') {
    $Code = "migration_native_observer_failed"
  }
  $failure = [ordered]@{ code = $Code }
  [Console]::Error.WriteLine(($failure | ConvertTo-Json -Compress))
  exit 1
}

function Assert-ExactProperties {
  param(
    [object]$Value,
    [string[]]$Expected
  )

  if ($null -eq $Value -or $Value -is [System.Array]) {
    throw [System.InvalidOperationException]::new("migration_native_observer_request_invalid")
  }
  $actual = @($Value.PSObject.Properties.Name | Sort-Object)
  $wanted = @($Expected | Sort-Object)
  if ($actual.Count -ne $wanted.Count) {
    throw [System.InvalidOperationException]::new("migration_native_observer_request_invalid")
  }
  for ($index = 0; $index -lt $wanted.Count; $index += 1) {
    if ($actual[$index] -cne $wanted[$index]) {
      throw [System.InvalidOperationException]::new("migration_native_observer_request_invalid")
    }
  }
}

function Resolve-RequestedPath {
  param([string]$RequestedPath)

  if ([string]::IsNullOrEmpty($RequestedPath) -or $RequestedPath.IndexOf([char]0) -ge 0) {
    throw [System.InvalidOperationException]::new("migration_identity_path_invalid")
  }
  $normalized = $RequestedPath.Normalize([Text.NormalizationForm]::FormC).Replace('/', '\')
  if ($normalized -match '^(?:\\\\[?.]\\|\\\\\?\\?\\)') {
    throw [System.InvalidOperationException]::new("migration_identity_path_device_namespace")
  }
  if ($normalized -notmatch '^(?:[A-Za-z]:\\|\\\\[^\\]+\\[^\\]+(?:\\|$))') {
    throw [System.InvalidOperationException]::new("migration_identity_path_not_absolute")
  }
  $segments = @($normalized -split '\\+' | Where-Object { $_ -ne "" })
  foreach ($segment in $segments) {
    if ($segment -eq "." -or $segment -eq "..") {
      throw [System.InvalidOperationException]::new("migration_identity_path_traversal")
    }
    if ($segment -match '[. ]$' -or
        $segment -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$') {
      throw [System.InvalidOperationException]::new("migration_identity_path_alias_invalid")
    }
  }
  $colonScope = if ($normalized -match '^[A-Za-z]:\\') {
    $normalized.Substring(2)
  } else {
    $normalized
  }
  if ($colonScope.Contains(':')) {
    throw [System.InvalidOperationException]::new("migration_identity_path_ads_invalid")
  }
  return [IO.Path]::GetFullPath($normalized).Normalize([Text.NormalizationForm]::FormC)
}

function Get-AncestorPathChain {
  param([string]$FullPath)

  $root = [IO.Path]::GetPathRoot($FullPath)
  if ([string]::IsNullOrEmpty($root)) {
    throw [System.InvalidOperationException]::new("migration_identity_path_not_absolute")
  }
  $paths = New-Object 'System.Collections.Generic.List[string]'
  $paths.Add($root)
  $cursor = $root
  $tail = $FullPath.Substring($root.Length)
  foreach ($part in @($tail -split '\\+' | Where-Object { $_ -ne "" })) {
    $cursor = [IO.Path]::Combine($cursor, $part)
    $paths.Add($cursor)
  }
  return $paths.ToArray()
}

$observerPhase = "initialization"
try {
  if ($PSVersionTable.PSEdition -cne "Desktop" -or
      $PSVersionTable.PSVersion.Major -ne 5 -or
      $PSVersionTable.PSVersion.Minor -ne 1) {
    throw [System.InvalidOperationException]::new("migration_native_observer_unavailable")
  }
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  [Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)

  $observerPhase = "request"
  $requestText = [Console]::In.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($requestText)) {
    throw [System.InvalidOperationException]::new("migration_native_observer_request_invalid")
  }
  $request = $requestText | ConvertFrom-Json
  Assert-ExactProperties -Value $request -Expected @("schema", "path", "endpointRole", "stage")
  if ($request.schema -cne $requestSchema -or
      $request.path -isnot [string] -or
      $request.endpointRole -isnot [string] -or
      $request.stage -isnot [string] -or
      $endpointRoles -cnotcontains $request.endpointRole -or
      $stages -cnotcontains $request.stage) {
    throw [System.InvalidOperationException]::new("migration_native_observer_request_invalid")
  }
  $observerPhase = "path_validation"
  $fullPath = Resolve-RequestedPath -RequestedPath $request.path
  $pathChain = @(Get-AncestorPathChain -FullPath $fullPath)

  $observerPhase = "native_compile"
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

public static class M2V2MigrationIdentityNative
{
    private const uint FileShareRead = 0x00000001;
    private const uint FileShareWrite = 0x00000002;
    private const uint OpenExisting = 3;
    private const uint FileFlagBackupSemantics = 0x02000000;
    private const uint FileFlagOpenReparsePoint = 0x00200000;
    private const int FileAttributeTagInfo = 9;
    private const int FileIdInfo = 18;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetFileInformationByHandleEx(
        SafeFileHandle fileHandle,
        int fileInformationClass,
        IntPtr fileInformation,
        uint bufferSize);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(
        SafeFileHandle fileHandle,
        StringBuilder filePath,
        uint filePathLength,
        uint flags);

    public sealed class IdentityRecord
    {
        public uint Attributes { get; set; }
        public uint ReparseTag { get; set; }
        public ulong VolumeSerialNumber { get; set; }
        public byte[] FileId { get; set; }
        public string FinalPathDigestSha256 { get; set; }
    }

    public static IdentityRecord[] ObservePaths(string[] paths)
    {
        if (paths == null || paths.Length == 0)
        {
            throw new InvalidOperationException("migration_native_observer_request_invalid");
        }

        List<SafeFileHandle> handles = new List<SafeFileHandle>();
        List<IdentityRecord> records = new List<IdentityRecord>();
        try
        {
            for (int pathIndex = 0; pathIndex < paths.Length; pathIndex++)
            {
                string path = paths[pathIndex];
                SafeFileHandle handle = CreateFileW(
                    path,
                    0,
                    FileShareRead | FileShareWrite,
                    IntPtr.Zero,
                    OpenExisting,
                    FileFlagBackupSemantics | FileFlagOpenReparsePoint,
                    IntPtr.Zero);
                if (handle == null || handle.IsInvalid)
                {
                    int nativeError = Marshal.GetLastWin32Error();
                    if (handle != null) handle.Dispose();
                    throw new InvalidOperationException(
                        "migration_native_observer_open_" +
                        pathIndex.ToString(CultureInfo.InvariantCulture) +
                        "_" +
                        nativeError.ToString(CultureInfo.InvariantCulture) +
                        "_failed");
                }
                handles.Add(handle);

                IdentityRecord record = ReadIdentity(handle);
                records.Add(record);
                if (record.ReparseTag != 0)
                {
                    break;
                }
            }
            return records.ToArray();
        }
        finally
        {
            foreach (SafeFileHandle handle in handles)
            {
                handle.Dispose();
            }
        }
    }

    private static IdentityRecord ReadIdentity(SafeFileHandle handle)
    {
        IntPtr tagBuffer = Marshal.AllocHGlobal(8);
        IntPtr idBuffer = Marshal.AllocHGlobal(24);
        try
        {
            if (!GetFileInformationByHandleEx(handle, FileAttributeTagInfo, tagBuffer, 8))
            {
                throw new InvalidOperationException("migration_native_observer_attributes_failed");
            }
            if (!GetFileInformationByHandleEx(handle, FileIdInfo, idBuffer, 24))
            {
                throw new InvalidOperationException("migration_stable_identity_unavailable");
            }

            byte[] fileId = new byte[16];
            Marshal.Copy(IntPtr.Add(idBuffer, 8), fileId, 0, fileId.Length);
            ulong volumeSerialNumber = unchecked((ulong)Marshal.ReadInt64(idBuffer, 0));
            bool fileIdIsZero = true;
            foreach (byte value in fileId)
            {
                if (value != 0)
                {
                    fileIdIsZero = false;
                    break;
                }
            }
            if (volumeSerialNumber == 0 || fileIdIsZero)
            {
                throw new InvalidOperationException("migration_stable_identity_unavailable");
            }
            return new IdentityRecord
            {
                Attributes = unchecked((uint)Marshal.ReadInt32(tagBuffer, 0)),
                ReparseTag = unchecked((uint)Marshal.ReadInt32(tagBuffer, 4)),
                VolumeSerialNumber = volumeSerialNumber,
                FileId = fileId,
                FinalPathDigestSha256 = DigestFinalPath(GetFinalPath(handle))
            };
        }
        finally
        {
            Marshal.FreeHGlobal(tagBuffer);
            Marshal.FreeHGlobal(idBuffer);
        }
    }

    private static string GetFinalPath(SafeFileHandle handle)
    {
        StringBuilder buffer = new StringBuilder(1024);
        uint length = GetFinalPathNameByHandleW(handle, buffer, (uint)buffer.Capacity, 0);
        if (length == 0)
        {
            throw new InvalidOperationException("migration_stable_identity_unavailable");
        }
        if (length >= buffer.Capacity)
        {
            buffer = new StringBuilder(checked((int)length + 1));
            length = GetFinalPathNameByHandleW(handle, buffer, (uint)buffer.Capacity, 0);
            if (length == 0 || length >= buffer.Capacity)
            {
                throw new InvalidOperationException("migration_stable_identity_unavailable");
            }
        }
        return buffer.ToString();
    }

    private static string DigestFinalPath(string finalPath)
    {
        string canonical = finalPath;
        if (canonical.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase))
        {
            canonical = @"\\" + canonical.Substring(8);
        }
        else if (canonical.StartsWith(@"\\?\", StringComparison.OrdinalIgnoreCase))
        {
            canonical = canonical.Substring(4);
        }
        canonical = canonical
            .Normalize(NormalizationForm.FormC)
            .Replace('/', '\\')
            .TrimEnd('\\')
            .ToUpperInvariant();
        using (SHA256 sha256 = SHA256.Create())
        {
            byte[] bytes = Encoding.UTF8.GetBytes(canonical);
            byte[] digest = sha256.ComputeHash(bytes);
            return BitConverter.ToString(digest).Replace("-", "").ToLowerInvariant();
        }
    }

    public static string Hex8(uint value)
    {
        return "0x" + value.ToString("x8", CultureInfo.InvariantCulture);
    }

    public static string Hex16(ulong value)
    {
        return value.ToString("x16", CultureInfo.InvariantCulture);
    }

    public static string Hex128(byte[] value)
    {
        return BitConverter.ToString(value).Replace("-", "").ToLowerInvariant();
    }
}
'@

  $observerPhase = "native_observation"
  $nativeRecords = [M2V2MigrationIdentityNative]::ObservePaths([string[]]$pathChain)
  $records = New-Object 'System.Collections.Generic.List[object]'
  for ($index = 0; $index -lt $nativeRecords.Count; $index += 1) {
    $nativeRecord = $nativeRecords[$index]
    $records.Add([ordered]@{
      stage = $request.stage
      endpointRole = $request.endpointRole
      ancestorIndex = $index
      attributes = [M2V2MigrationIdentityNative]::Hex8($nativeRecord.Attributes)
      reparseTag = [M2V2MigrationIdentityNative]::Hex8($nativeRecord.ReparseTag)
      volumeSerialNumber = [M2V2MigrationIdentityNative]::Hex16($nativeRecord.VolumeSerialNumber)
      fileId128 = [M2V2MigrationIdentityNative]::Hex128($nativeRecord.FileId)
      finalPathDigestSha256 = $nativeRecord.FinalPathDigestSha256
    })
  }
  $observation = [ordered]@{
    schema = $observationSchema
    platform = $platform
    stage = $request.stage
    endpointRole = $request.endpointRole
    records = $records.ToArray()
  }
  $observerPhase = "serialization"
  [Console]::Out.WriteLine(($observation | ConvertTo-Json -Depth 6 -Compress))
  exit 0
} catch {
  $code = $_.Exception.Message
  if ($code -notmatch '^migration_[a-z0-9_]+$') {
    $baseException = $_.Exception.GetBaseException()
    if ($baseException.Message -match '^migration_[a-z0-9_]+$') {
      $code = $baseException.Message
    } elseif ($baseException -is [System.ComponentModel.Win32Exception]) {
      $code = "migration_native_observer_win32_$($baseException.NativeErrorCode)"
    } else {
      $code = "migration_native_observer_${observerPhase}_failed"
    }
  }
  Stop-NativeObserver -Code $code
}
