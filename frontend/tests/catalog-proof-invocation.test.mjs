import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  evaluateProof, proofOperations, prove, runFreshProof,
} from '../../scripts/catalog/proof-invocation.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const kind = Symbol('test-only complete proof');

// Only the internal utility harness accepts a test reader/root. No production
// public guard can select this seam. Mutations are confined to disposable files.
function fixture(t, files = { 'leaf.txt': 'approved', 'clearance.json': '{"status":"approved","counts":{"rows":3}}' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-proof-invocation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, bytes) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), bytes);
  };
  for (const [file, bytes] of Object.entries(files)) write(file, bytes);
  const calls = [];
  const read = file => { calls.push(file); return fs.readFileSync(path.join(root, file)); };
  const run = (evaluate, options = {}) => runFreshProof({ root, omittedReader: true, read, inputs: [], ...options }, evaluate);
  return { root, write, calls, read, run };
}

function evaluateLeaf(context, clearance) {
  const operations = proofOperations(context);
  assert.equal(clearance.status, 'approved');
  assert.equal(operations.hash('leaf.txt'), digest('approved'));
  return clearance;
}
const leaf = context => prove(context, kind, 'approved', 'clearance.json', evaluateLeaf);

test('completed proof reuse retains every consumed path and finalizes once in deterministic order', t => {
  const f = fixture(t, { 'leaf.txt': 'approved', 'clearance.json': '{"status":"approved"}', 'scope.json': '{"files":["leaf.txt"]}' });
  let evaluations = 0;
  const evaluator = (context, clearance) => { evaluations++; return evaluateLeaf(context, clearance); };
  const result = f.run(context => {
    const operations = proofOperations(context);
    operations.json('scope.json');
    for (let index = 0; index < 20; index++) {
      const value = prove(context, kind, 'approved', 'clearance.json', evaluator);
      assert.equal(value.status, 'approved');
    }
    return 'finished';
  });
  assert.equal(result, 'finished');
  assert.equal(evaluations, 1);
  assert.deepEqual(f.calls, ['scope.json', 'clearance.json', 'leaf.txt', 'clearance.json', 'leaf.txt', 'scope.json']);
});

test('kind, mode, exact clearance bytes, fixed paths, and every caller edge remain separate obligations', t => {
  const f = fixture(t, { 'leaf.txt': 'approved', 'clearance.json': '{"status":"approved"}', 'same.json': '{"status":"approved"}', 'other.json': '{ "status": "approved" }' });
  let evaluations = 0;
  f.run(context => {
    const operations = proofOperations(context);
    const a = 'clearance.json';
    const b = 'other.json';
    const body = () => { evaluations++; return { status: 'approved' }; };
    prove(context, kind, 'candidate', a, body);
    prove(context, kind, 'approved', a, body);
    prove(context, Symbol('different kind'), 'approved', a, body);
    prove(context, kind, 'approved', b, body);
    prove(context, kind, 'approved', 'same.json', body);
    prove(context, kind, 'approved', 'clearance.json', body);
    assert.equal(evaluations, 5);
    for (const expected of [digest('approved'), 'wrong predecessor']) {
      const result = prove(context, kind, 'approved', a, body);
      assert.equal(result.status, 'approved');
      if (expected === 'wrong predecessor') assert.notEqual(operations.hash('leaf.txt'), expected);
      else assert.equal(operations.hash('leaf.txt'), expected);
    }
  });
  assert.throws(() => f.run(context => {
    leaf(context);
    evaluateProof(context, () => assert.equal(proofOperations(context).hash('leaf.txt'), 'wrong successor'));
  }), /wrong successor/);
});

test('caller roots and nested returned values retain identity and never become memo keys', t => {
  const f = fixture(t);
  const supplied = { status: 'approved', counts: { rows: 3 } };
  let evaluations = 0;
  const result = f.run(context => {
    const operations = proofOperations(context);
    for (let index = 0; index < 3; index++) {
      assert.strictEqual(evaluateProof(context, () => { evaluations++; return supplied; }), supplied);
      operations.hash('leaf.txt');
    }
    return supplied.counts;
  }, { inputs: [supplied] });
  assert.strictEqual(result, supplied.counts);
  assert.equal(evaluations, 3);
  assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt']);
  assert.equal(Object.isFrozen(supplied), false);
  assert.equal(Object.isFrozen(supplied.counts), false);
  supplied.counts.rows = 4;
  assert.equal(result.rows, 4);
});

