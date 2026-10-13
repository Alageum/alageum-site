#!/usr/bin/env python3
"""Test-only, isolated full legacy ASGI/ORM/PostgreSQL reference.

Run from an environment already provisioned with requirements-dev.lock:
    python tests/reference/run_generic_quote_reference.py --postgres-bin /path/to/bin

No pytest/conftest, inherited DB URL, package installation, or existing cluster is used.
--verify-only is a stdlib-only source/AST check, NOT endpoint execution.
"""

import argparse
import ast
import asyncio
import hashlib
import importlib.metadata
import json
import os
import platform
import re
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[1]
REPO = BACKEND.parent
MANIFEST = json.loads((HERE / "generic_quote_manifest.json").read_text())
DATABASE = "generic_quote_reference_test"
PORT = 39203


class ReferenceFailure(RuntimeError):
    """Only fixed, sanitized harness diagnostics belong in this exception."""


class ReferenceInterrupted(BaseException):
    """A handled process interruption; no credentials or command text are attached."""


def require(condition, message):
    if not condition:
        raise ReferenceFailure(message)


def provenance(runtime=False):
    for name, expected in MANIFEST["source_sha256"].items():
        require(hashlib.sha256((REPO / name).read_bytes()).hexdigest() == expected,
                f"Frozen source differs: {name}")
    for path in HERE.glob("*generic_quote*.py"):
        ast.parse(path.read_text(), filename=str(path))
    report = dict(MANIFEST)
    report["harness_sha256"] = {
        p.name: hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(HERE.glob("*generic_quote*")) if p.is_file()
    }
    if runtime:
        require(sys.version_info[:2] == (3, 12), "Reference requires Python 3.12")
        require(sys.get_int_max_str_digits() == 4300, "Python integer guard must remain 4300")
        installed = {name: importlib.metadata.version(name)
                     for name in MANIFEST["locked_python_packages"]}
        require(installed == MANIFEST["locked_python_packages"],
                "Installed distributions differ from the frozen dev lock")
        report.update(python=platform.python_version(), installed_python_packages=installed)
    return report


def command(args, env, timeout=30, cwd=BACKEND):
    # Never print commands/environment/stderr: DB URLs and ephemeral passwords are private.
    result = subprocess.run(args, env=env, cwd=cwd, capture_output=True,
                            timeout=timeout, check=False)
    require(result.returncode == 0, f"Reference subprocess failed: {Path(args[0]).name}")
    return result.stdout.decode()


def stop_case_process(process, lifecycle, grace=5):
    """Verify the case child is reaped before any cluster shutdown or fixture removal."""
    if process is None:
        lifecycle["case_process_started"] = False
        return
    lifecycle["case_process_started"] = True
    if process.poll() is None:
        lifecycle["case_terminated_for_cleanup"] = True
        process.terminate()
        try:
            process.wait(timeout=grace)
        except subprocess.TimeoutExpired:
            lifecycle["case_killed_after_grace"] = True
            process.kill()
            process.wait(timeout=grace)
    require(process.poll() is not None, "Case process has not exited; retaining owned fixture")
    lifecycle["case_process_exit_verified"] = True
    lifecycle["case_exit_code"] = process.returncode


