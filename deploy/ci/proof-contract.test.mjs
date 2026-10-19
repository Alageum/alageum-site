import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

test('push and pull request events share one costly production proof per branch', () => {
  const workflow = fs.readFileSync(path.join(here, '../../.github/workflows/self-hosted-server.yml'), 'utf8');
  assert.match(workflow, /group: self-hosted-server-\$\{\{ github\.event\.pull_request\.head\.ref \|\| github\.ref_name \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
});

test('hosted proof cannot accidentally run against an operator machine', () => {
  const result = spawnSync('bash', [path.join(here, 'run-proof.sh')], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /restricted to a GitHub-hosted/);
});
test('Compose reset acceptance honors the actual no-content logout response', () => {
  const proof = fs.readFileSync(path.join(here, 'prove-http.mjs'), 'utf8');
  assert.match(proof, /api\('\/auth\/browser-logout', \{ method: 'POST', body: \{\}, expected: 204 \}\)/);
  assert.match(proof, /return response\.text \? JSON\.parse\(response\.text\) : null;/);
});
test('production image preflight uses the unchanged admission entrypoint before starting services', () => {
  const proof = fs.readFileSync(path.join(here, 'run-proof.sh'), 'utf8');
  assert.match(proof, /stage=production_image_preflight[\s\S]*compose run --rm --no-deps backend true/);
  assert.ok(proof.indexOf('compose run --rm --no-deps backend true') < proof.indexOf('stage=start_production_compose'));
  assert.match(proof, /docker logs --tail 200[\s\S]*python3 "\$here\/summarize-failure.py"/);
});
test('failure diagnostics emit only fixed labels, never raw secrets, tokens, messages or paths', () => {
  const secret = 'private-password-do-not-retain';
  const input = `Error: EACCES permission denied /private/${secret}\n` +
    `postgresql://app:${secret}@postgres/db?token=account-token\n` +
    'Error: no pg_hba.conf entry for host secret-address\n' +
    'Native Page editor adapter verified: Strapi 5.56.0\n';
  const output = execFileSync('python3', [path.join(here, 'summarize-failure.py')], { input, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), {
    schema_version: 1, error_codes: ['EACCES'],
    categories: ['permission_denied', 'database_hba_rejected'], raw_logs_retained: false,
  });
  for (const value of [secret, 'account-token', 'secret-address', 'postgresql://', '/private/']) assert.ok(!output.includes(value));
  const empty = execFileSync('python3', [path.join(here, 'summarize-failure.py')], { input: 'successful startup', encoding: 'utf8' });
  assert.deepEqual(JSON.parse(empty).categories, []);
  const schema = execFileSync('python3', [path.join(here, 'summarize-failure.py')], {
    input: `Quote schema mismatch: quote_request_items columns; requires reviewed migration before schema sync\n${secret}`,
    encoding: 'utf8',
  });
  assert.deepEqual(JSON.parse(schema).categories, ['database_schema_rejected', 'quote_schema_rejected', 'quote_columns_rejected']);
  assert.ok(!schema.includes(secret));
});
test('production proof does not weaken production TLS or replace the stack', () => {
  const proof = ['run-proof.sh', 'prove-http.mjs', 'prove-browser.mjs', 'prove-container.cjs'].map(name => fs.readFileSync(path.join(here, name), 'utf8')).join('\n');
  assert.doesNotMatch(proof, /rejectUnauthorized:\s*false|ignoreHTTPSErrors:\s*true|NODE_TLS_REJECT_UNAUTHORIZED|ignore-certificate-errors/);
  assert.doesNotMatch(proof, /compose\.override|--env-file.*backend\.env/);
  assert.match(proof, /compose build --pull backend/);
  assert.match(proof, /compose build --pull frontend/);
  assert.match(proof, /scripts\/backup\.sh/); assert.match(proof, /scripts\/restore\.sh/);
});
test('synthetic fixture has independently signed host certificates and private credentials', () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'alageum-ci-contract.'));
  try {
    execFileSync('python3', [path.join(here, 'prepare-fixture.py'), work, 'a'.repeat(40), '1-1']);
    for (const [service, hostname] of [['postgres', 'postgres'], ['https', 'site.example.test'], ['smtp', 'smtp.example.test']]) {
      execFileSync('openssl', ['verify', '-CAfile', `${work}/ca/cert.pem`, '-verify_hostname', hostname, `${work}/tls/${service}/server.crt`]);
      assert.equal(fs.statSync(`${work}/tls/${service}/server.key`).mode & 0o077, 0);
      const wrongName = spawnSync('openssl', ['verify', '-CAfile', `${work}/ca/cert.pem`, '-verify_hostname', 'wrong.example.test', `${work}/tls/${service}/server.crt`]);
      assert.notEqual(wrongName.status, 0);
    }
    assert.equal(fs.existsSync(`${work}/ca/key.pem`), false, 'Remove the signing key after provisioning');
    const env = Object.fromEntries(fs.readFileSync(`${work}/backend.env`, 'utf8').trim().split('\n').map(line => {
      const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
    }));
    assert.equal(env.ALAGEUM_SMTP_HOST, '127.0.0.1');
    assert.match(env.ALAGEUM_MAIL_FROM, /\.test$/);
    assert.equal(fs.statSync(`${work}/backend.env`).mode & 0o077, 0);
    const secrets = [...env.APP_KEYS.split(','), ...['ADMIN_JWT_SECRET', 'API_TOKEN_SALT', 'TRANSFER_TOKEN_SALT', 'ENCRYPTION_KEY', 'ALAGEUM_JWT_SECRET'].map(key => env[key])];
    assert.equal(new Set(secrets).size, secrets.length); assert.ok(secrets.every(value => value.length >= 48));
    const rerun = spawnSync('python3', [path.join(here, 'prepare-fixture.py'), work, 'a'.repeat(40), '1-1']);
    assert.notEqual(rerun.status, 0, 'Existing fixture roots must not be overwritten');
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});