test('bytes, fresh JSON, and memoized public results cannot mutate private state', t => {
  const f = fixture(t);
  f.run(context => {
    const operations = proofOperations(context);
    operations.bytes('leaf.txt').fill(120);
    assert.equal(operations.hash('leaf.txt'), digest('approved'));
    assert.equal(operations.bytes('leaf.txt').toString(), 'approved');
    operations.json('clearance.json').counts.rows = 99;
    assert.equal(operations.json('clearance.json').counts.rows, 3);
    const first = leaf(context);
    first.counts.rows = 100;
    const second = leaf(context);
    assert.equal(second.counts.rows, 3);
    assert.notStrictEqual(first, second);
    assert.notStrictEqual(first.counts, second.counts);
    assert.equal(Object.isFrozen(second), false);
    second.newField = true;
  });
});

test('copied reader-owned Buffer, Uint8Array, and SharedArrayBuffer backing cannot rewrite captures', t => {
  for (const storage of ['buffer', 'typed', 'shared']) {
    const f = fixture(t);
    let supplied;
    let reads = 0;
    const read = file => {
      const disk = f.read(file);
      if (++reads !== 1) return disk;
      if (storage === 'buffer') supplied = Buffer.from(disk);
      if (storage === 'typed') supplied = new Uint8Array(disk);
      if (storage === 'shared') { supplied = new Uint8Array(new SharedArrayBuffer(disk.length)); supplied.set(disk); }
      return supplied;
    };
    f.run(context => {
      const operations = proofOperations(context);
      assert.equal(operations.hash('leaf.txt'), digest('approved'));
      supplied.fill(120);
      assert.equal(operations.hash('leaf.txt'), digest('approved'));
      assert.equal(operations.bytes('leaf.txt').toString(), 'approved');
    }, { read });
    assert.equal(reads, 2);
  }
});

test('json() values confer no memo authority and canonical predicate inputs are privately frozen', t => {
  const f = fixture(t);
  f.run(context => {
    const clearance = proofOperations(context).json('clearance.json');
    clearance.status = 'pending';
    assert.equal(leaf(context).status, 'approved');
    const result = prove(context, kind, 'frozen', 'clearance.json', (_context, canonical) => {
      assert.equal(Object.isFrozen(canonical), true);
      assert.equal(Object.isFrozen(canonical.counts), true);
      assert.throws(() => { canonical.counts.rows++; }, TypeError);
      return canonical;
    });
    assert.equal(Object.isFrozen(result), false);
    result.counts.rows++;
  });
  assert.throws(() => f.run(context => {
    const clearance = proofOperations(context).json('clearance.json');
    prove(context, kind, 'approved', clearance, () => clearance);
  }), /fixed path/);
  assert.throws(() => f.run(context => {
    leaf(context);
    prove(context, kind, 'approved', 'clearance.json', () => ({ status: 'approved' }));
  }), /Changed proof evaluator identity/);
});

test('nested prototype collisions in JSON serialization never admit a caller predicate through a memo hit', t => {
  const f = fixture(t);
  f.run(context => {
    const operations = proofOperations(context);
    const caller = operations.json('clearance.json');
    const before = JSON.stringify(caller);
    Object.setPrototypeOf(caller.counts, null);
    assert.equal(JSON.stringify(caller), before);
    assert.equal(leaf(context).counts.rows, 3);
    assert.equal(Object.getPrototypeOf(leaf(context).counts), Object.prototype);
    let evaluations = 0;
    for (let index = 0; index < 2; index++) {
      const result = evaluateProof(context, () => {
        evaluations++;
        assert.equal(Object.getPrototypeOf(caller.counts), null);
        return caller;
      });
      assert.strictEqual(result, caller);
    }
    assert.equal(evaluations, 2);
  });
  assert.throws(() => f.run(context => {
    const caller = proofOperations(context).json('clearance.json');
    Object.setPrototypeOf(caller.counts, null);
    leaf(context);
    evaluateProof(context, () => assert.equal(Object.getPrototypeOf(caller.counts), Object.prototype));
  }));
});

