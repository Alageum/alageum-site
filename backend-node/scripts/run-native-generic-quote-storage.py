#!/usr/bin/env python3
"""Run the native quote-storage proof in one new, bounded PostgreSQL cluster.

Uses installed Node 24, locked dependencies and PG_BIN. No build, installation,
external database, browser, production mode, or existing-store upgrade is used.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import stat
import subprocess
import tempfile
import time

SOURCE = Path(__file__).resolve().parents[1]
CAP = 180 * 1024 * 1024
PORT = 39317
DATABASE = "alageum_strapi_generic_quote_storage_test"
OWNER = "native_quote_storage_owner"


def bytes_used(root):
    total = 0
    for path in root.rglob("*"):
        try:
            observed = path.lstat()
        except FileNotFoundError:
            # PostgreSQL can remove transient files between enumeration and stat.
            continue
        if stat.S_ISREG(observed.st_mode):
            total += observed.st_size
    return total


def port_closed(port):
    with socket.socket() as connection:
        connection.settimeout(1)
        return connection.connect_ex(("127.0.0.1", port)) != 0


def main():
    def interrupted(_signum, _frame):
        raise InterruptedError("Native proof interrupted")

    signal.signal(signal.SIGTERM, interrupted)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence-dir", type=Path, required=True,
                        help="New directory for sanitized, reproducible proof records")
    parser.add_argument("--postgres-major", type=int, choices=(16, 17), default=17,
                        help="Explicit installed PostgreSQL major; defaults to 17")
    args = parser.parse_args()
    evidence = args.evidence_dir.resolve()
    assert not evidence.exists(), "Refuse to overwrite any previous proof attempt"
    node = shutil.which("node")
    assert node, "Installed Node 24 is required"
    pg = Path(os.environ["PG_BIN"]).resolve()
    for executable in ("initdb", "pg_ctl", "psql", "createdb"):
        assert (pg / executable).is_file(), "PG_BIN must identify installed PostgreSQL binaries"
    env = {"PATH": f"{Path(node).parent}:/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8"}
    if os.environ.get("LD_LIBRARY_PATH"):
        env["LD_LIBRARY_PATH"] = os.environ["LD_LIBRARY_PATH"]

    def run(command, timeout=30):
        return subprocess.run([str(part) for part in command], env=env, text=True,
                              capture_output=True, check=True, timeout=timeout)

    assert run([node, "--version"]).stdout.startswith("v24."), "Node 24 is required"
    assert f" {args.postgres_major}." in run([pg / "postgres", "--version"]).stdout, \
        "PG_BIN must match the explicitly declared PostgreSQL major"
    processes = run(["ps", "-eo", "comm="]).stdout.splitlines()
    assert not any(name.strip() in ("postgres", "postmaster") for name in processes), \
        "Refuse a concurrent pre-existing PostgreSQL cluster"
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", PORT))
    evidence.mkdir(parents=True, mode=0o700)
    fixture = Path(tempfile.mkdtemp(prefix="native-quote-storage-owned-", dir=evidence.parent)).resolve()
    data, appdir, tmpdir = fixture / "pgdata", fixture / "app", fixture / "tmp"
    lifecycle = {"status": "running", "port": PORT, "database": DATABASE,
                 "ownership": "new task-created synthetic fixture only", "disk_cap_bytes": CAP,
                 "max_bytes_observed": 0, "started": False, "declared_postgres_major": args.postgres_major}
    child = None
    started = False
    phase = "copy-owned-app"
    deadline = time.monotonic() + 1200
    protected = [SOURCE / "package.json", SOURCE / "package-lock.json",
                 Path(__file__).resolve(), SOURCE / "tests/native-generic-quote-storage.cjs",
                 SOURCE / "node_modules/@strapi/strapi/package.json",
                 SOURCE / "node_modules/@strapi/core/dist/Strapi.js"]
    protected += [p for group in ("src", "config", "data/catalog-import")
                  for p in (SOURCE / group).rglob("*") if p.is_file()]
    hashes = {str(p.relative_to(SOURCE)): hashlib.sha256(p.read_bytes()).hexdigest() for p in protected}

    def budget():
        size = bytes_used(fixture)
        lifecycle["max_bytes_observed"] = max(size, lifecycle["max_bytes_observed"])
        assert size < CAP, f"Owned fixture exceeded its 180 MiB cap: {size} bytes"
        assert time.monotonic() < deadline, "Native proof watchdog expired"

    def owned_group():
        if child is None:
            return []
        members = []
        for line in run(["ps", "-eo", "pid=,pgid=,sid=,stat="]).stdout.splitlines():
            fields = line.split()
            if len(fields) == 4 and int(fields[1]) == child.pid and int(fields[2]) == child.pid:
                members.append({"pid": int(fields[0]), "state": fields[3]})
        return members

    def stop_owned_group():
        # Descendants share this invocation's new session and process group.
        # Check them even after their supervisor has already exited.
        if child is None:
            lifecycle["owned_process_group_stopped_verified"] = True
            return
        for action, timeout in ((signal.SIGTERM, 10), (signal.SIGKILL, 5)):
            live = [p for p in owned_group() if not p["state"].startswith("Z")]
            if not live:
                break
            try:
                os.killpg(child.pid, action)
            except ProcessLookupError:
                pass  # It exited between the inventory and the signal; verify below.
            until = time.monotonic() + timeout
            while time.monotonic() < until:
                if child.poll() is None:
                    child.poll()
                if not [p for p in owned_group() if not p["state"].startswith("Z")]:
                    break
                time.sleep(0.1)
        members = owned_group()
        assert not [p for p in members if not p["state"].startswith("Z")], "Owned application processes remain live"
        lifecycle["owned_process_group_stopped_verified"] = True
        lifecycle["exited_group_members_awaiting_reaping"] = len(members)
        if child.poll() is not None:
            child.communicate(timeout=5)

    try:
        appdir.mkdir()
        tmpdir.mkdir(mode=0o700)
        for name in ("config", "src", "data", "public", "scripts"):
            shutil.copytree(SOURCE / name, appdir / name, symlinks=False)
        for name in ("package.json", "package-lock.json"):
            shutil.copy2(SOURCE / name, appdir / name)
        (appdir / "node_modules").symlink_to(SOURCE / "node_modules", target_is_directory=True)
        phase = "initialize-owned-postgres"
        run([pg / "initdb", "-D", data, "--no-locale", "--encoding=UTF8", "--auth=trust",
             "--wal-segsize=1", "-U", OWNER])
        options = (f"-h 127.0.0.1 -p {PORT} -k '' -c shared_buffers=8MB "
                   "-c max_wal_size=16MB -c min_wal_size=2MB -c wal_level=minimal "
                   "-c max_wal_senders=0 -c fsync=off -c max_connections=24")
        phase = "start-owned-postgres"
        run([pg / "pg_ctl", "-D", data, "-l", fixture / "postgres.log", "-o", options, "-w", "start"])
        started = True
        lifecycle["started"] = True
        budget()
        phase = "verify-owned-postgres-identity"
        psql = [pg / "psql", "-X", "-h", "127.0.0.1", "-p", PORT, "-U", OWNER, "-d", "postgres", "-Atc"]
        identity = json.loads(run(psql + ["SELECT json_build_object('directory',current_setting('data_directory'),'host',host(inet_server_addr()),'port',inet_server_port(),'version',current_setting('server_version_num'),'owner',current_user,'system_identifier',(SELECT system_identifier::text FROM pg_control_system()))"]).stdout)
        assert Path(identity["directory"]).resolve() == data
        assert identity["host"] == "127.0.0.1" and identity["port"] == PORT
        assert identity["owner"] == OWNER and args.postgres_major * 10000 <= int(identity["version"]) < (args.postgres_major + 1) * 10000
        identity["major"] = int(identity["version"]) // 10000
        lifecycle["server_identity"] = identity | {"directory": "<owned fixture>/pgdata"}
        run([pg / "createdb", "-h", "127.0.0.1", "-p", PORT, "-U", OWNER, "--maintenance-db=postgres", DATABASE])
        childenv = env | {"DATABASE_URL": f"postgresql://{OWNER}@127.0.0.1:{PORT}/{DATABASE}",
                          "APP_ENV": "test", "NODE_ENV": "production", "HOST": "127.0.0.1", "PORT": "0",
                          "ALAGEUM_SEED_DEMO": "true", "ALAGEUM_IMPORT_CATALOG": "true",
                          "STRAPI_TELEMETRY_DISABLED": "true", "STRAPI_DISABLE_UPDATE_NOTIFICATION": "true",
                          "ENV_PATH": "/dev/null", "TMPDIR": str(tmpdir),
                          "NATIVE_QUOTE_STORAGE_PROOF": "owned-loopback-only",
                          "NATIVE_QUOTE_STORAGE_POSTGRES_MAJOR": str(args.postgres_major),
                          "NATIVE_QUOTE_STORAGE_DIRECTORY": str(data),
                          "NATIVE_QUOTE_STORAGE_SYSTEM_ID": identity["system_identifier"]}
        phase = "native-proof"
        child = subprocess.Popen([node, str(SOURCE / "tests/native-generic-quote-storage.cjs"),
                                  "supervise", str(appdir), str(evidence)], cwd=appdir,
                                 env=childenv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                 start_new_session=True)
        while child.poll() is None:
            budget()
            time.sleep(0.5)
        out, err = child.communicate()
        lifecycle["child_exit_code"] = child.returncode
        lifecycle["summary"] = out.strip()[-8000:]
        lifecycle["stderr_present"] = bool(err)
        assert child.returncode == 0, f"Native quote storage proof failed; inspect {evidence}/results.json"
        budget()
        lifecycle["status"] = "passed"
    except BaseException as error:
        lifecycle["status"] = "failed"
        lifecycle["error"] = {"phase": phase, "type": type(error).__name__}
        raise RuntimeError("Native storage proof failed; inspect its sanitized evidence") from None
    finally:
        cleanup_errors = []
        try:
            stop_owned_group()
        except BaseException as error:
            cleanup_errors.append({"phase": "stop-owned-process-group", "type": type(error).__name__})
        try:
            if started:
                run([pg / "pg_ctl", "-D", data, "-m", "fast", "-w", "stop"])
            assert not (data / "postmaster.pid").exists() and port_closed(PORT)
            lifecycle["postgres_stopped_verified"] = True
            ports = []
            for report in evidence.glob("*-native.json"):
                port = json.loads(report.read_text()).get("http_port")
                if port:
                    ports.append(port)
            assert all(port_closed(port) for port in ports), "A fixture HTTP socket remains open"
            lifecycle["http_ports_closed_verified"] = True
        except BaseException as error:
            cleanup_errors.append({"phase": "verify-postgres-and-http-stopped", "type": type(error).__name__})
        try:
            assert all(hashlib.sha256((SOURCE / rel).read_bytes()).hexdigest() == digest
                       for rel, digest in hashes.items()), "Protected source or dependency changed during proof"
            lifecycle["source_and_dependency_hashes_unchanged"] = True
            (evidence / "source-sha256.json").write_text(json.dumps(hashes, indent=2) + "\n")
        except BaseException as error:
            cleanup_errors.append({"phase": "verify-source-integrity", "type": type(error).__name__})
        try:
            assert fixture.parent == evidence.parent and fixture.name.startswith("native-quote-storage-owned-")
            assert not (data / "postmaster.pid").exists(), "Refuse removing a running cluster"
            if not cleanup_errors and all(lifecycle.get(key) for key in
                    ("owned_process_group_stopped_verified", "postgres_stopped_verified", "http_ports_closed_verified")):
                shutil.rmtree(fixture)
                lifecycle["owned_fixture_removed"] = not fixture.exists()
            else:
                lifecycle["owned_fixture_removed"] = False
                lifecycle["retained_owned_fixture"] = str(fixture)
        except BaseException as error:
            cleanup_errors.append({"phase": "remove-owned-fixture", "type": type(error).__name__})
        if cleanup_errors:
            lifecycle["status"] = "failed"
            lifecycle["cleanup_errors"] = cleanup_errors
        (evidence / "lifecycle.json").write_text(json.dumps(lifecycle, indent=2) + "\n")
        print(json.dumps(lifecycle), flush=True)
        if cleanup_errors:
            raise RuntimeError("Native proof cleanup or source-integrity verification failed")


if __name__ == "__main__":
    main()
