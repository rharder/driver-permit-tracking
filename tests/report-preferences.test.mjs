import assert from 'node:assert/strict';
import test from 'node:test';
import { createReportPreferences, REPORT_PREFERENCE_KEY } from '../lib/report-preferences.ts';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('first opening chooses a matching state form, otherwise general', () => {
  const preferences = createReportPreferences(memoryStorage);
  assert.equal(preferences.read('CO'), 'colorado-dr2324');
  assert.equal(preferences.read('co'), 'colorado-dr2324');
  assert.equal(preferences.read('NY'), 'general');
  assert.equal(preferences.read(), 'general');
});

test('last choice persists across dialog openings and reloads, overriding state', () => {
  const storage = memoryStorage();
  const preferences = createReportPreferences(() => storage);
  preferences.remember(preferences.read('CO'));
  assert.equal(preferences.read('NY'), 'colorado-dr2324');
  preferences.remember('general');
  assert.equal(preferences.read('CO'), 'general');
  const reloaded = createReportPreferences(() => storage);
  assert.equal(reloaded.read('CO'), 'general');
  reloaded.remember('colorado-dr2324');
  assert.equal(preferences.read(), 'colorado-dr2324');
});

test('obsolete or malformed saved formats fall back safely', () => {
  const storage = memoryStorage();
  const preferences = createReportPreferences(() => storage);
  for (const value of ['removed-state-form', '', '{broken']) {
    storage.setItem(REPORT_PREFERENCE_KEY, value);
    assert.equal(preferences.read('CO'), 'colorado-dr2324');
    assert.equal(preferences.read(), 'general');
  }
});

test('blocked browser storage never prevents printing and retains session choice', () => {
  const preferences = createReportPreferences(() => { throw new Error('Blocked storage'); });
  assert.equal(preferences.read('CO'), 'colorado-dr2324');
  assert.doesNotThrow(() => preferences.remember('general'));
  assert.equal(preferences.read('CO'), 'general');
});

test('write-only failures still remember the selection during this session', () => {
  const preferences = createReportPreferences(() => ({ getItem: () => 'colorado-dr2324', setItem: () => { throw new Error('Quota exceeded'); } }));
  preferences.remember('general');
  assert.equal(preferences.read('CO'), 'general');
});