test('signed-zero serialization collisions never merge caller predicates or change canonical copies', t => {
  const f = fixture(t, { 'zero.json': '{"zero":-0}' });
  let canonicalEvaluations = 0;
  const canonicalBody = (_context, clearance) => {
    canonicalEvaluations++;
    assert.ok(Object.is(clearance.zero, -0));
    return clearance;
  };
  f.run(context => {
    const caller = proofOperations(context).json('zero.json');
    const original = JSON.stringify(caller);
    const first = prove(context, kind, 'signed-zero', 'zero.json', canonicalBody);
    first.zero = 0;
    caller.zero = 0;
    assert.equal(JSON.stringify(caller), original);
    let callerEvaluations = 0;
    for (let index = 0; index < 2; index++) evaluateProof(context, () => {
      callerEvaluations++;
      assert.ok(Object.is(caller.zero, 0));
    });
    assert.equal(callerEvaluations, 2);
    assert.ok(Object.is(prove(context, kind, 'signed-zero', 'zero.json', canonicalBody).zero, -0));
    assert.equal(canonicalEvaluations, 1);
  });
});

test('persistent changes or deletion of code, clearance, report, or discovery-only scope reject at final read', t => {
  const names = ['leaf.txt', 'clearance.json', 'report.json', 'scope.json'];
  for (const changed of names) {
    for (const remove of [false, true]) {
      const f = fixture(t, Object.fromEntries(names.map(name => [name, 'original'])));
      assert.throws(() => f.run(context => {
        const operations = proofOperations(context);
        for (const file of names) assert.equal(operations.hash(file), digest('original'));
        if (remove) fs.unlinkSync(path.join(f.root, changed));
        else f.write(changed, 'modified');
      }), remove ? /ENOENT/ : new RegExp(`Changed proof input during invocation: ${changed}`));
    }
  }
});

test('same-size mtime-restored changes reject, and separate invocations never reuse warm authority', t => {
  const f = fixture(t);
  assert.equal(f.run(context => leaf(context)).status, 'approved');
  const file = path.join(f.root, 'leaf.txt');
  const original = fs.statSync(file);
  f.write('leaf.txt', 'corrupt!');
  fs.utimesSync(file, original.atime, original.mtime);
  assert.equal(fs.statSync(file).size, original.size);
  assert.throws(() => f.run(context => leaf(context)));
  f.write('leaf.txt', 'approved');
  assert.equal(f.run(context => leaf(context)).status, 'approved');
  assert.throws(() => f.run(context => {
    leaf(context);
    f.write('leaf.txt', 'corrupt!');
    fs.utimesSync(file, original.atime, original.mtime);
  }), /Changed proof input/);
});

test('first-read corruption cannot be laundered by restoring the file before returning', t => {
  const f = fixture(t);
  f.write('leaf.txt', 'corrupt!');
  assert.throws(() => f.run(context => {
    try { leaf(context); } finally { f.write('leaf.txt', 'approved'); }
  }));
  assert.deepEqual(f.calls, ['clearance.json', 'leaf.txt']);
  assert.equal(f.run(context => leaf(context)).status, 'approved');
});

test('documented transient divergence: an omitted legacy read could reject before restoration', t => {
  const f = fixture(t);
  const evaluate = context => {
    const operations = proofOperations(context);
    assert.equal(operations.hash('leaf.txt'), digest('approved'));
    f.write('leaf.txt', 'corrupt!');
    try { assert.equal(operations.hash('leaf.txt'), digest('approved')); }
    finally { f.write('leaf.txt', 'approved'); }
    return true;
  };
  assert.equal(f.run(evaluate), true);
  assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt']);
  f.calls.length = 0;
  assert.throws(() => f.run(evaluate, { omittedReader: false }));
  assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt']);
});

test('sequential finalization does not promise to detect mutation after a path final observation', t => {
  const f = fixture(t, { 'a.txt': 'original', 'z.txt': 'original' });
  let reads = 0;
  const result = f.run(context => {
    const operations = proofOperations(context);
    operations.hash('a.txt');
    operations.hash('z.txt');
    return 'verified observations';
  }, { read: file => {
    const bytes = f.read(file);
    if (++reads === 4) f.write('a.txt', 'modified');
    return bytes;
  } });
  assert.equal(result, 'verified observations');
  assert.equal(fs.readFileSync(path.join(f.root, 'a.txt'), 'utf8'), 'modified');
});

test('explicit reader and explicit undefined stay uncached, including the same disk-reader identity', t => {
  const f = fixture(t);
  function guard(read = f.read) {
    return runFreshProof({ root: f.root, omittedReader: arguments.length === 0, read, inputs: [] }, context => {
      const operations = proofOperations(context);
      for (let index = 0; index < 3; index++) operations.hash('leaf.txt');
      return leaf(context);
    });
  }
  for (const call of [() => guard(f.read), () => guard(undefined)]) {
    f.calls.length = 0;
    call();
    assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt', 'leaf.txt', 'clearance.json', 'leaf.txt']);
  }
  f.calls.length = 0;
  guard();
  assert.deepEqual(f.calls, ['leaf.txt', 'clearance.json', 'clearance.json', 'leaf.txt']);
});

