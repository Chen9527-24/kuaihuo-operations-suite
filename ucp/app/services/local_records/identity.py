from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import threading
import time
import uuid
from typing import Any

from .normalizers import iso_utc, normalize_identifier, normalize_platform

REGISTRY_SCHEMA_VERSION = 1


@dataclass(frozen=True, slots=True)
class AccountRegistration:
    store_id: str
    tenant_id: str
    platform: str
    robot_id: str
    auth_id: str
    auth_uid: str
    display_name: str
    identity_level: str
    conflict: bool = False

    @property
    def account_dir_name(self) -> str:
        return self.store_id


class AccountRegistry:
    """Maps mutable robot/auth identifiers to one stable local account store."""

    def __init__(self, records_root: Path) -> None:
        self.records_root = Path(records_root)
        self.records_root.mkdir(parents=True, exist_ok=True)
        self.accounts_root = self.records_root / "accounts"
        self.accounts_root.mkdir(parents=True, exist_ok=True)
        self.db_path = self.records_root / "registry.sqlite"
        self._lock = threading.RLock()
        self._connection = self._connect()
        self._initialize_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.db_path), timeout=0.25, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout=250")
        connection.execute("PRAGMA foreign_keys=ON")
        try:
            connection.execute("PRAGMA journal_mode=WAL").fetchone()
        except sqlite3.DatabaseError:
            connection.execute("PRAGMA journal_mode=DELETE")
        return connection

    def _initialize_schema(self) -> None:
        with self._lock, self._connection:
            self._connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS schema_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS account_stores (
                    store_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    canonical_auth_uid TEXT NOT NULL DEFAULT '',
                    display_name TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at_utc TEXT NOT NULL,
                    updated_at_utc TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS identity_aliases (
                    alias_type TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    alias_value TEXT NOT NULL,
                    store_id TEXT NOT NULL,
                    created_at_utc TEXT NOT NULL,
                    updated_at_utc TEXT NOT NULL,
                    PRIMARY KEY(alias_type, tenant_id, platform, alias_value),
                    FOREIGN KEY(store_id) REFERENCES account_stores(store_id)
                );

                CREATE TABLE IF NOT EXISTS robot_bindings (
                    binding_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tenant_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    robot_id TEXT NOT NULL,
                    store_id TEXT NOT NULL,
                    auth_id TEXT NOT NULL DEFAULT '',
                    auth_uid TEXT NOT NULL DEFAULT '',
                    started_at_utc TEXT NOT NULL,
                    ended_at_utc TEXT NOT NULL DEFAULT '',
                    is_current INTEGER NOT NULL DEFAULT 1,
                    FOREIGN KEY(store_id) REFERENCES account_stores(store_id)
                );
                CREATE UNIQUE INDEX IF NOT EXISTS uq_robot_current_binding
                    ON robot_bindings(tenant_id, platform, robot_id)
                    WHERE is_current = 1;

                CREATE TABLE IF NOT EXISTS merge_conflicts (
                    conflict_id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    platform TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    store_ids_json TEXT NOT NULL,
                    identifiers_json TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at_utc TEXT NOT NULL,
                    updated_at_utc TEXT NOT NULL
                );
                """
            )
            self._connection.execute(
                "INSERT INTO schema_meta(key, value) VALUES('schema_version', ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(REGISTRY_SCHEMA_VERSION),),
            )

    @staticmethod
    def _value(account: Any, name: str, default: str = "") -> str:
        if isinstance(account, dict):
            value = account.get(name, default)
        else:
            value = getattr(account, name, default)
        return normalize_identifier(value)

    def register_account(self, account: Any) -> AccountRegistration:
        tenant_id = self._value(account, "tenant_id") or self._value(account, "tenantId") or "unknown-tenant"
        platform = normalize_platform(self._value(account, "platform") or "UNKNOWN")
        robot_id = self._value(account, "id") or self._value(account, "robot_id") or self._value(account, "robotId")
        auth_id = self._value(account, "auth_id") or self._value(account, "authId")
        auth_uid = self._value(account, "auth_uid") or self._value(account, "authUid")
        display_name = (
            self._value(account, "auth_name")
            or self._value(account, "authName")
            or self._value(account, "name")
            or auth_uid
            or robot_id
            or "未命名账号"
        )[:256]
        if not robot_id and not auth_id and not auth_uid:
            raise ValueError("account identity is empty")

        now = iso_utc()
        last_error: Exception | None = None
        with self._lock:
            for attempt, delay in enumerate((0.02, 0.05, 0.1, 0.25, 0.5), start=1):
                try:
                    self._connection.execute("BEGIN IMMEDIATE")
                    registration = self._register_account_transaction(
                        tenant_id=tenant_id,
                        platform=platform,
                        robot_id=robot_id,
                        auth_id=auth_id,
                        auth_uid=auth_uid,
                        display_name=display_name,
                        now=now,
                    )
                    self._connection.commit()
                    break
                except sqlite3.OperationalError as exc:
                    self._connection.rollback()
                    last_error = exc
                    if "locked" not in str(exc).lower() and "busy" not in str(exc).lower():
                        raise
                    if attempt < 5:
                        time.sleep(delay)
                except Exception:
                    self._connection.rollback()
                    raise
            else:
                if last_error:
                    raise last_error
                raise RuntimeError("account registration failed")

        self._write_account_json(registration)
        return registration

    def _register_account_transaction(
        self,
        *,
        tenant_id: str,
        platform: str,
        robot_id: str,
        auth_id: str,
        auth_uid: str,
        display_name: str,
        now: str,
    ) -> AccountRegistration:
        uid_store = self._lookup_alias("auth_uid", tenant_id, platform, auth_uid) if auth_uid else ""
        auth_store = self._lookup_alias("auth_id", tenant_id, platform, auth_id) if auth_id else ""
        robot_store = self._lookup_current_robot_store(tenant_id, platform, robot_id) if robot_id else ""

        conflict_stores = {item for item in (uid_store, auth_store) if item}
        conflict = len(conflict_stores) > 1
        if conflict:
            self._record_conflict(
                tenant_id=tenant_id,
                platform=platform,
                reason="auth_uid_and_auth_id_point_to_different_stores",
                store_ids=sorted(conflict_stores),
                identifiers={"robotId": robot_id, "authId": auth_id, "authUid": auth_uid},
                now=now,
            )

        selected = uid_store or auth_store
        if not selected and robot_store:
            existing_uid = self._store_canonical_uid(robot_store)
            if auth_uid and existing_uid and existing_uid != auth_uid:
                self._record_conflict(
                    tenant_id=tenant_id,
                    platform=platform,
                    reason="robot_rebound_to_new_auth_uid",
                    store_ids=[robot_store],
                    identifiers={"robotId": robot_id, "oldAuthUid": existing_uid, "newAuthUid": auth_uid},
                    now=now,
                )
            else:
                selected = robot_store

        if not selected:
            selected = self._create_store(tenant_id, platform, auth_uid, display_name, now)

        self._connection.execute(
            "UPDATE account_stores SET canonical_auth_uid=CASE WHEN ? <> '' THEN ? ELSE canonical_auth_uid END, "
            "display_name=CASE WHEN ? <> '' THEN ? ELSE display_name END, updated_at_utc=? WHERE store_id=?",
            (auth_uid, auth_uid, display_name, display_name, now, selected),
        )

        if auth_uid:
            self._bind_alias("auth_uid", tenant_id, platform, auth_uid, selected, now)
        if auth_id:
            self._bind_alias("auth_id", tenant_id, platform, auth_id, selected, now)
        if robot_id:
            self._bind_robot(tenant_id, platform, robot_id, selected, auth_id, auth_uid, now)

        return AccountRegistration(
            store_id=selected,
            tenant_id=tenant_id,
            platform=platform,
            robot_id=robot_id,
            auth_id=auth_id,
            auth_uid=auth_uid,
            display_name=display_name,
            identity_level="auth_uid" if auth_uid else ("auth_id" if auth_id else "robot_id"),
            conflict=conflict,
        )

    def _lookup_alias(self, alias_type: str, tenant_id: str, platform: str, alias_value: str) -> str:
        row = self._connection.execute(
            "SELECT store_id FROM identity_aliases WHERE alias_type=? AND tenant_id=? AND platform=? AND alias_value=?",
            (alias_type, tenant_id, platform, alias_value),
        ).fetchone()
        return str(row["store_id"]) if row else ""

    def _lookup_current_robot_store(self, tenant_id: str, platform: str, robot_id: str) -> str:
        row = self._connection.execute(
            "SELECT store_id FROM robot_bindings WHERE tenant_id=? AND platform=? AND robot_id=? AND is_current=1",
            (tenant_id, platform, robot_id),
        ).fetchone()
        return str(row["store_id"]) if row else ""

    def _store_canonical_uid(self, store_id: str) -> str:
        row = self._connection.execute(
            "SELECT canonical_auth_uid FROM account_stores WHERE store_id=?",
            (store_id,),
        ).fetchone()
        return str(row["canonical_auth_uid"] or "") if row else ""

    def _create_store(self, tenant_id: str, platform: str, auth_uid: str, display_name: str, now: str) -> str:
        store_id = f"acct_{uuid.uuid4().hex[:24]}"
        self._connection.execute(
            "INSERT INTO account_stores(store_id, tenant_id, platform, canonical_auth_uid, display_name, created_at_utc, updated_at_utc) "
            "VALUES(?, ?, ?, ?, ?, ?, ?)",
            (store_id, tenant_id, platform, auth_uid, display_name, now, now),
        )
        return store_id

    def _bind_alias(self, alias_type: str, tenant_id: str, platform: str, alias_value: str, store_id: str, now: str) -> None:
        existing = self._lookup_alias(alias_type, tenant_id, platform, alias_value)
        if existing and existing != store_id:
            self._record_conflict(
                tenant_id=tenant_id,
                platform=platform,
                reason=f"{alias_type}_alias_collision",
                store_ids=sorted({existing, store_id}),
                identifiers={alias_type: alias_value},
                now=now,
            )
            return
        self._connection.execute(
            "INSERT INTO identity_aliases(alias_type, tenant_id, platform, alias_value, store_id, created_at_utc, updated_at_utc) "
            "VALUES(?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(alias_type, tenant_id, platform, alias_value) DO UPDATE SET updated_at_utc=excluded.updated_at_utc",
            (alias_type, tenant_id, platform, alias_value, store_id, now, now),
        )

    def _bind_robot(
        self,
        tenant_id: str,
        platform: str,
        robot_id: str,
        store_id: str,
        auth_id: str,
        auth_uid: str,
        now: str,
    ) -> None:
        row = self._connection.execute(
            "SELECT binding_id, store_id, auth_id, auth_uid FROM robot_bindings "
            "WHERE tenant_id=? AND platform=? AND robot_id=? AND is_current=1",
            (tenant_id, platform, robot_id),
        ).fetchone()
        if row and str(row["store_id"]) == store_id:
            self._connection.execute(
                "UPDATE robot_bindings SET auth_id=CASE WHEN ? <> '' THEN ? ELSE auth_id END, "
                "auth_uid=CASE WHEN ? <> '' THEN ? ELSE auth_uid END WHERE binding_id=?",
                (auth_id, auth_id, auth_uid, auth_uid, int(row["binding_id"])),
            )
            return
        if row:
            self._connection.execute(
                "UPDATE robot_bindings SET is_current=0, ended_at_utc=? WHERE binding_id=?",
                (now, int(row["binding_id"])),
            )
        self._connection.execute(
            "INSERT INTO robot_bindings(tenant_id, platform, robot_id, store_id, auth_id, auth_uid, started_at_utc, is_current) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, 1)",
            (tenant_id, platform, robot_id, store_id, auth_id, auth_uid, now),
        )

    def _record_conflict(
        self,
        *,
        tenant_id: str,
        platform: str,
        reason: str,
        store_ids: list[str],
        identifiers: dict[str, str],
        now: str,
    ) -> None:
        normalized = json.dumps(
            {"reason": reason, "stores": sorted(store_ids), "identifiers": identifiers},
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        conflict_id = uuid.uuid5(uuid.NAMESPACE_URL, normalized).hex
        self._connection.execute(
            "INSERT INTO merge_conflicts(conflict_id, tenant_id, platform, reason, store_ids_json, identifiers_json, created_at_utc, updated_at_utc) "
            "VALUES(?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(conflict_id) DO UPDATE SET updated_at_utc=excluded.updated_at_utc",
            (
                conflict_id,
                tenant_id,
                platform,
                reason,
                json.dumps(sorted(store_ids), ensure_ascii=False),
                json.dumps(identifiers, ensure_ascii=False, sort_keys=True),
                now,
                now,
            ),
        )

    def account_dir(self, store_id: str) -> Path:
        safe_store_id = normalize_identifier(store_id, max_length=80)
        if not safe_store_id.startswith("acct_"):
            raise ValueError("invalid store_id")
        path = self.accounts_root / safe_store_id
        path.mkdir(parents=True, exist_ok=True)
        (path / "reports").mkdir(exist_ok=True)
        (path / "exports").mkdir(exist_ok=True)
        return path

    def _write_account_json(self, registration: AccountRegistration) -> None:
        account_dir = self.account_dir(registration.store_id)
        path = account_dir / "account.json"
        last_error: Exception | None = None
        with self._lock:
            for attempt, delay in enumerate((0.02, 0.05, 0.1, 0.2), start=1):
                try:
                    self._connection.execute("BEGIN IMMEDIATE")
                    store_row = self._connection.execute(
                        "SELECT tenant_id, platform, canonical_auth_uid, display_name, created_at_utc "
                        "FROM account_stores WHERE store_id=?",
                        (registration.store_id,),
                    ).fetchone()
                    if not store_row:
                        raise ValueError("store not found")
                    auth_uids = [
                        str(row[0])
                        for row in self._connection.execute(
                            "SELECT alias_value FROM identity_aliases WHERE store_id=? AND alias_type='auth_uid' ORDER BY alias_value",
                            (registration.store_id,),
                        ).fetchall()
                    ]
                    auth_ids = [
                        str(row[0])
                        for row in self._connection.execute(
                            "SELECT alias_value FROM identity_aliases WHERE store_id=? AND alias_type='auth_id' ORDER BY alias_value",
                            (registration.store_id,),
                        ).fetchall()
                    ]
                    robot_ids = [
                        str(row[0])
                        for row in self._connection.execute(
                            "SELECT DISTINCT robot_id FROM robot_bindings WHERE store_id=? ORDER BY robot_id",
                            (registration.store_id,),
                        ).fetchall()
                    ]
                    payload = {
                        "schemaVersion": 1,
                        "storeId": registration.store_id,
                        "tenantId": str(store_row["tenant_id"]),
                        "platform": str(store_row["platform"]),
                        "displayName": str(store_row["display_name"] or registration.display_name),
                        "currentAuthUid": registration.auth_uid or str(store_row["canonical_auth_uid"] or ""),
                        "currentAuthId": registration.auth_id,
                        "authUids": auth_uids,
                        "authIds": auth_ids,
                        "robotIds": robot_ids,
                        "identityLevel": registration.identity_level,
                        "createdAtUtc": str(store_row["created_at_utc"] or iso_utc()),
                        "updatedAtUtc": iso_utc(),
                    }
                    temp_path = path.with_suffix(f".tmp.{os.getpid()}")
                    temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
                    os.replace(temp_path, path)
                    self._connection.commit()
                    return
                except sqlite3.OperationalError as exc:
                    self._connection.rollback()
                    last_error = exc
                    if "locked" not in str(exc).lower() and "busy" not in str(exc).lower():
                        raise
                    if attempt < 4:
                        time.sleep(delay)
                except Exception:
                    self._connection.rollback()
                    raise
        if last_error:
            raise last_error

    def rebuild_from_account_json(self) -> dict[str, int]:
        """Rebuild a fresh registry index from per-account whitelist metadata.

        This never deletes or overwrites a damaged registry automatically. The caller
        must first preserve/rename the damaged registry and create a fresh one.
        """
        summary = {"files": 0, "stores": 0, "aliases": 0, "bindings": 0, "invalid": 0}
        now = iso_utc()
        with self._lock:
            self._connection.execute("BEGIN IMMEDIATE")
            try:
                for path in sorted(self.accounts_root.glob("acct_*/account.json")):
                    summary["files"] += 1
                    try:
                        data = json.loads(path.read_text(encoding="utf-8"))
                        store_id = normalize_identifier(data.get("storeId"), max_length=80)
                        tenant_id = normalize_identifier(data.get("tenantId"))
                        platform = normalize_platform(data.get("platform"))
                        display_name = normalize_identifier(data.get("displayName"), max_length=256)
                        auth_uids = [normalize_identifier(item) for item in data.get("authUids", []) if normalize_identifier(item)]
                        auth_ids = [normalize_identifier(item) for item in data.get("authIds", []) if normalize_identifier(item)]
                        current_uid = normalize_identifier(data.get("currentAuthUid") or data.get("authUid"))
                        current_auth_id = normalize_identifier(data.get("currentAuthId") or data.get("authId"))
                        if current_uid and current_uid not in auth_uids:
                            auth_uids.append(current_uid)
                        if current_auth_id and current_auth_id not in auth_ids:
                            auth_ids.append(current_auth_id)
                        robot_ids = [normalize_identifier(item) for item in data.get("robotIds", []) if normalize_identifier(item)]
                        if not store_id.startswith("acct_") or not tenant_id or not platform:
                            raise ValueError("invalid account.json identity")
                    except Exception:
                        summary["invalid"] += 1
                        continue
                    canonical_uid = auth_uids[-1] if auth_uids else ""
                    self._connection.execute(
                        "INSERT INTO account_stores(store_id, tenant_id, platform, canonical_auth_uid, display_name, created_at_utc, updated_at_utc) "
                        "VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(store_id) DO NOTHING",
                        (store_id, tenant_id, platform, canonical_uid, display_name, now, now),
                    )
                    summary["stores"] += 1
                    for alias_type, values in (("auth_uid", auth_uids), ("auth_id", auth_ids)):
                        for value in values:
                            existing = self._lookup_alias(alias_type, tenant_id, platform, value)
                            if not existing:
                                self._bind_alias(alias_type, tenant_id, platform, value, store_id, now)
                                summary["aliases"] += 1
                    for robot_id in robot_ids:
                        current = self._lookup_current_robot_store(tenant_id, platform, robot_id)
                        if not current:
                            self._bind_robot(tenant_id, platform, robot_id, store_id, auth_ids[-1] if auth_ids else "", canonical_uid, now)
                            summary["bindings"] += 1
                self._connection.commit()
            except Exception:
                self._connection.rollback()
                raise
        return summary

    def close(self) -> None:
        with self._lock:
            try:
                self._connection.commit()
            finally:
                self._connection.close()
