"""Static/security contract tests, not a substitute for Docker acceptance."""
import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result
validator = module("validator", ROOT / "deploy/scripts/validate-config.py")
archive = module("archive", ROOT / "deploy/scripts/verify-media-archive.py")

class PackageContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = yaml.safe_load((ROOT / "deploy/compose.production.yml").read_text())
    def test_only_edge_publishes_ports(self):
        services = self.config["services"]
        self.assertEqual([n for n, s in services.items() if s.get("ports")], ["proxy"])
        self.assertEqual(services["proxy"]["ports"], ["80:80", "443:443"])
    def test_external_service_images_are_digest_locked(self):
        for name in ["postgres", "clamav", "proxy"]:
            self.assertRegex(self.config["services"][name]["image"], r"@sha256:[a-f0-9]{64}$")
        self.assertIn("postgres:17-bookworm@", self.config["services"]["postgres"]["image"])
    def test_explicit_persistent_mounts_and_quarantine(self):
        mounts = self.config["services"]["backend"]["volumes"]
        for target in ["/var/lib/alageum/public", "/var/lib/alageum/private-quarantine"]:
            mount = next(m for m in mounts if m["target"] == target)
            self.assertEqual(mount["type"], "bind")
            self.assertFalse(mount["bind"]["create_host_path"])
        self.assertEqual(self.config["services"]["storage"]["network_mode"], "none")
    def test_production_and_database_tls_are_mandatory(self):
        env = self.config["services"]["backend"]["environment"]
        self.assertEqual(env["APP_ENV"], "production")
        self.assertEqual(env["DATABASE_SSL"], "true")
        self.assertEqual(env["NODE_EXTRA_CA_CERTS"], "/run/database-ca/ca.crt")
        for name in ["ALAGEUM_SEED_DEMO", "ALAGEUM_IMPORT_CATALOG", "ALAGEUM_EDS_ENABLED", "ALAGEUM_GOOGLE_ENABLED"]:
            self.assertEqual(env[name], "0")
    def test_fixed_proxy_scanner_and_tls_database_network(self):
        services = self.config["services"]
        backend = services["backend"]["environment"]
        self.assertEqual(backend["ALAGEUM_TRUSTED_PROXY_IPS"], services["proxy"]["networks"]["app"]["ipv4_address"])
        self.assertEqual(backend["ALAGEUM_MEDIA_CLAMAV_HOST"], services["clamav"]["networks"]["scanner"]["ipv4_address"])
        self.assertTrue(self.config["networks"]["database"]["internal"])
        hba = (ROOT / "deploy/postgres/pg_hba.conf").read_text()
        self.assertIn("172.30.46.3/32", hba)
        self.assertIn("hostssl", hba)
        self.assertNotIn("0.0.0.0/0        trust", hba)
    def test_connected_frontend_and_no_backend_build_credentials(self):
        front = self.config["services"]["frontend"]
        self.assertEqual(front["build"]["args"]["ALAGEUM_PUBLIC_ONLY"], "0")
        self.assertEqual(front["build"]["args"]["NEXT_PUBLIC_API_URL"], "/api/v1")
        self.assertEqual(front["environment"]["API_INTERNAL_BASE_URL"], "http://backend:8000/api/v1")
        self.assertNotIn("secrets", self.config["services"]["backend"]["build"])
        docker = (ROOT / "backend-node/Dockerfile").read_text()
        runtime = docker.split(" AS runtime", 1)[1]
        self.assertIn("APP_ENV=production", runtime)
        self.assertIn('"scripts/start-container.js"', runtime)
        self.assertNotIn("example-secret", runtime)
        self.assertNotIn(". /run/secrets", docker)
    def test_no_public_first_admin_takeover_and_catalog_route_preserved(self):
        proxy = (ROOT / "deploy/nginx/default.conf.template").read_text()
        self.assertIn("location = /admin/register-admin { return 404; }", proxy)
        self.assertIn("location ^~ /admin/register-admin/ { return 404; }", proxy)
        self.assertIn("location = /admin/catalog { proxy_pass $frontend; }", proxy)
        self.assertIn("location ^~ /admin/catalog/ { proxy_pass $frontend; }", proxy)
        self.assertIn("ssl_reject_handshake on", proxy)
    def test_proxy_replaces_untrusted_forwarded_headers(self):
        common = (ROOT / "deploy/nginx/proxy-common.conf").read_text()
        self.assertIn("X-Forwarded-For $remote_addr", common)
        self.assertIn("X-Forwarded-Proto $scheme", common)
        self.assertIn('Forwarded ""', common)
        self.assertNotIn("$proxy_add_x_forwarded_for", common)
    def test_restore_is_empty_target_and_leaves_application_stopped(self):
        restore = (ROOT / "deploy/scripts/restore.sh").read_text()
        self.assertNotIn("dropdb", restore)
        self.assertNotIn("--clean", restore)
        self.assertNotRegex(restore, r"(?m)^\s*rm\s")
        self.assertIn("--restore-empty-target", restore)
        self.assertIn("--single-transaction", restore)
        self.assertIn("--role=alageum_app", restore)
        self.assertIn("pg_proc", restore)
        self.assertNotIn("up -d backend", restore)
        self.assertIn("tar --compare", restore)

class ConfigurationChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        env = {"APP_ENV":"production", "NODE_ENV":"production", "DATABASE_SSL":"true",
               "ALAGEUM_TRUSTED_PROXY_IPS":"172.30.44.2", "ALAGEUM_MEDIA_CLAMAV_HOST":"172.30.45.2",
               "ALAGEUM_MEDIA_PUBLIC_ROOT":"/var/lib/alageum/public", "ALAGEUM_MEDIA_QUARANTINE_DIR":"/var/lib/alageum/private-quarantine",
               "ALAGEUM_SEED_DEMO":"0", "ALAGEUM_IMPORT_CATALOG":"0", "ALAGEUM_EDS_ENABLED":"0",
               "ALAGEUM_BROWSER_ORIGIN":"https://site.example.test", "CORS_ORIGINS":"https://site.example.test"}
        self.config = {"services":{name:{"image":"fixture@sha256:"+"a"*64} for name in ["postgres","clamav","backend","frontend","proxy","storage"]}}
        self.config["services"]["backend"]["environment"] = env
        self.config["services"]["proxy"]["environment"] = {"ALAGEUM_HOSTNAME":"site.example.test"}
    def test_valid_configuration(self): self.assertEqual(validator.inspect(self.config), [])
    def test_public_database_rejected(self):
        self.config["services"]["postgres"]["ports"] = [{"target":5432}]
        self.assertIn("postgres_must_not_publish_ports", validator.inspect(self.config))
    def test_tls_downgrade_rejected(self):
        self.config["services"]["backend"]["environment"]["DATABASE_SSL"] = "false"
        self.assertIn("backend_database_ssl_mismatch", validator.inspect(self.config))
    def test_nginx_hostname_injection_rejected(self):
        self.config["services"]["proxy"]["environment"]["ALAGEUM_HOSTNAME"] = 'site.test; include /secret;'
        self.assertIn("public_dns_hostname_required", validator.inspect(self.config))
    def test_unpinned_image_rejected(self):
        self.config["services"]["postgres"]["image"] = "postgres:latest"
        self.assertIn("postgres_image_digest_required", validator.inspect(self.config))
    def test_missing_mount_rejected(self):
        self.config["services"]["backend"]["volumes"] = [{"type":"bind","source":str(self.root/'missing')}]
        self.assertIn("backend_bind_source_missing_or_unsafe", validator.inspect(self.config))
    def test_readable_secret_rejected(self):
        secret = self.root/'password';secret.write_text("synthetic-test-only");secret.chmod(0o644)
        self.config["secrets"] = {"password":{"file":str(secret)}}
        self.assertIn("secret_file_must_be_private", validator.inspect(self.config))
        secret.chmod(0o400)
        self.assertEqual(validator.inspect(self.config), [])