test('explicit non-callable readers preserve no-read outcomes and earlier evaluator errors', t => {
  const f = fixture(t);
  for (const read of [null, 42, {}, undefined]) {
    const options = { omittedReader: false, read };
    const supplied = { counts: { rows: 3 } };
    assert.equal(f.run(() => undefined, options), undefined);
    assert.strictEqual(f.run(context => evaluateProof(context, () => supplied), options), supplied);
    const firstError = new Error('earlier predicate error');
    assert.throws(() => f.run(context => evaluateProof(context, () => { throw firstError; }), options),
      error => error === firstError);
  }
  assert.deepEqual(f.calls, []);
});

test('explicit non-callable readers raise the native TypeError only at an actual read site', t => {
  const f = fixture(t);
  const operations = [
    context => proofOperations(context).bytes('leaf.txt'),
    context => proofOperations(context).hash('leaf.txt'),
    context => proofOperations(context).json('clearance.json'),
    context => prove(context, kind, 'approved', 'clearance.json', () => assert.fail('read must fail before canonical evaluator')),
  ];
  for (const read of [null, 42, {}, undefined]) {
    let legacyError;
    try { read('leaf.txt'); } catch (error) { legacyError = error; }
    assert.ok(legacyError instanceof TypeError);
    for (const evaluate of operations) {
      let started = false;
      assert.throws(() => f.run(context => {
        started = true;
        return evaluate(context);
      }, { omittedReader: false, read }), error => error instanceof TypeError && error.message === legacyError.message);
      assert.equal(started, true);
    }
  }
  assert.deepEqual(f.calls, []);
});

test('omitted readers still require a callable built-in reader before evaluation', t => {
  const f = fixture(t);
  let evaluations = 0;
  for (const read of [null, 42, {}, undefined]) {
    assert.throws(() => f.run(() => { evaluations++; }, { omittedReader: true, read }), /Missing proof reader/);
  }
  assert.equal(evaluations, 0);
  assert.deepEqual(f.calls, []);
});

test('custom readers preserve nth-read errors, aliases, returned Buffer identity, and call ordering', t => {
  const f = fixture(t);
  const backing = Buffer.from('approved');
  const calls = [];
  const read = file => { calls.push(file); if (calls.length === 4) throw new Error('fourth read'); return backing; };
  assert.throws(() => f.run(context => {
    const operations = proofOperations(context);
    assert.strictEqual(operations.bytes('leaf.txt'), backing);
    assert.equal(operations.hash('./leaf.txt'), digest(backing));
    operations.bytes('leaf.txt');
    operations.hash('./leaf.txt');
  }, { omittedReader: false, read }), /fourth read/);
  assert.deepEqual(calls, ['leaf.txt', './leaf.txt', 'leaf.txt', './leaf.txt']);
  assert.deepEqual(f.calls, []);
});

test('strict readers always receive undefined this across operations, canonical proofs, and final rereads', t => {
  const f = fixture(t);
  const body = (_context, clearance) => clearance;
  for (const omittedReader of [true, false]) {
    const receivers = [];
    f.calls.length = 0;
    function read(file) {
      receivers.push(this);
      assert.strictEqual(this, undefined, 'The private owner must never become the reader receiver');
      return f.read(file);
    }
    f.run(context => {
      const operations = proofOperations(context);
      assert.equal(operations.bytes('leaf.txt').toString(), 'approved');
      assert.equal(operations.hash('leaf.txt'), digest('approved'));
      assert.equal(operations.json('clearance.json').status, 'approved');
      assert.equal(prove(context, kind, 'approved', 'clearance.json', body).status, 'approved');
      assert.equal(prove(context, kind, 'approved', 'clearance.json', body).status, 'approved');
    }, { omittedReader, read });
    assert.deepEqual(f.calls, omittedReader
      ? ['leaf.txt', 'clearance.json', 'clearance.json', 'leaf.txt']
      : ['leaf.txt', 'leaf.txt', 'clearance.json', 'clearance.json', 'clearance.json']);
    assert.ok(receivers.every(receiver => receiver === undefined));
  }
});

