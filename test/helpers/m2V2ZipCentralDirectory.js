import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

export function parseZipCentralDirectory(bytes) {
  assert.equal(Buffer.isBuffer(bytes), true);
  const eocdOffset = findSignatureFromEnd(bytes, EOCD_SIGNATURE);
  assert.notEqual(eocdOffset, -1, "ZIP EOCD not found");
  const disk = bytes.readUInt16LE(eocdOffset + 4);
  const centralDisk = bytes.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = bytes.readUInt16LE(eocdOffset + 8);
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralBytes = bytes.readUInt32LE(eocdOffset + 12);
  const centralOffset = bytes.readUInt32LE(eocdOffset + 16);
  const commentBytes = bytes.readUInt16LE(eocdOffset + 20);
  assert.equal(disk, 0);
  assert.equal(centralDisk, 0);
  assert.equal(entriesOnDisk, entryCount);
  assert.equal(eocdOffset + 22 + commentBytes, bytes.length);

  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(bytes.readUInt32LE(offset), CENTRAL_SIGNATURE);
    const nameBytes = bytes.readUInt16LE(offset + 28);
    const extraBytes = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const name = bytes.subarray(nameStart, nameStart + nameBytes).toString("utf8");
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    assert.equal(bytes.readUInt32LE(localHeaderOffset), LOCAL_SIGNATURE);
    const localNameBytes = bytes.readUInt16LE(localHeaderOffset + 26);
    const localExtraBytes = bytes.readUInt16LE(localHeaderOffset + 28);
    const localNameStart = localHeaderOffset + 30;
    const localName = bytes
      .subarray(localNameStart, localNameStart + localNameBytes)
      .toString("utf8");
    assert.equal(localName, name);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const dataStart = localNameStart + localNameBytes + localExtraBytes;
    const compressedData = bytes.subarray(dataStart, dataStart + compressedSize);
    entries.push({
      name,
      madeByVersion: bytes.readUInt16LE(offset + 4),
      requiredVersion: bytes.readUInt16LE(offset + 6),
      flags: bytes.readUInt16LE(offset + 8),
      compressionMethod: bytes.readUInt16LE(offset + 10),
      dosTime: bytes.readUInt16LE(offset + 12),
      dosDate: bytes.readUInt16LE(offset + 14),
      crc32: bytes.readUInt32LE(offset + 16),
      compressedSize,
      uncompressedSize: bytes.readUInt32LE(offset + 24),
      nameBytes,
      extraBytes,
      commentBytes: commentLength,
      externalAttributes: bytes.readUInt32LE(offset + 38),
      localHeaderOffset,
      localExtraBytes,
      compressedData,
    });
    offset = nameStart + nameBytes + extraBytes + commentLength;
  }
  assert.equal(offset, centralOffset + centralBytes);
  assert.equal(offset, eocdOffset);
  return { entries, centralBytes, centralOffset, commentBytes };
}

export function readZipEntryData(entry) {
  if ((entry.flags & 0x0001) !== 0) {
    throw new Error("encrypted ZIP entry is intentionally not decoded");
  }
  if (entry.compressionMethod === 0) {
    return Buffer.from(entry.compressedData);
  }
  if (entry.compressionMethod === 8) {
    return inflateRawSync(entry.compressedData);
  }
  throw new Error(`unsupported compression method: ${entry.compressionMethod}`);
}

function findSignatureFromEnd(bytes, signature) {
  for (let offset = bytes.length - 4; offset >= 0; offset -= 1) {
    if (bytes.readUInt32LE(offset) === signature) {
      return offset;
    }
  }
  return -1;
}
