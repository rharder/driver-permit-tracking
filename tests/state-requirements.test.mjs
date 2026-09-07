import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STATE_REQUIREMENTS, statePresets, presetGoals } from '../lib/state-requirements.ts';
import { practiceError } from '../lib/practice-goals.ts';
import { documentPath, renderStateRequirements } from '../scripts/state-requirements-doc.mjs';

void test('reference covers every state and DC exactly once with sources and review dates', () => {
  const codes = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ').sort();
  assert.deepEqual(STATE_REQUIREMENTS.map(state => state.code).sort(), codes);
  for (const state of STATE_REQUIREMENTS) {
    assert.ok(state.name && state.appliesTo && state.notes.length && state.sources.length);
    assert.match(state.reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
    for (const source of state.sources) assert.ok(new URL(source.url).protocol === 'https:' && source.label);
    for (const preset of statePresets(state)) {
      if (preset.totalHours === null) continue;
      assert.equal(practiceError(presetGoals(state, preset, 'America/Denver', preset.requiresStart ? '2026-09-01T12:00:00Z' : undefined)), null, `${state.code}: ${preset.label}`);
    }
  }
});

void test('special categories, daily limit, and Colorado default are distinct', () => {
  const by = Object.fromEntries(STATE_REQUIREMENTS.map(state => [state.code, state]));
  assert.equal(by.CO.totalHours, 50);
  assert.equal(by.CO.nightHours, 10);
  assert.equal(by.AK.challengingHours, 10);
  assert.equal(by.AK.nightHours, null);
  assert.equal(by.PA.poorWeatherHours, 5);
  assert.equal(by.SD.poorWeatherHours, 10);
  assert.equal(by.TX.maxMinutesPerDay, 60);
  for (const code of ['HI', 'ID', 'WA']) assert.equal(by[code].dayHours, 40);
  assert.equal(by.OR.alternativePresets[0].totalHours, 50);
});

void test('later-stage presets require an explicit start rather than reusing earlier practice', () => {
  for (const code of ['DC', 'NC']) {
    const state = STATE_REQUIREMENTS.find(item => item.code === code);
    const preset = state.alternativePresets[0];
    assert.throws(() => presetGoals(state, preset, 'America/Denver'), /stage began/);
    assert.equal(presetGoals(state, preset, 'America/Denver', '2026-09-01T00:00:00Z').practice.countFrom, '2026-09-01T00:00:00Z');
  }
  const state = STATE_REQUIREMENTS.find(item => item.code === 'AR');
  assert.throws(() => presetGoals(state, statePresets(state)[0], 'UTC'), /personal goals/);
});

void test('readable state document stays in sync with the app dataset', () => {
  assert.equal(readFileSync(documentPath, 'utf8'), renderStateRequirements());
});