test('classification never invokes nested Proxy traps, own/inherited hooks, or getters', t => {
  const f = fixture(t);
  let hooks = 0;
  const proxy = new Proxy({}, {
    get() { hooks++; throw new Error('get trap'); },
    getPrototypeOf() { hooks++; throw new Error('prototype trap'); },
    ownKeys() { hooks++; throw new Error('keys trap'); },
    getOwnPropertyDescriptor() { hooks++; throw new Error('descriptor trap'); },
  });
  const getter = Object.defineProperty({}, 'status', { enumerable: true, get() { hooks++; return 'approved'; } });
  const inherited = Object.create({ toJSON() { hooks++; } });
  const ownHook = { toJSON() { hooks++; } };
  const accessorHook = Object.defineProperty({}, 'toJSON', { get() { hooks++; } });
  for (const value of [proxy, { nested: [proxy] }, getter, inherited, ownHook, accessorHook]) {
    f.calls.length = 0;
    f.run(context => {
      for (let index = 0; index < 3; index++) proofOperations(context).hash('leaf.txt');
    }, { inputs: [value] });
    assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt', 'leaf.txt']);
    assert.equal(hooks, 0);
  }
  const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
  try {
    Object.defineProperty(Object.prototype, 'toJSON', { configurable: true, get() { hooks++; } });
    f.calls.length = 0;
    f.run(context => { for (let index = 0; index < 3; index++) proofOperations(context).hash('leaf.txt'); }, { inputs: [{}] });
    assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt', 'leaf.txt']);
    assert.equal(hooks, 0);
  } finally {
    if (descriptor) Object.defineProperty(Object.prototype, 'toJSON', descriptor);
    else delete Object.prototype.toJSON;
  }
});

test('inherited custom accessors and callable hooks choose uncached before any hook executes', t => {
  const f = fixture(t);
  const changes = [
    [Object.prototype, 'then', 'accessor'],
    [Object.prototype, 'then', 'callable'],
    [Object.prototype, '__review_accessor__', 'accessor'],
    [Object.prototype, '__review_callable__', 'callable'],
    [Array.prototype, '__review_accessor__', 'accessor'],
    [Array.prototype, '__review_callable__', 'callable'],
    [Object.prototype, '__proto__', 'accessor'],
    [Object.prototype, 'toString', 'callable'],
  ];
  for (const [prototype, key, type] of changes) {
    const original = Object.getOwnPropertyDescriptor(prototype, key);
    let hooks = 0;
    const hook = () => { hooks++; throw new Error('classification must not call inherited hooks'); };
    try {
      Object.defineProperty(prototype, key, type === 'accessor'
        ? { configurable: true, get: hook }
        : { configurable: true, writable: true, value: hook });
      for (const roots of [[{ nested: [{}] }], []]) {
        f.calls.length = 0;
        const supplied = { status: 'approved', counts: { rows: 3 } };
        const result = f.run(context => {
          assert.equal(hooks, 0);
          const operations = proofOperations(context);
          operations.hash('leaf.txt');
          operations.hash('leaf.txt');
          operations.hash('leaf.txt');
          return supplied;
        }, { inputs: roots });
        assert.strictEqual(result, supplied);
        assert.equal(hooks, 0);
        assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt', 'leaf.txt']);
      }
    } finally {
      if (original) Object.defineProperty(prototype, key, original);
      else delete prototype[key];
    }
  }
  f.calls.length = 0;
  const ordinary = { nested: [{ status: 'approved' }] };
  assert.strictEqual(f.run(context => {
    for (let index = 0; index < 3; index++) proofOperations(context).hash('leaf.txt');
    return ordinary;
  }, { inputs: [ordinary] }), ordinary);
  assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt']);
});

test('an inherited getter used by the legacy evaluator retains its uncached observation ordering', t => {
  const f = fixture(t);
  let hooks = 0;
  const key = '__review_accessor__';
  const original = Object.getOwnPropertyDescriptor(Object.prototype, key);
  try {
    Object.defineProperty(Object.prototype, key, { configurable: true, get() {
      hooks++;
      f.write('leaf.txt', 'corrupt!');
      return 'legacy-value';
    } });
    const input = {};
    assert.throws(() => f.run(context => {
      assert.equal(hooks, 0);
      const operations = proofOperations(context);
      assert.equal(operations.hash('leaf.txt'), digest('approved'));
      assert.equal(input[key], 'legacy-value');
      try { assert.equal(operations.hash('leaf.txt'), digest('approved')); }
      finally { f.write('leaf.txt', 'approved'); }
    }, { inputs: [input] }));
    assert.equal(hooks, 1);
    assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt']);
  } finally {
    if (original) Object.defineProperty(Object.prototype, key, original);
    else delete Object.prototype[key];
  }
});

