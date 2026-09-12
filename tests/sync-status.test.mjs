import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesPendingUpload, snapshotSyncStatus } from '../lib/sync-status.ts';

void test('a cached snapshot is never called synced, even if the device has a signal', () => {
  for (const hasPendingWrites of [true, false]) {
    assert.equal(snapshotSyncStatus({ fromCache: true, hasPendingWrites }, 'owner').status, 'offline');
  }
  assert.match(snapshotSyncStatus({ fromCache: true, hasPendingWrites: false }, 'viewer').message, /view only/);
});

void test('server confirmation and no pending writes are both required for synced', () => {
  assert.equal(snapshotSyncStatus({ fromCache: false, hasPendingWrites: true }, 'supervisor').status, 'saving');
  assert.equal(snapshotSyncStatus({ fromCache: false, hasPendingWrites: false }, 'supervisor').status, 'synced');
  assert.equal(snapshotSyncStatus({ fromCache: false, hasPendingWrites: false }, 'viewer').message, 'View only');
});

void test('pending upload recovery and acknowledgements are bound to the exact account, family and revision', () => {
  const raw = JSON.stringify({ uid: 'parent', familyId: 'family-a', payloadJson: '{"sessions":["unsent drive"]}' });
  assert.equal(matchesPendingUpload(raw, 'parent', 'family-a', '{"sessions":["unsent drive"]}'), true);
  assert.equal(matchesPendingUpload(raw, 'other-parent', 'family-a', '{"sessions":["unsent drive"]}'), false);
  assert.equal(matchesPendingUpload(raw, 'parent', 'family-b', '{"sessions":["unsent drive"]}'), false);
  assert.equal(matchesPendingUpload(raw, 'parent', 'family-a', '{"sessions":[]}'), false);
  assert.equal(matchesPendingUpload('invalid', 'parent', 'family-a', ''), false);
});
