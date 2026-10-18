import assert from 'node:assert/strict';
import test from 'node:test';
import { checkpointLocalLog, createAppUpdateCoordinator, UPDATE_IDLE_MS } from '../lib/app-updates.ts';
import { checkpointSyncForReload } from '../lib/sync-status.ts';

function fixture() {
  const state = { time: 0, visible: true, busy: false, durable: true, checks: 0, checkpoints: 0, reloads: 0, ready: false };
  const coordinator = createAppUpdateCoordinator({
    runningVersion: 'old', now: () => state.time, visible: () => state.visible,
    check: () => { state.checks++; }, canReload: () => !state.busy,
    checkpoint: () => { state.checkpoints++; return state.durable; },
    reload: () => { state.reloads++; }, onReady: value => { state.ready = value; },
  });
  return { state, coordinator, downloaded: () => coordinator.receive({ type: 'APP_UPDATE_READY', version: 'new' }) };
}

test('background checks are throttled and never run while hidden', () => {
  const { state, coordinator } = fixture();
  coordinator.check(); coordinator.check(); assert.equal(state.checks, 1);
  state.time = 60_000; coordinator.check(); assert.equal(state.checks, 2);
  state.visible = false; coordinator.check(true); assert.equal(state.checks, 2);
  state.visible = true; coordinator.check(true); assert.equal(state.checks, 3);
  assert.equal(state.reloads, 0, 'a check alone never reloads');
});

test('only a completed different build is eligible, after an idle pause', () => {
  const { state, coordinator, downloaded } = fixture();
  for (const message of [null, {}, { type: 'APP_UPDATE_READY', version: 'old' }, { type: 'APP_UPDATE_READY', version: 'development' }, { type: 'APP_UPDATE_READY', version: {} }]) coordinator.receive(message);
  assert.equal(state.ready, false);
  downloaded(); coordinator.apply(); assert.equal(state.reloads, 0);
  state.time = UPDATE_IDLE_MS; coordinator.apply(); coordinator.apply();
  assert.equal(state.reloads, 1); assert.equal(state.checkpoints, 1);
});

test('hidden app, open edits, ongoing interaction and failed storage defer updates', () => {
  const { state, coordinator, downloaded } = fixture();
  downloaded(); state.time = UPDATE_IDLE_MS;
  state.visible = false; coordinator.apply(); assert.equal(state.reloads, 0);
  state.visible = true; state.busy = true; coordinator.apply(); assert.equal(state.reloads, 0);
  state.busy = false; coordinator.interact(); coordinator.apply(); assert.equal(state.reloads, 0);
  state.time += UPDATE_IDLE_MS; state.durable = false; coordinator.apply(); assert.equal(state.reloads, 0);
  state.durable = true; coordinator.apply(); assert.equal(state.reloads, 1);
});

test('repeated notifications do not indefinitely postpone applying a downloaded update', () => {
  const { state, coordinator, downloaded } = fixture();
  downloaded(); state.time = UPDATE_IDLE_MS; downloaded(); coordinator.apply();
  assert.equal(state.reloads, 1);
});

test('checkpoint preserves an active drive and unsynced history byte-for-byte before reloading', () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) ?? null };
  const data = { version: 1, drivers: [{ id: 'kevin' }], selectedId: 'kevin', sessions: [{ id: 'not-yet-uploaded' }], active: { driverId: 'kevin', start: '2026-10-18T18:00:00Z', period: 'night', weather: 'Rain', challenging: true } };
  let syncSaved = false;
  assert.equal(checkpointLocalLog(storage, 'log', data, () => { syncSaved = true; return true; }), true);
  const reopened = JSON.parse(storage.getItem('log'));
  assert.deepEqual(reopened, data);
  assert.equal(Date.parse('2026-10-18T18:20:00Z') - Date.parse(reopened.active.start), 20 * 60_000);
  assert.equal(syncSaved, true);
  assert.equal(checkpointLocalLog(storage, 'log', data, () => false), false);
  assert.equal(checkpointLocalLog({ ...storage, setItem: () => { throw new Error('Quota'); } }, 'log', data, () => true), false);
  assert.equal(checkpointLocalLog({ ...storage, getItem: () => 'stale' }, 'log', data, () => true), false);
  storage.setItem('log', 'another tab saved a newer log');
  assert.equal(checkpointLocalLog(storage, 'log', data, () => true), false);
  assert.equal(storage.getItem('log'), 'another tab saved a newer log');
});

test('cloud reload checkpoint protects dirty changes without turning stale snapshots into uploads', () => {
  const state = { localReady: true, authReady: true, payloadJson: 'current-drive', observedPayloadJson: 'current-drive', uid: 'parent', familyId: 'family', role: 'supervisor', dirty: true };
  const writes = [];
  const persist = (...args) => { writes.push(args); return true; };
  assert.equal(checkpointSyncForReload(state, persist), true);
  assert.deepEqual(writes, [['parent', 'family', 'current-drive']]);
  writes.length = 0;
  for (const patch of [{ dirty: false }, { uid: null, familyId: null, role: null }, { role: 'viewer' }]) assert.equal(checkpointSyncForReload({ ...state, ...patch }, persist), true);
  assert.equal(writes.length, 0);
  for (const patch of [{ authReady: false }, { localReady: false }, { familyId: null }, { role: null }, { observedPayloadJson: 'older-drive' }]) assert.equal(checkpointSyncForReload({ ...state, ...patch }, persist), false);
  assert.equal(checkpointSyncForReload(state, () => false), false);
  assert.equal(checkpointSyncForReload(state, () => { throw new Error('Storage full'); }), false);
});