async def create_database(owner_password, app_password, lifecycle):
    import asyncpg

    owner = await asyncpg.connect(host="127.0.0.1", port=PORT, user="reference_owner",
                                 password=owner_password, database="postgres", ssl=False)
    try:
        require(await owner.fetchval("SELECT current_user") == "reference_owner",
                "Unexpected cluster owner")
        require(not await owner.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", DATABASE),
                "Refusing an existing reference database")
        # Random token_hex credentials contain no SQL metacharacters.
        require(re.fullmatch(r"[a-f0-9]{64}", app_password), "Unexpected password encoding")
        await owner.execute(
            "CREATE ROLE reference_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE "
            f"NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD '{app_password}'"
        )
        await owner.execute(f'CREATE DATABASE "{DATABASE}" OWNER reference_owner')
        await owner.execute(f'REVOKE ALL ON DATABASE "{DATABASE}" FROM PUBLIC')
        await owner.execute(f'GRANT CONNECT ON DATABASE "{DATABASE}" TO reference_app')
    finally:
        await owner.close()
    owner = await asyncpg.connect(host="127.0.0.1", port=PORT, user="reference_owner",
                                 password=owner_password, database=DATABASE, ssl=False)
    try:
        identity = await owner.fetchrow(
            "SELECT current_database() AS db, current_user AS role, "
            "host(inet_server_addr()) AS address, inet_server_port() AS port, "
            "current_setting('server_version') AS version"
        )
        require(dict(identity) | {"version": None} == {
            "db": DATABASE, "role": "reference_owner", "address": "127.0.0.1",
            "port": PORT, "version": None}, "Unexpected database identity")
        count = await owner.fetchval(
            "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
            "WHERE n.nspname NOT IN ('pg_catalog','information_schema') "
            "AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')"
        )
        require(count == 0, "Refusing nonempty database before Alembic DDL")
        await owner.execute("REVOKE ALL ON SCHEMA public FROM PUBLIC")
        lifecycle.update(identity=dict(identity), user_relations_before_ddl=count)
    finally:
        await owner.close()


