#Requires -Version 5.1

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$Root,

    [ValidateSet("inspect", "enumerate")]
    [string]$Mode = "inspect"
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$nativeSource = @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

public sealed class M2V2ResolvedIdentity
{
    public string ResolvedPath { get; set; }
    public string VolumeSerialHex { get; set; }
    public string FileIndexHex { get; set; }
    public string FileAttributesHex { get; set; }
}

public static class M2V2NativePath
{
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint FILE_SHARE_DELETE = 0x00000004;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;
    private const uint FILE_FLAG_OPEN_REPARSE_POINT = 0x00200000;
    private const uint FSCTL_GET_REPARSE_POINT = 0x000900A8;

    [StructLayout(LayoutKind.Sequential)]
    private struct BY_HANDLE_FILE_INFORMATION
    {
        public uint FileAttributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastAccessTime;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWriteTime;
        public uint VolumeSerialNumber;
        public uint FileSizeHigh;
        public uint FileSizeLow;
        public uint NumberOfLinks;
        public uint FileIndexHigh;
        public uint FileIndexLow;
    }

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
    private static extern bool DeviceIoControl(
        SafeFileHandle device,
        uint controlCode,
        IntPtr inputBuffer,
        uint inputBufferSize,
        [Out] byte[] outputBuffer,
        uint outputBufferSize,
        out uint bytesReturned,
        IntPtr overlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandle(
        SafeFileHandle file,
        out BY_HANDLE_FILE_INFORMATION fileInformation);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(
        SafeFileHandle file,
        [Out] StringBuilder filePath,
        uint filePathSize,
        uint flags);

    private static SafeFileHandle Open(string path, bool openReparsePoint)
    {
        uint flags = FILE_FLAG_BACKUP_SEMANTICS;
        if (openReparsePoint)
        {
            flags |= FILE_FLAG_OPEN_REPARSE_POINT;
        }
        SafeFileHandle handle = CreateFileW(
            path,
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            IntPtr.Zero,
            OPEN_EXISTING,
            flags,
            IntPtr.Zero);
        if (handle.IsInvalid)
        {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw new Win32Exception(error, "CreateFileW failed for path inspection");
        }
        return handle;
    }

    public static uint GetReparseTag(string path)
    {
        using (SafeFileHandle handle = Open(path, true))
        {
            byte[] buffer = new byte[16 * 1024];
            uint returned;
            if (!DeviceIoControl(
                handle,
                FSCTL_GET_REPARSE_POINT,
                IntPtr.Zero,
                0,
                buffer,
                (uint)buffer.Length,
                out returned,
                IntPtr.Zero))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "FSCTL_GET_REPARSE_POINT failed for path inspection");
            }
            if (returned < 4)
            {
                throw new InvalidDataException("Reparse buffer did not contain a tag");
            }
            return BitConverter.ToUInt32(buffer, 0);
        }
    }

    public static M2V2ResolvedIdentity GetResolvedIdentity(string path)
    {
        using (SafeFileHandle handle = Open(path, false))
        {
            BY_HANDLE_FILE_INFORMATION information;
            if (!GetFileInformationByHandle(handle, out information))
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "GetFileInformationByHandle failed for path inspection");
            }

            StringBuilder resolved = new StringBuilder(32768);
            uint length = GetFinalPathNameByHandleW(handle, resolved, (uint)resolved.Capacity, 0);
            if (length == 0 || length >= resolved.Capacity)
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "GetFinalPathNameByHandleW failed for path inspection");
            }

            ulong fileIndex = ((ulong)information.FileIndexHigh << 32) | information.FileIndexLow;
            return new M2V2ResolvedIdentity
            {
                ResolvedPath = resolved.ToString(),
                VolumeSerialHex = "0x" + information.VolumeSerialNumber.ToString("X8"),
                FileIndexHex = "0x" + fileIndex.ToString("X16"),
                FileAttributesHex = "0x" + information.FileAttributes.ToString("X8")
            };
        }
    }
}
'@

Add-Type -TypeDefinition $nativeSource -Language CSharp -ErrorAction Stop

