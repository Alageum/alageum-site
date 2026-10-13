// Internal synchronous coordinator. Public guards own and finalize invocations;
// neither this context nor its results are release approval tokens.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { types } from 'node:util';

const limits = Object.freeze({
  paths: 1024, retainedBytes: 67108864, proofs: 32,
  inputDepth: 64, inputProperties: 65536, inputBytes: 8388608,
});
// This registry contains active owners only, never reusable proof authority.
const active = new WeakMap();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
// Bind known intrinsics during trusted module initialization. Unknown inherited
// properties, replaced methods, and custom accessors force the legacy route.
const intrinsicPrototypes = new Map([
  [Object.prototype, 'constructor __defineGetter__ __defineSetter__ hasOwnProperty __lookupGetter__ __lookupSetter__ isPrototypeOf propertyIsEnumerable toString valueOf __proto__ toLocaleString'.split(' ')],
  [Array.prototype, [...'length constructor at concat copyWithin fill find findIndex findLast findLastIndex lastIndexOf pop push reverse shift unshift slice sort splice includes indexOf join keys entries values forEach filter flat flatMap map every some reduce reduceRight toReversed toSorted toSpliced with toLocaleString toString'.split(' '), Symbol.iterator, Symbol.unscopables]],
].map(([prototype, keys]) => [prototype, new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(prototype, key)]))]));

function ordinaryInputs(inputs) {
  let properties = 0;
  let bytes = 0;
  const ancestors = new Set();
  const checkedPrototypes = new Set();
  const charge = value => (bytes += Buffer.byteLength(value, 'utf8')) <= limits.inputBytes;
  const ordinaryPrototype = prototype => {
    for (let inherited = prototype; inherited !== null; inherited = Object.getPrototypeOf(inherited)) {
      if (types.isProxy(inherited)) return false;
      if (checkedPrototypes.has(inherited)) continue;
      const intrinsics = intrinsicPrototypes.get(inherited);
      if (!intrinsics) return false;
      const keys = Reflect.ownKeys(inherited);
      for (let index = 0; index < keys.length; index++) {
        const key = keys[index];
        const descriptor = Object.getOwnPropertyDescriptor(inherited, key);
        const intrinsic = intrinsics.get(key);
        if (!intrinsic) return false;
        // __proto__ is the sole accepted accessor, with both original functions.
        if (!Object.hasOwn(descriptor, 'value') && (inherited !== Object.prototype || key !== '__proto__')) return false;
        const fields = ['value', 'get', 'set', 'enumerable', 'configurable', 'writable'];
        for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
          const field = fields[fieldIndex];
          const actual = Object.hasOwn(descriptor, field) ? descriptor[field] : undefined;
          const expected = Object.hasOwn(intrinsic, field) ? intrinsic[field] : undefined;
          if (actual !== expected) return false;
        }
      }
      checkedPrototypes.add(inherited);
    }
    return true;
  };
  const visit = (value, depth) => {
    if (depth > limits.inputDepth) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'string') return charge(value);
    if (typeof value === 'number') return Number.isFinite(value) && (bytes += 8) <= limits.inputBytes;
    if (typeof value !== 'object' || types.isProxy(value)) return false;
    // Check for proxies before inspecting *each* object, including prototypes.
    const prototype = Object.getPrototypeOf(value);
    const array = Array.isArray(value);
    if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) return false;
    if (!ordinaryPrototype(prototype)) return false;
    if (ancestors.has(value)) return false;
    const keys = Reflect.ownKeys(value);
    if ((properties += keys.length) > limits.inputProperties) return false;
    const length = array ? Object.getOwnPropertyDescriptor(value, 'length').value : 0;
    if (array && (length > limits.inputProperties || keys.length !== length + 1)) return false;
    ancestors.add(value);
    for (let index = 0; index < keys.length; index++) {
      const key = keys[index];
      if (typeof key !== 'string' || key === 'toJSON' || !charge(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!Object.hasOwn(descriptor, 'value')) return false;
      if (array && key === 'length') continue;
      if (!descriptor.enumerable) return false;
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length)) return false;
      if (!visit(descriptor.value, depth + 1)) return false;
    }
    ancestors.delete(value);
    return true;
  };
  // inputs is an internal list of caller roots. Do not invoke its iterator or
  // inspect anything at all when the caller explicitly supplied a reader.
  if (typeof inputs !== 'object' || inputs === null || types.isProxy(inputs) ||
      !Array.isArray(inputs) || Object.getPrototypeOf(inputs) !== Array.prototype) return false;
  // Owned JSON also inherits these prototypes, even with no caller roots.
  if (!ordinaryPrototype(Object.prototype) || !ordinaryPrototype(Array.prototype)) return false;
  const roots = Reflect.ownKeys(inputs);
  const length = Object.getOwnPropertyDescriptor(inputs, 'length').value;
  if (length > limits.inputProperties || roots.length !== length + 1) return false;
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(inputs, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !visit(descriptor.value, 0)) return false;
  }
  return true;
}