test('unsafe and out-of-bound caller inputs fall back before any reads and preserve input identity', t => {
  const f = fixture(t);
  const cycle = {}; cycle.self = cycle;
  const symbolKey = { [Symbol('hidden')]: true };
  let deep = {}; for (let index = 0; index < 66; index++) deep = { next: deep };
  const sparse = []; sparse.length = 2;
  const huge = Object.fromEntries(Array.from({ length: 65537 }, (_, index) => [String(index), true]));
  const values = [cycle, symbolKey, deep, sparse, huge, 'x'.repeat(8388609),
    undefined, NaN, Infinity, 1n, Symbol('value'), () => {}, new Date(), new Map(), new Uint8Array(1)];
  for (const value of values) {
    f.calls.length = 0;
    const supplied = { value };
    const result = f.run(context => {
      assert.deepEqual(f.calls, []);
      for (let index = 0; index < 3; index++) proofOperations(context).hash('leaf.txt');
      return supplied;
    }, { inputs: [supplied] });
    assert.strictEqual(result, supplied);
    assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt', 'leaf.txt']);
  }
});

test('plain null-prototype objects, shared noncyclic children, and frozen JSON inputs still optimize', t => {
  const f = fixture(t);
  const child = Object.freeze({ count: 1 });
  const supplied = Object.assign(Object.create(null), { a: child, b: child, list: [true, null, 'text', 42] });
  const result = f.run(context => {
    for (let index = 0; index < 3; index++) proofOperations(context).hash('leaf.txt');
    return supplied;
  }, { inputs: [supplied] });
  assert.strictEqual(result, supplied);
  assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt']);
});

test('explicit readers bypass classification even when the roots-list itself is a revoked Proxy', t => {
  const f = fixture(t);
  const { proxy, revoke } = Proxy.revocable([], {});
  revoke();
  assert.equal(f.run(context => proofOperations(context).hash('leaf.txt'), { inputs: proxy, omittedReader: false }), digest('approved'));
  assert.deepEqual(f.calls, ['leaf.txt']);
});

test('uncached caller payloads remain opaque including Proxy, accessor/callable then, and native Promise', t => {
  const f = fixture(t);
  let hooks = 0;
  const base = { status: 'approved', counts: { rows: 3 } };
  const proxy = new Proxy(base, {
    get(target, key, receiver) {
      if (key === 'then') { hooks++; throw new Error('then must never be read'); }
      return Reflect.get(target, key, receiver);
    },
    getPrototypeOf() { hooks++; throw new Error('prototype must never be read'); },
    getOwnPropertyDescriptor() { hooks++; throw new Error('descriptors must never be read'); },
  });
  const getter = Object.defineProperty({ ...base }, 'then', { get() { hooks++; throw new Error('then getter'); } });
  const callable = { ...base, then() { hooks++; } };
  const promise = Object.assign(Promise.resolve(true), base);
  for (const value of [proxy, getter, callable, promise]) {
    for (const omittedReader of [false, true]) {
      f.calls.length = 0;
      const result = f.run(context => evaluateProof(context, () => {
        assert.equal(value.status, 'approved');
        for (let index = 0; index < 3; index++) proofOperations(context).hash('leaf.txt');
        return value;
      }), { omittedReader, inputs: [value] });
      assert.strictEqual(result, value);
      assert.equal(hooks, 0);
      assert.deepEqual(f.calls, ['leaf.txt', 'leaf.txt', 'leaf.txt']);
    }
    const result = f.run(context => prove(context, kind, 'approved', 'clearance.json', (_context, canonical) => {
      assert.equal(Object.isFrozen(canonical), false);
      canonical.counts.rows++;
      return value;
    }), { omittedReader: false });
    assert.strictEqual(result, value);
    assert.equal(hooks, 0);
  }
});

test('caught non-Error and falsey thrown values poison an owner too', t => {
  const f = fixture(t);
  for (const thrown of [undefined, null, false, 0, 'reader error']) {
    let completed = false;
    try {
      f.run(context => {
        try { evaluateProof(context, () => { throw thrown; }); } catch { /* intentionally caught */ }
        return 'cannot erase failure';
      });
      completed = true;
    } catch (error) {
      assert.strictEqual(error, thrown);
    }
    assert.equal(completed, false);
  }
});