async def grant_runtime(owner_password, lifecycle):
    import asyncpg

    owner = await asyncpg.connect(host="127.0.0.1", port=PORT, user="reference_owner",
                                 password=owner_password, database=DATABASE, ssl=False)
    try:
        revision = await owner.fetchval("SELECT version_num FROM alembic_version")
        require(revision == MANIFEST["alembic_head"], "Unexpected Alembic revision")
        await owner.execute("GRANT USAGE ON SCHEMA public TO reference_app")
        tables = (
            "users,organizations,memberships,roles,permissions,role_permissions,"
            "catalog_products,catalog_categories,product_attribute_values,"
            "product_attribute_definitions,"
            "quote_requests,quote_request_items,audit_events,refresh_sessions,integration_jobs"
        )
        await owner.execute(f"GRANT SELECT ON {tables} TO reference_app")
        await owner.execute("GRANT INSERT ON quote_requests,quote_request_items,"
                            "audit_events,refresh_sessions TO reference_app")
        # Actual lifespan and catalog product FOR UPDATE paths need UPDATE privilege.
        await owner.execute("GRANT UPDATE ON integration_jobs,"
                            "catalog_products,catalog_categories TO reference_app")
        lifecycle.update(alembic_head=revision,
                         runtime_role="reference_app: non-owner, no DDL, bounded table grants")
    finally:
        await owner.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--postgres-bin", type=Path)
    parser.add_argument("--output", type=Path, default=REPO / "generic-quote-reference-report.json")
    args = parser.parse_args()
    evidence = provenance(runtime=not args.verify_only)
    if args.verify_only:
        print(json.dumps({"status": "source-and-AST-verified", "runtime_executed": False,
                          "frozen_revision": MANIFEST["frozen_revision"],
                          "source_count": len(MANIFEST["source_sha256"])}))
        return
    require(os.geteuid() != 0, "initdb must run as an unprivileged CI user")
    pg = args.postgres_bin
    if pg is None:
        config = shutil.which("pg_config")
        require(config is not None, "Supply --postgres-bin from the CI PostgreSQL installation")
        pg = Path(subprocess.check_output([config, "--bindir"], text=True).strip())
    require(all((pg / name).is_file() for name in ("initdb", "pg_ctl", "postgres")),
            "PostgreSQL executables are missing")
    require(not args.output.exists(), "Refusing to overwrite a previous reference report")
    # A new private cluster is the ownership proof. A database suffix alone is insufficient.
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", PORT))
    env = {"PATH": os.defpath, "LANG": "C.UTF-8", "PYTHONPATH": str(BACKEND),
           "PYTHONUNBUFFERED": "1", "APP_ENV": "test", "APP_DEBUG": "false"}
    lifecycle = {"fixture": "new private loopback cluster; no reused database",
                 "transport": "actual in-process ASGI + ORM + PostgreSQL; no deployed HTTP server",
                 "post_setup_timeout_seconds": 180, "max_quote_endpoint_requests": 100,
                 "inherited_database_settings": False}
    evidence["lifecycle"] = lifecycle
    evidence["status"] = "failed"
    started = False
    cases_verified = False
    cleanup_started = False
    case_process = None
    root = None
    case_report = None

    def interrupted(signum, _frame):
        lifecycle["interruption_signal"] = signal.Signals(signum).name
        lifecycle["interruption_phase"] = "cleanup" if cleanup_started else lifecycle.get("stage")
        evidence["status"] = "failed"
        if not cleanup_started:
            raise ReferenceInterrupted

    previous_handlers = {number: signal.signal(number, interrupted)
                         for number in (signal.SIGINT, signal.SIGTERM)}
    try:
        lifecycle["stage"] = "create-owned-fixture"
        previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
        try:
            root = Path(tempfile.mkdtemp(prefix="generic-quote-owned-"))
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
        root.chmod(0o700)
        data = root / "data"
        case_report = root / "cases.json"
        ownership_nonce = secrets.token_hex(32)
        (root / "ownership.json").write_text(json.dumps({"nonce": ownership_nonce,
                                                        "database": DATABASE, "port": PORT}))
        owner_password, app_password = secrets.token_hex(32), secrets.token_hex(32)
        password_file = root / "init-password"
        password_file.write_text(owner_password)
        password_file.chmod(0o600)
        env.update(APP_SECRET_KEY=secrets.token_hex(32),
                   APP_LOCAL_STORAGE_PATH=str(root / "storage"))
        owner_url = (f"postgresql+asyncpg://reference_owner:{owner_password}"
                     f"@127.0.0.1:{PORT}/{DATABASE}")
        app_url = (f"postgresql+asyncpg://reference_app:{app_password}"
                   f"@127.0.0.1:{PORT}/{DATABASE}")
        lifecycle["stage"] = "initialize-private-cluster"
        lifecycle["postgres_binary_sha256"] = {
            name: hashlib.sha256((pg / name).read_bytes()).hexdigest()
            for name in ("initdb", "pg_ctl", "postgres")
        }
        command([str(pg / "initdb"), "-D", str(data), "--no-locale", "--encoding=UTF8",
                 "--auth-local=trust", "--auth-host=scram-sha-256", "--wal-segsize=1",
                 "-U", "reference_owner", "--pwfile", str(password_file)], env)
        password_file.unlink()
        # Socket access is disabled; only password-authenticated IPv4 loopback is exposed.
        options = (f"-h 127.0.0.1 -p {PORT} -k '' -c shared_buffers=8MB "
                   "-c max_wal_size=16MB -c min_wal_size=2MB -c wal_level=minimal "
                   "-c max_wal_senders=0 -c max_connections=15 -c statement_timeout=5000 "
                   "-c lock_timeout=3000 -c idle_in_transaction_session_timeout=10000 "
                   "-c log_min_messages=fatal -c log_min_error_statement=panic "
                   "-c log_error_verbosity=terse")
        command([str(pg / "pg_ctl"), "-D", str(data), "-l", str(root / "server.log"),
                 "-o", options, "-w", "start"], env)
        started = True
        lifecycle["stage"] = "verify-fresh-database"
        asyncio.run(create_database(owner_password, app_password, lifecycle))
        # Settings reads no inherited APP_* values and cannot pick up repository dotenv files.
        require(not (BACKEND / ".env").exists() and not (REPO / ".env").exists(),
                "Refusing repository dotenv configuration")
        lifecycle["stage"] = "alembic-upgrade"
        command([sys.executable, "-m", "alembic", "upgrade", "head"],
                {**env, "APP_DATABASE_URL": owner_url}, timeout=60)
        lifecycle["stage"] = "grant-isolated-runtime-role"
        asyncio.run(grant_runtime(owner_password, lifecycle))
        started_cases = time.monotonic()
        lifecycle["stage"] = "actual-application-cases"
        # Defer handled signals across spawn so cleanup always owns the child handle.
        previous_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGINT, signal.SIGTERM})
        try:
            case_process = subprocess.Popen(
                [sys.executable, str(HERE / "generic_quote_cases.py"), str(case_report)],
                cwd=BACKEND,
                env={**env, "APP_DATABASE_URL": app_url, "REFERENCE_OWNER_URL": owner_url,
                     "REFERENCE_OWNED_ROOT": str(root),
                     "REFERENCE_OWNERSHIP_NONCE": ownership_nonce},
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True,
            )
        finally:
            signal.pthread_sigmask(signal.SIG_SETMASK, previous_mask)
        case_process.wait(timeout=180)
        lifecycle["post_setup_seconds"] = round(time.monotonic() - started_cases, 3)
        require(case_report.exists(), "Case runner failed before writing sanitized results")
        evidence["cases"] = json.loads(case_report.read_text())
        require(case_process.returncode == 0 and evidence["cases"]["status"] == "passed",
                "Reference cases failed; inspect sanitized case records")
        lifecycle["stage"] = "verified"
        cases_verified = True
    except BaseException as exc:
        # Exception strings/tracebacks can contain connection URLs and SQL parameters.
        evidence["failure_type"] = type(exc).__name__
        if isinstance(exc, ReferenceFailure):
            evidence["failed_check"] = str(exc)
    finally:
        cleanup_started = True
        try:
            # A timeout/interruption never relies on the child's finally block.
            stop_case_process(case_process, lifecycle)
            if case_report is not None and case_report.exists() and "cases" not in evidence:
                evidence["cases"] = json.loads(case_report.read_text())
            if root is not None:
                data = root / "data"
                if started or (data / "postmaster.pid").exists():
                    command([str(pg / "pg_ctl"), "-D", str(data),
                             "-m", "fast", "-w", "stop"], env)
                require(not (data / "postmaster.pid").exists(), "Owned server did not stop")
                with socket.socket() as probe:
                    probe.settimeout(1)
                    require(probe.connect_ex(("127.0.0.1", PORT)) != 0, "Owned port remains open")
                lifecycle["shutdown_verified"] = True
                lifecycle["fixture_bytes"] = sum(p.stat().st_size for p in root.rglob("*")
                                                  if p.is_file())
                require(root.name.startswith("generic-quote-owned-")
                        and root.parent == Path(tempfile.gettempdir()),
                        "Unexpected cleanup target")
                shutil.rmtree(root)
                lifecycle["owned_fixture_removed"] = True
        except BaseException as exc:
            evidence["status"] = "failed"
            lifecycle["cleanup_failure_type"] = type(exc).__name__
        if (cases_verified and lifecycle.get("owned_fixture_removed")
                and lifecycle.get("case_process_exit_verified")
                and "interruption_signal" not in lifecycle):
            evidence["status"] = "passed"
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary_report = args.output.with_suffix(args.output.suffix + ".partial")
        temporary_report.write_text(json.dumps(evidence, indent=2, sort_keys=True,
                                              ensure_ascii=True) + "\n")
        temporary_report.replace(args.output)
        for number, handler in previous_handlers.items():
            signal.signal(number, handler)
    print(json.dumps({"status": evidence["status"], "report": str(args.output),
                      "shutdown_verified": lifecycle.get("shutdown_verified", False)}))
    if evidence["status"] != "passed":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
