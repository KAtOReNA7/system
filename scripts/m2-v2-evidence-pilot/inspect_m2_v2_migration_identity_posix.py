#!/usr/bin/env python3
"""Collect Linux filesystem identity without following path components."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import sys
import unicodedata


REQUEST_SCHEMA = "m2.v2.migration-path-native-observation-request.private.v0.1"
OBSERVATION_SCHEMA = "m2.v2.migration-path-native-observation.private.v0.1"
PLATFORM = "LINUX_NATIVE"
STAGES = frozenset(
    {
        "BEFORE_ENUMERATION",
        "BEFORE_COPY",
        "BEFORE_ARCHIVE",
        "BEFORE_KEY_WRITE",
        "BEFORE_RECEIPT",
        "AFTER_OPERATION",
    }
)
ENDPOINT_ROLES = frozenset({"REPOSITORY", "SOURCE", "OUTPUT", "KEY", "STAGING"})
REQUEST_FIELDS = frozenset({"schema", "path", "endpointRole", "stage"})
RESERVED_ALIAS = re.compile(
    r"^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$",
    re.IGNORECASE,
)
MOUNT_ID_LINE = re.compile(r"^mnt_id:\s*([0-9]+)\s*$")


class ObserverError(Exception):
    """A sanitized native observer failure."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def fail(code: str) -> "None":
    if re.fullmatch(r"migration_[a-z0-9_]+", code) is None:
        code = "migration_native_observer_failed"
    sys.stderr.write(json.dumps({"code": code}, separators=(",", ":")) + "\n")
    raise SystemExit(1)


def parse_request() -> dict[str, str]:
    try:
        raw = sys.stdin.read()
        value = json.loads(raw)
    except (UnicodeError, json.JSONDecodeError):
        raise ObserverError("migration_native_observer_request_invalid") from None
    if not isinstance(value, dict) or frozenset(value) != REQUEST_FIELDS:
        raise ObserverError("migration_native_observer_request_invalid")
    if (
        value.get("schema") != REQUEST_SCHEMA
        or not isinstance(value.get("path"), str)
        or not isinstance(value.get("endpointRole"), str)
        or not isinstance(value.get("stage"), str)
        or value["endpointRole"] not in ENDPOINT_ROLES
        or value["stage"] not in STAGES
    ):
        raise ObserverError("migration_native_observer_request_invalid")
    return value


def normalize_requested_path(value: str) -> str:
    if not value or "\0" in value:
        raise ObserverError("migration_identity_path_invalid")
    normalized = unicodedata.normalize("NFC", value)
    if not normalized.startswith("/"):
        raise ObserverError("migration_identity_path_not_absolute")
    if normalized.startswith("//") or "\\" in normalized:
        raise ObserverError("migration_identity_path_alias_invalid")
    raw_segments = normalized.split("/")[1:]
    for segment in raw_segments:
        if segment in {".", ".."}:
            raise ObserverError("migration_identity_path_traversal")
        if segment.endswith((".", " ")) or RESERVED_ALIAS.fullmatch(segment):
            raise ObserverError("migration_identity_path_alias_invalid")
        if ":" in segment:
            raise ObserverError("migration_identity_path_ads_invalid")
    return os.path.normpath(normalized)


def read_mount_id(file_descriptor: int) -> str:
    try:
        with open(
            f"/proc/self/fdinfo/{file_descriptor}",
            "r",
            encoding="ascii",
            errors="strict",
        ) as fdinfo:
            for line in fdinfo:
                match = MOUNT_ID_LINE.fullmatch(line.rstrip("\n"))
                if match is not None:
                    return match.group(1)
    except (OSError, UnicodeError):
        raise ObserverError("migration_stable_identity_unavailable") from None
    raise ObserverError("migration_stable_identity_unavailable")


def digest_resolved_path(file_descriptor: int, expected_path: str) -> str:
    try:
        resolved = os.readlink(f"/proc/self/fd/{file_descriptor}")
    except OSError:
        raise ObserverError("migration_stable_identity_unavailable") from None
    if resolved.endswith(" (deleted)"):
        raise ObserverError("migration_identity_changed")
    canonical = unicodedata.normalize("NFC", resolved)
    if os.path.normpath(canonical) != expected_path:
        raise ObserverError("migration_identity_changed")
    return hashlib.sha256(canonical.encode("utf-8", errors="strict")).hexdigest()


def make_record(
    file_descriptor: int,
    ancestor_index: int,
    request: dict[str, str],
    expected_path: str,
) -> dict[str, object]:
    try:
        identity = os.fstat(file_descriptor)
    except OSError:
        raise ObserverError("migration_native_observer_failed") from None
    if identity.st_ino <= 0:
        raise ObserverError("migration_stable_identity_unavailable")
    return {
        "stage": request["stage"],
        "endpointRole": request["endpointRole"],
        "ancestorIndex": ancestor_index,
        "device": str(identity.st_dev),
        "inode": str(identity.st_ino),
        "mode": str(identity.st_mode),
        "mountId": read_mount_id(file_descriptor),
        "resolvedPathDigestSha256": digest_resolved_path(file_descriptor, expected_path),
        "noFollowVerified": True,
    }


def observe(path: str, request: dict[str, str]) -> list[dict[str, object]]:
    required_flags = ("O_PATH", "O_NOFOLLOW", "O_DIRECTORY", "O_CLOEXEC")
    if not sys.platform.startswith("linux") or any(not hasattr(os, name) for name in required_flags):
        raise ObserverError("migration_native_observer_unavailable")

    descriptors: list[int] = []
    records: list[dict[str, object]] = []
    try:
        root_descriptor = os.open("/", os.O_PATH | os.O_DIRECTORY | os.O_CLOEXEC)
        descriptors.append(root_descriptor)
        records.append(make_record(root_descriptor, 0, request, "/"))
        parent_descriptor = root_descriptor
        expected_path = "/"

        components = [component for component in path.split("/") if component]
        for component in components:
            descriptor = os.open(
                component,
                os.O_PATH | os.O_NOFOLLOW | os.O_CLOEXEC,
                dir_fd=parent_descriptor,
            )
            descriptors.append(descriptor)
            expected_path = os.path.join(expected_path, component)
            record = make_record(descriptor, len(records), request, expected_path)
            records.append(record)
            mode = int(record["mode"])
            if stat.S_ISLNK(mode) or not stat.S_ISDIR(mode):
                break
            parent_descriptor = descriptor
        return records
    except ObserverError:
        raise
    except OSError:
        raise ObserverError("migration_native_observer_failed") from None
    finally:
        for descriptor in reversed(descriptors):
            try:
                os.close(descriptor)
            except OSError:
                pass


def main() -> None:
    request = parse_request()
    path = normalize_requested_path(request["path"])
    records = observe(path, request)
    observation = {
        "schema": OBSERVATION_SCHEMA,
        "platform": PLATFORM,
        "stage": request["stage"],
        "endpointRole": request["endpointRole"],
        "records": records,
    }
    sys.stdout.write(
        json.dumps(observation, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
        + "\n"
    )


if __name__ == "__main__":
    try:
        main()
    except ObserverError as error:
        fail(error.code)
    except Exception:
        fail("migration_native_observer_failed")