class ArchiveChecks(unittest.TestCase):
    def make(self, extra=None, roots=True):
        temp = tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        path = pathlib.Path(temp.name)/'media.tar.gz'
        entries = [("public", tarfile.DIRTYPE, 0o755), ("public/uploads", tarfile.DIRTYPE, 0o755), ("private-quarantine", tarfile.DIRTYPE, 0o700)] if roots else []
        if extra: entries.extend(extra)
        with tarfile.open(path,"w:gz") as tar:
            for name, kind, mode in entries:
                item=tarfile.TarInfo(name);item.type=kind;item.mode=mode;item.linkname="/etc/passwd" if kind in [tarfile.SYMTYPE,tarfile.LNKTYPE] else ""
                tar.addfile(item,io.BytesIO(b""))
        return path
    def test_safe_archive(self):
        self.assertTrue(archive.verify(self.make([("public/uploads/image.png",tarfile.REGTYPE,0o644),("private-quarantine/request-safe",tarfile.DIRTYPE,0o700)])))
    def test_path_traversal(self):
        with self.assertRaises(ValueError): archive.verify(self.make([("public/uploads/../../../escape",tarfile.REGTYPE,0o644)]))
    def test_links_devices_and_world_writable(self):
        for kind, mode in [(tarfile.SYMTYPE,0o644),(tarfile.LNKTYPE,0o644),(tarfile.FIFOTYPE,0o644),(tarfile.REGTYPE,0o666),(tarfile.REGTYPE,0o4755)]:
            with self.subTest(kind=kind,mode=mode), self.assertRaises(ValueError): archive.verify(self.make([("public/uploads/bad",kind,mode)]))
    def test_unexpected_public_content(self):
        with self.assertRaises(ValueError): archive.verify(self.make([("public/backend.env",tarfile.REGTYPE,0o600)]))
    def test_nested_uploads_refused(self):
        with self.assertRaises(ValueError): archive.verify(self.make([("public/uploads/nested",tarfile.DIRTYPE,0o755)]))
    def test_missing_roots_refused(self):
        with self.assertRaises(ValueError): archive.verify(self.make(roots=False))
    def test_duplicate_entries_refused(self):
        with self.assertRaises(ValueError): archive.verify(self.make([("public",tarfile.DIRTYPE,0o755)]))
    def test_archive_root_file_refused(self):
        with self.assertRaises(ValueError): archive.verify(self.make([("public",tarfile.REGTYPE,0o644),("public/uploads",tarfile.DIRTYPE,0o755),("private-quarantine",tarfile.DIRTYPE,0o700)],roots=False))