test('caught operation, evaluator, and sibling failures poison the owner and skip final reads', t => {
  const f = fixture(t);
  for (const fail of [
    context => proofOperations(context).hash('missing'),
    context => evaluateProof(context, () => { throw new Error('failed adapter assertion'); }),
    context => prove(context, Symbol('sibling'), 'approved', 'clearance.json', () => { throw new Error('failed sibling'); }),
  ]) {
    f.calls.length = 0;
    assert.throws(() => f.run(context => {
      leaf(context);
      assert.throws(() => fail(context));
      assert.throws(() => proofOperations(context));
      return 'cannot suppress failure';
    }));
    assert.equal(f.calls.filter(file => file === 'leaf.txt').length, 1);
    assert.equal(f.calls.filter(file => file === 'clearance.json').length, 1);
  }
});

test('same proof key cycles reject on snapshot and uncached owners, even when caught', t => {
  const f = fixture(t);
  for (const omittedReader of [true, false]) {
    assert.throws(() => f.run(context => {
      function recursive(nested, clearance) {
        assert.throws(() => prove(nested, kind, 'approved', 'clearance.json', recursive), /cycle/);
        return clearance;
      }
      prove(context, kind, 'approved', 'clearance.json', recursive);
    }, { omittedReader }), /cycle/);
  }
});

test('missing, forged, and closed contexts cannot evaluate or use leaked operations', t => {
  const f = fixture(t);
  for (const context of [undefined, {}, Object.freeze(Object.create(null))]) {
    assert.throws(() => proofOperations(context), /context/);
    assert.throws(() => evaluateProof(context, () => true), /context/);
    assert.throws(() => prove(context, kind, 'approved', {}, () => true), /context/);
  }
  for (const fail of [false, true]) {
    let captured;
    let operations;
    const run = () => f.run(context => {
      captured = context;
      operations = proofOperations(context);
      operations.hash('leaf.txt');
      if (fail) throw new Error('stop');
    });
    if (fail) assert.throws(run, /stop/); else run();
    assert.throws(() => operations.hash('leaf.txt'), /closed/);
    assert.throws(() => operations.bytes('leaf.txt'), /closed/);
    assert.throws(() => operations.json('clearance.json'), /closed/);
    assert.throws(() => evaluateProof(captured, () => true), /closed/);
  }
});

test('reentrant owners and different roots have independent snapshots and memo results', t => {
  const outer = fixture(t);
  const inner = fixture(t, { 'leaf.txt': 'different', 'clearance.json': '{"status":"approved"}' });
  let innerContext;
  outer.run(context => {
    leaf(context);
    assert.equal(inner.run(nested => {
      innerContext = nested;
      return proofOperations(nested).hash('leaf.txt');
    }), digest('different'));
    assert.throws(() => proofOperations(innerContext), /closed/);
    assert.equal(proofOperations(context).hash('leaf.txt'), digest('approved'));
    assert.equal(outer.run(nested => leaf(nested)).status, 'approved');
    assert.equal(leaf(context).status, 'approved');
  });
  assert.deepEqual(inner.calls, ['leaf.txt', 'leaf.txt']);
  assert.equal(outer.calls.filter(file => file === 'leaf.txt').length, 4);
});

test('owned snapshot callbacks reject async functions, Promises, and thenables without invoking hooks', t => {
  const f = fixture(t);
  let executions = 0;
  const callbacks = [async () => { executions++; }, function* () { executions++; }, async function* () { executions++; }];
  for (const callback of callbacks) {
    for (const omittedReader of [true, false]) {
      assert.throws(() => f.run(callback, { omittedReader }), /synchronous/);
      assert.throws(() => f.run(context => evaluateProof(context, callback), { omittedReader }), /synchronous/);
      assert.throws(() => f.run(context => prove(context, kind, 'approved', 'clearance.json', callback), { omittedReader }), /synchronous/);
    }
  }
  for (const result of [Promise.resolve(true), { then() { executions++; } }]) {
    assert.throws(() => f.run(() => result), /synchronous/);
    assert.throws(() => f.run(context => {
      assert.throws(() => prove(context, kind, 'approved', 'clearance.json', () => result), /synchronous/);
    }), /synchronous/);
  }
  const accessor = Object.defineProperty({}, 'then', { get() { executions++; } });
  assert.throws(() => f.run(() => accessor), /accessor thenable/);
  const proxy = new Proxy({}, { getPrototypeOf() { executions++; } });
  assert.throws(() => f.run(() => proxy), /Proxy result/);
  const callbackProxy = new Proxy(async () => { executions++; }, {});
  assert.throws(() => f.run(callbackProxy), /evaluator must not be a Proxy/);
  assert.equal(executions, 0);
});