function synchronous(value, snapshot) {
  // An uncached evaluator preserves legacy opaque return identity. Inspecting
  // even a Promise/Proxy here would add behavior to the supplied-reader route.
  if (!snapshot) return value;
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return value;
  assert.ok(!types.isPromise(value), 'Proof invocation must be synchronous');
  for (let object = value; object !== null; object = Object.getPrototypeOf(object)) {
    if (types.isProxy(object)) {
      assert.fail('Proof invocation cannot inspect a Proxy result');
    }
    const descriptor = Object.getOwnPropertyDescriptor(object, 'then');
    if (descriptor) {
      if (!Object.hasOwn(descriptor, 'value')) {
        assert.fail('Proof invocation cannot inspect an accessor thenable');
      }
      assert.notEqual(typeof descriptor.value, 'function', 'Proof invocation must be synchronous');
      break;
    }
  }
  return value;
}

function owner(context) {
  const state = active.get(context);
  assert.ok(state, 'Invalid or closed proof invocation context');
  try {
    assert.equal(state.phase, 'evaluating', 'Proof invocation is finalizing');
    if (state.failed) throw state.failure;
    return state;
  } catch (error) {
    poison(state, error);
    throw error;
  }
}

function poison(state, error) {
  if (!state.failed) {
    state.failed = true;
    state.failure = error;
  }
}

function assertEvaluator(body) {
  assert.equal(typeof body, 'function', 'Missing proof evaluator');
  assert.ok(!types.isProxy(body), 'Proof evaluator must not be a Proxy');
  assert.ok(!types.isAsyncFunction(body) && !types.isGeneratorFunction(body), 'Proof invocation must be synchronous');
}

function guarded(context, body) {
  const state = owner(context);
  try {
    const result = body(state);
    if (state.failed) throw state.failure;
    return result;
  } catch (error) {
    poison(state, error);
    throw error;
  }
}

function readFile(state, file) {
  // Preserve the legacy strict reader receiver and never expose the owner as
  // `this` to a supplied reader (including first capture and final rereads).
  const read = state.read;
  return read(file);
}

function capture(state, file) {
  assert.ok(typeof file === 'string' && !path.isAbsolute(file) && !file.split('/').includes('..'), 'Invalid reviewed path');
  if (state.ledger.has(file)) return state.ledger.get(file);
  assert.ok(state.ledger.size < limits.paths, 'Proof invocation path limit exceeded');
  const bytes = copyBytes(readFile(state, file));
  assert.ok(state.retainedBytes + bytes.length <= limits.retainedBytes, 'Proof invocation retained byte limit exceeded');
  const entry = { bytes, hash: digest(bytes) };
  state.retainedBytes += bytes.length;
  state.ledger.set(file, entry);
  return entry;
}

function copyBytes(value) {
  assert.ok(types.isUint8Array(value), 'Proof reader must return bytes');
  return Buffer.from(value);
}

function copyJson(value, freeze = false) {
  if (value === null || typeof value !== 'object') return value;
  const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
  for (const key of Object.keys(value)) {
    Object.defineProperty(copy, key, {
      value: copyJson(Object.getOwnPropertyDescriptor(value, key).value, freeze),
      enumerable: true, configurable: true, writable: true,
    });
  }
  return freeze ? Object.freeze(copy) : copy;
}

/** Internal evaluators must use this boundary even when they return no value. */
export function evaluateProof(context, body) {
  return guarded(context, state => {
    assertEvaluator(body);
    return synchronous(body(), state.snapshot);
  });
}

export function proofOperations(context) {
  return guarded(context, state => state.operations);
}

/** Fixed canonical paths and stable private evaluators name complete nodes.
 * json() values and caller-supplied clearances never become authority keys.
 */