class ShellWorkflowChecks(unittest.TestCase):
    """Run the real shell scripts against a deterministic fake Docker CLI.

    This verifies orchestration/refusal behavior; it is not a Docker/PG proof.
    """
    def setUp(self):
        import os
        self.temp = tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.bin = self.root/'bin';self.bin.mkdir()
        self.log = self.root/'calls.jsonl'
        self.env_file = self.root/'stack.env';self.env_file.write_text('')
        self.backups = self.root/'backups';self.backups.mkdir()
        archive_path = self.root/'media.tar.gz'
        with tarfile.open(archive_path,'w:gz') as tar:
            for name, mode in [('public',0o755),('public/uploads',0o755),('private-quarantine',0o700)]:
                item=tarfile.TarInfo(name);item.type=tarfile.DIRTYPE;item.mode=mode;tar.addfile(item)
        template = ConfigurationChecks();template.setUp()
        self.addCleanup(template.temp.cleanup)
        import json
        config_path = self.root/'config.json';config_path.write_text(json.dumps(template.config))
        fake = self.bin/'docker'
        fake.write_text('''#!/usr/bin/env python3
import json,os,pathlib,sys
args=sys.argv[1:]
with open(os.environ['MOCK_LOG'],'a') as f: f.write(json.dumps(args)+'\\n')
if 'config' in args: print(pathlib.Path(os.environ['MOCK_CONFIG']).read_text())
elif 'ps' in args: print(os.environ.get('MOCK_RUNNING',''))
elif any('pg_dump ' in a for a in args):
 if os.environ.get('MOCK_DUMP_FAIL')=='1': sys.exit(7)
 sys.stdout.write('synthetic-database-dump')
elif any('pg_restore' in a for a in args): sys.stdin.buffer.read()
elif 'psql' in args: print(os.environ.get('MOCK_COUNT','0'))
elif 'images' in args: print('[{"Repository":"alageum-backend","Tag":"test"}]')
elif 'run' in args and 'tar' in args:
 if '--create' in args: sys.stdout.buffer.write(pathlib.Path(os.environ['MOCK_ARCHIVE']).read_bytes())
 else: sys.stdin.buffer.read()
elif 'run' in args and 'node' in args:
 if os.environ.get('MOCK_MEDIA_NONEMPTY')=='1': sys.exit(1)
elif not any(x in args for x in ['stop','start','up']):
 print('Unexpected mock command',file=sys.stderr);sys.exit(99)
''')
        fake.chmod(0o755)
        self.env = {**os.environ,'PATH':str(self.bin)+os.pathsep+os.environ['PATH'],
                    'MOCK_LOG':str(self.log),'MOCK_CONFIG':str(config_path),'MOCK_ARCHIVE':str(archive_path),
                    'MOCK_RUNNING':'postgres\nbackend\nfrontend\nproxy'}
    def call(self, script, *args):
        import subprocess
        return subprocess.run(['bash',str(ROOT/'deploy/scripts'/script),str(self.env_file),*map(str,args)],env=self.env,capture_output=True,text=True)
    def calls(self):
        import json
        return [json.loads(line) for line in self.log.read_text().splitlines()]
    def backup(self):
        result=self.call('backup.sh',self.backups)
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        paths=list(self.backups.glob('alageum-*'));self.assertEqual(len(paths),1)
        return paths[0]
    def test_paired_snapshot_and_original_services_resumed(self):
        backup=self.backup()
        self.assertTrue((backup/'SHA256SUMS').is_file())
        calls=self.calls()
        self.assertTrue(any('stop' in c and 'backend' in c for c in calls))
        self.assertTrue(any('start' in c and all(s in c for s in ['backend','frontend','proxy']) for c in calls))
    def test_failed_dump_still_resumes_original_services(self):
        self.env['MOCK_DUMP_FAIL']='1'
        result=self.call('backup.sh',self.backups)
        self.assertEqual(result.returncode,7,result.stdout+result.stderr)
        self.assertTrue(any('start' in c and 'backend' in c for c in self.calls()))
        self.assertEqual(list(self.backups.glob('alageum-*')),[])
    def test_empty_target_restore_does_not_start_application(self):
        backup=self.backup();self.log.write_text('');self.env['MOCK_RUNNING']='postgres'
        result=self.call('restore.sh',backup,'--restore-empty-target')
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        calls=self.calls()
        self.assertTrue(any(any('--single-transaction' in x for x in c) for c in calls))
        self.assertFalse(any('start' in c or ('up' in c and 'backend' in c) for c in calls))
    def test_nonempty_target_refused_before_restore(self):
        backup=self.backup();self.log.write_text('');self.env['MOCK_RUNNING']='postgres';self.env['MOCK_COUNT']='1'
        result=self.call('restore.sh',backup,'--restore-empty-target')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('database is not empty',result.stderr)
        self.assertFalse(any(any('--single-transaction' in x for x in c) for c in self.calls()))
    def test_corrupt_backup_refused_before_service_start(self):
        backup=self.backup();(backup/'database.dump').write_bytes(b'changed')
        self.log.write_text('');self.env['MOCK_RUNNING']='postgres'
        result=self.call('restore.sh',backup,'--restore-empty-target')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('checksum mismatch',result.stderr)
        self.assertFalse(any('up' in c or 'run' in c or 'exec' in c for c in self.calls()))

if __name__ == '__main__': unittest.main()