function Get-ReparseType {
    param([UInt32]$Tag)
    if ($Tag -eq [Convert]::ToUInt32("A0000003", 16)) {
        return "MOUNT_POINT_OR_JUNCTION"
    }
    if ($Tag -eq [Convert]::ToUInt32("A000000C", 16)) {
        return "SYMLINK"
    }
    return "OTHER"
}

function Get-PathRecord {
    param([Parameter(Mandatory = $true)][string]$LiteralPath)

    $fullPath = [System.IO.Path]::GetFullPath($LiteralPath)
    $isDirectory = [System.IO.Directory]::Exists($fullPath)
    $isFile = [System.IO.File]::Exists($fullPath)
    if (-not $isDirectory -and -not $isFile) {
        return [ordered]@{
            path = $fullPath
            exists = $false
            isDirectory = $false
            attributes = @()
            isReparsePoint = $false
            nativeReparseTagHex = $null
            nativeReparseType = $null
            resolvedIdentity = $null
        }
    }

    $attributesValue = [System.IO.File]::GetAttributes($fullPath)
    $attributeNames = @($attributesValue.ToString().Split(',') | ForEach-Object { $_.Trim() })
    $isReparse = (($attributesValue -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)
    $tag = $null
    $tagType = $null
    if ($isReparse) {
        $tagValue = [M2V2NativePath]::GetReparseTag($fullPath)
        $tag = "0x{0:X8}" -f $tagValue
        $tagType = Get-ReparseType -Tag $tagValue
    }
    $identity = [M2V2NativePath]::GetResolvedIdentity($fullPath)

    return [ordered]@{
        path = $fullPath
        exists = $true
        isDirectory = $isDirectory
        attributes = $attributeNames
        isReparsePoint = $isReparse
        nativeReparseTagHex = $tag
        nativeReparseType = $tagType
        resolvedIdentity = [ordered]@{
            resolvedPath = $identity.ResolvedPath
            volumeSerialHex = $identity.VolumeSerialHex
            fileIndexHex = $identity.FileIndexHex
            fileAttributesHex = $identity.FileAttributesHex
        }
    }
}

$rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
$pathFull = [System.IO.Path]::GetFullPath($Path)
$rootPrefix = $rootFull + [System.IO.Path]::DirectorySeparatorChar
if (-not $pathFull.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase) -and
    -not $pathFull.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path must be lexically contained by Root"
}

$ancestorPaths = New-Object System.Collections.Generic.List[string]
$cursor = $pathFull
while ($true) {
    $ancestorPaths.Add($cursor)
    if ($cursor.Equals($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        break
    }
    $parent = [System.IO.Directory]::GetParent($cursor)
    if ($null -eq $parent) {
        throw "Root was not reached while building ancestor chain"
    }
    $cursor = $parent.FullName.TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}
$ancestorPaths.Reverse()
$ancestorRecords = @($ancestorPaths | ForEach-Object { Get-PathRecord -LiteralPath $_ })

$enumeration = @()
if ($Mode -eq "enumerate") {
    if (-not [System.IO.Directory]::Exists($rootFull)) {
        throw "Root must be an existing directory for no-traverse enumeration"
    }
    $entryPaths = @([System.IO.Directory]::EnumerateFileSystemEntries($rootFull))
    [Array]::Sort($entryPaths, [System.StringComparer]::Ordinal)
    $enumeration = @($entryPaths | ForEach-Object { Get-PathRecord -LiteralPath $_ })
}

$result = [ordered]@{
    schema = "m2.v2.pr7.s0.native-windows-path-inspection.v0.1"
    platform = "windows"
    powershell = [ordered]@{
        edition = $PSVersionTable.PSEdition
        version = $PSVersionTable.PSVersion.ToString()
        compatibleWithWindowsPowerShell51 = ($PSVersionTable.PSVersion.Major -ge 5)
    }
    mode = $Mode
    root = $rootFull
    path = $pathFull
    ancestorChain = $ancestorRecords
    finalObject = Get-PathRecord -LiteralPath $pathFull
    noTraverseEnumeration = $enumeration
    localizedTextUsedForDecision = $false
    nativeApis = @(
        "CreateFileW",
        "DeviceIoControl(FSCTL_GET_REPARSE_POINT)",
        "GetFileInformationByHandle",
        "GetFinalPathNameByHandleW"
    )
}

$result | ConvertTo-Json -Depth 12 -Compress