export function prove(context, kind, mode, clearancePath, body) {
  return guarded(context, state => {
    assert.equal(typeof kind, 'symbol', 'Proof kind must be a private Symbol');
    assert.equal(Symbol.keyFor(kind), undefined, 'Proof kind must be a private Symbol');
    assert.equal(typeof mode, 'string', 'Proof mode must be a string');
    assert.equal(typeof clearancePath, 'string', 'Proof clearance must be a fixed path');
    assertEvaluator(body);
    // Nested maps keep path, mode and digest distinct and bind evaluator identity.
    const kinds = state.nodes.get(kind) ?? new Map();
    state.nodes.set(kind, kinds);
    const modes = kinds.get(mode) ?? new Map();
    kinds.set(mode, modes);
    let pathNode = modes.get(clearancePath);
    if (!pathNode) {
      pathNode = { body, versions: new Map(), running: false };
      modes.set(clearancePath, pathNode);
    }
    assert.strictEqual(pathNode.body, body, 'Changed proof evaluator identity');
    assert.ok(!pathNode.running, 'Proof invocation cycle');
    if (!state.snapshot) {
      pathNode.running = true;
      try {
        // Keep the legacy read/parse site, mutable canonical input, and opaque
        // result unchanged. This path neither memoizes nor performs final reads.
        return body(context, JSON.parse(readFile(state, clearancePath)));
      } finally {
        pathNode.running = false;
      }
    }
    const entry = capture(state, clearancePath);
    const previous = pathNode.versions.get(entry.hash);
    assert.notEqual(previous?.status, 'in-progress', 'Proof invocation cycle');
    if (previous?.status === 'completed') return copyJson(previous.result);
    assert.ok(state.proofCount < limits.proofs, 'Proof invocation proof limit exceeded');
    state.proofCount++;
    const node = { status: 'in-progress' };
    pathNode.versions.set(entry.hash, node);
    try {
      const canonical = copyJson(JSON.parse(entry.bytes), true);
      const result = synchronous(body(context, canonical), true);
      if (state.failed) throw state.failure;
      assert.ok(result === undefined || ordinaryInputs([result]), 'Proof result must be ordinary JSON');
      node.result = copyJson(result, true);
      node.status = 'completed';
      return copyJson(node.result);
    } finally {
      if (node.status !== 'completed') pathNode.versions.delete(entry.hash);
    }
  });
}

/** No public verifier accepts options/context or can select an internal reader. */
export function runFreshProof({ root, omittedReader, read, inputs = [] }, evaluate) {
  assert.ok(typeof root === 'string' && path.isAbsolute(root), 'Invalid proof repository root');
  // Explicit readers retain legacy lazy failure: a route that never reads may
  // finish even with a non-callable reader; an actual read raises its TypeError.
  if (omittedReader === true) assert.equal(typeof read, 'function', 'Missing proof reader');
  const context = Object.freeze(Object.create(null));
  const state = {
    root, read, snapshot: omittedReader === true && ordinaryInputs(inputs),
    phase: 'evaluating', failed: false, failure: undefined, ledger: new Map(),
    nodes: new Map(), retainedBytes: 0, proofCount: 0, operations: null,
  };
  state.operations = Object.freeze({
    bytes: file => guarded(context, current => current.snapshot ? Buffer.from(capture(current, file).bytes) : readFile(current, file)),
    hash: file => guarded(context, current => current.snapshot ? capture(current, file).hash : digest(readFile(current, file))),
    json: file => guarded(context, current => {
      if (!current.snapshot) return JSON.parse(readFile(current, file));
      const entry = capture(current, file);
      return JSON.parse(entry.bytes);
    }),
  });
  active.set(context, state);
  try {
    assertEvaluator(evaluate);
    const result = evaluateProof(context, () => evaluate(context));
    state.phase = 'finalizing';
    if (state.snapshot) {
      // Sequential observations, not an atomic filesystem snapshot. A transient
      // mutation restored before its path's final read can escape this contract.
      const files = Object.freeze([...state.ledger.keys()].sort());
      for (const file of files) {
        const observed = state.ledger.get(file);
        const fresh = copyBytes(readFile(state, file));
        if (state.failed) throw state.failure;
        assert.ok(fresh.length === observed.bytes.length && digest(fresh) === observed.hash,
          `Changed proof input during invocation: ${file}`);
      }
    }
    if (state.failed) throw state.failure;
    return result;
  } finally {
    state.phase = 'closed';
    state.ledger.clear();
    state.nodes.clear();
    state.operations = null;
    state.read = null;
    state.root = null;
    active.delete(context);
  }
}