test('leaked operations close before a queued continuation can use them', async t => {
  const f = fixture(t);
  let continuation;
  for (const omittedReader of [true, false]) {
    f.run(context => {
      const operations = proofOperations(context);
      operations.hash('leaf.txt');
      continuation = Promise.resolve().then(() => assert.throws(() => operations.hash('leaf.txt'), /closed/));
      return 'synchronous result';
    }, { omittedReader });
    await continuation;
  }
});

test('undefined complete-proof results memoize, and ordinary returned JSON preserves special keys', t => {
  const f = fixture(t);
  let evaluations = 0;
  f.run(context => {
    const body = () => { evaluations++; };
    for (let index = 0; index < 3; index++) {
      assert.equal(prove(context, kind, 'void', 'clearance.json', body), undefined);
    }
    const special = JSON.parse('{"__proto__":{"safe":true},"constructor":"data","zero":-0}');
    const result = prove(context, kind, 'special', 'clearance.json', () => special);
    assert.ok(Object.hasOwn(result, '__proto__'));
    assert.equal(result.__proto__.safe, true);
    assert.equal(result.constructor, 'data');
    assert.ok(Object.is(result.zero, -0));
  });
  assert.equal(evaluations, 1);
});

test('final read errors and caught attempts to add paths during finalization reject and close operations', t => {
  const f = fixture(t);
  for (const reenter of [false, true]) {
    let operations;
    let reads = 0;
    assert.throws(() => f.run(context => {
      operations = proofOperations(context);
      operations.hash('leaf.txt');
    }, { read: file => {
      if (++reads === 2) {
        if (!reenter) throw new Error('final read failed');
        assert.throws(() => operations.hash('clearance.json'), /finalizing/);
      }
      return f.read(file);
    } }), reenter ? /finalizing/ : /final read failed/);
    assert.throws(() => operations.hash('leaf.txt'), /closed/);
  }
});

test('path aliases remain distinct observations, duplicates share captures, and invalid paths reject', t => {
  const f = fixture(t);
  f.run(context => {
    const operations = proofOperations(context);
    for (const file of ['leaf.txt', './leaf.txt', 'leaf.txt']) assert.equal(operations.hash(file), digest('approved'));
  });
  assert.deepEqual(f.calls, ['leaf.txt', './leaf.txt', './leaf.txt', 'leaf.txt']);
  for (const file of ['../leaf.txt', '/leaf.txt', 1, null]) {
    assert.throws(() => f.run(context => proofOperations(context).hash(file)), /Invalid reviewed path/);
  }
});

test('1024 observed paths and 32 completed keys are admitted; the next fails closed', t => {
  const f = fixture(t, Object.fromEntries(Array.from({ length: 1025 }, (_, index) => [`p${index}`, '{}'])));
  f.run(context => { for (let index = 0; index < 1024; index++) proofOperations(context).hash(`p${index}`); });
  assert.equal(f.calls.length, 2048);
  f.calls.length = 0;
  assert.throws(() => f.run(context => {
    for (let index = 0; index < 1025; index++) proofOperations(context).hash(`p${index}`);
  }), /path limit/);
  assert.equal(f.calls.length, 1024);
  f.run(context => {
    let evaluations = 0;
    const body = () => { evaluations++; };
    for (let index = 0; index < 32; index++) prove(context, kind, String(index), 'p0', body);
    prove(context, kind, '0', 'p0', body);
    assert.equal(evaluations, 32);
  });
  assert.throws(() => f.run(context => {
    for (let index = 0; index < 33; index++) prove(context, kind, String(index), 'p0', () => undefined);
  }), /proof limit/);
});

test('64 MiB retained raw bytes are admitted; one further byte rejects before finalization', t => {
  const f = fixture(t, { 'large.bin': Buffer.alloc(67108864), 'extra.bin': Buffer.from([1]) });
  assert.equal(f.run(context => proofOperations(context).bytes('large.bin').length), 67108864);
  f.calls.length = 0;
  assert.throws(() => f.run(context => {
    const operations = proofOperations(context);
    operations.hash('large.bin');
    operations.hash('extra.bin');
  }), /retained byte limit/);
  assert.deepEqual(f.calls, ['large.bin', 'extra.bin']);
});
