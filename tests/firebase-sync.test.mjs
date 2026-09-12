import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as syncStatus from '../lib/sync-status.ts';

const source = ts.transpileModule(await readFile(new URL('../lib/firebase-sync.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const user = { uid: 'parent', email: 'parent@example.com' };
const accessKey = 'permit-hours-cloud-access-v2';
const pendingKey = 'permit-hours-pending-upload-v1';
const familyPath = 'permitHourFamilies/household';
const accessPath = 'permitHourAccess/parent@example.com';
const log = sessions => ({ sessions });
const family = (payload, viewer = false) => ({
  ownerUid: viewer ? 'other-parent' : user.uid,
  supervisorEmails: [], viewerEmails: viewer ? [user.email] : [], payload,
});

// Deterministic hook/effect scheduler: Firebase callbacks and write acknowledgements
// are controlled independently, without a real account, network, or driving log.
function createSync(data = log([]), storage = new Map()) {
  const slots = [];
  const listeners = new Map();
  const timers = new Map();
  const writes = [];
  let cursor = 0, dirty = true, effects = [], result, authCallback, timerId = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));
  const react = {
    useState(initial) {
      const slot = slots[cursor++] ?? (slots[cursor - 1] = { value: initial });
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; dirty = true; }];
    },
    useRef(initial) { return slots[cursor++] ?? (slots[cursor - 1] = { current: initial }); },
    useCallback(callback, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { deps, callback };
      return slots[index].callback;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (!changed(slots[index]?.deps, deps)) return;
      effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: callback() };
      });
    },
  };
  const app = {};
  const modules = {
    react, './sync-status': syncStatus,
    'firebase/app': { getApps: () => [app], getApp: () => app },
    'firebase/auth': {
      getAuth: () => ({}), setPersistence: async () => {}, getRedirectResult: async () => {},
      onAuthStateChanged(_auth, callback) { authCallback = callback; return () => {}; },
    },
    'firebase/firestore': {
      initializeFirestore: () => ({}), persistentLocalCache: () => ({}), persistentMultipleTabManager: () => ({}),
      doc: (_db, collection, id) => collection + '/' + id,
      onSnapshot(path, _options, callback) {
        listeners.set(path, callback);
        return () => { if (listeners.get(path) === callback) listeners.delete(path); };
      },
      serverTimestamp: () => 'timestamp',
      setDoc(path, value) {
        let resolve;
        const promise = new Promise(done => { resolve = done; });
        writes.push({ path, value, resolve });
        return promise;
      },
    },
  };
  const exports = {};
  runInNewContext(source, {
    exports, require: name => { assert.ok(modules[name], name); return modules[name]; },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
    },
    navigator: { onLine: true },
    window: {
      addEventListener() {}, removeEventListener() {},
      setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
      clearTimeout(id) { timers.delete(id); },
    },
  });
  const onRemoteData = remote => { data = remote; dirty = true; };
  function flush() {
    let remaining = 30;
    while (dirty) {
      assert.ok(remaining-- > 0, 'effects should settle');
      dirty = false; cursor = 0; effects = [];
      result = exports.useFirebaseSync({ data, localReady: true, onRemoteData });
      for (const effect of effects) effect();
    }
  }
  flush();
  return {
    storage, listeners, writes,
    get data() { return data; }, get state() { return result.state; },
    flush,
    auth() { authCallback(user); flush(); },
    edit(next) { data = next; dirty = true; flush(); },
    snapshot(path, value, fromCache = true, hasPendingWrites = false) {
      assert.ok(listeners.has(path), 'subscribed to ' + path);
      listeners.get(path)({ exists: () => value !== null, data: () => value, metadata: { fromCache, hasPendingWrites } });
      flush();
    },
    send() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
  };
}

function savedAccess(role = 'owner') {
  return new Map([[accessKey, JSON.stringify({ uid: user.uid, email: user.email, familyId: 'household', role })]]);
}

void test('known household subscribes immediately and a cache miss is not failed cloud setup', () => {
  const sync = createSync(log(['saved drive']), savedAccess());
  sync.auth();
  assert.ok(sync.listeners.has(familyPath), 'does not wait for an online access read');
  sync.snapshot(accessPath, null);
  sync.snapshot(familyPath, null);
  assert.equal(sync.state.status, 'offline');
  assert.deepEqual(sync.data, log(['saved drive']));
  sync.snapshot(familyPath, family(sync.data));
  assert.equal(sync.state.status, 'offline', 'a little signal is not server confirmation');
  sync.snapshot(familyPath, family(sync.data), false);
  assert.equal(sync.state.status, 'synced');
});

void test('edits made before auth and the first family snapshot survive and upload when ready', async () => {
  const sync = createSync(log(['old']), savedAccess());
  sync.edit(log(['old', 'new offline drive']));
  sync.auth();
  assert.ok(sync.storage.has(pendingKey));
  sync.snapshot(familyPath, family(log(['old'])));
  assert.deepEqual(sync.data, log(['old', 'new offline drive']));
  sync.send();
  assert.equal(sync.writes.length, 1, 'becoming cloud-ready schedules previously pending edits');
  assert.deepEqual(sync.writes[0].value.payload, sync.data);
  assert.notEqual(sync.state.status, 'synced');
  sync.writes[0].resolve();
  await Promise.resolve();
  sync.flush();
  assert.equal(sync.state.status, 'synced');
  assert.equal(sync.storage.has(pendingKey), false);
});

void test('reload recovers unsent edits and an old acknowledgement cannot clear a newer edit', async () => {
  const first = createSync(log(['old']), savedAccess());
  first.auth();
  first.edit(log(['old', 'unsent']));
  // Close before any family response or debounce write; only local storage survives.
  const sync = createSync(first.data, first.storage);
  sync.auth();
  sync.snapshot(familyPath, family(log(['old'])), false);
  assert.deepEqual(sync.data, log(['old', 'unsent']));
  sync.send();
  sync.edit(log(['old', 'unsent', 'newer']));
  sync.writes[0].resolve();
  await Promise.resolve();
  sync.flush();
  assert.equal(JSON.parse(sync.storage.get(pendingKey)).payloadJson, JSON.stringify(sync.data));
  assert.notEqual(sync.state.status, 'synced');
  sync.send();
  sync.writes[1].resolve();
  await Promise.resolve();
  sync.flush();
  assert.equal(sync.storage.has(pendingKey), false);
  assert.equal(sync.state.status, 'synced');
});

void test('view-only members receive the shared log but never upload local edits', () => {
  const sync = createSync(log(['local']), savedAccess('viewer'));
  sync.edit(log(['local', 'edit before auth']));
  sync.auth();
  sync.snapshot(familyPath, family(log(['shared']), true), false);
  sync.send();
  assert.deepEqual(sync.data, log(['shared']));
  assert.equal(sync.state.role, 'viewer');
  assert.equal(sync.writes.length, 0);
});
