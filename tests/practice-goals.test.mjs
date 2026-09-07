import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePractice, isPoorWeather, practiceError, validConditionFlags } from '../lib/practice-goals.ts';

const hour = 3_600_000;
const base = { totalGoal: 50, nightGoal: 10 };
function drive(id, start, minutes, extras = {}) {
  return { id, start: new Date(start).toISOString(), end: new Date(Date.parse(start) + minutes * 60_000).toISOString(), period: 'day', weather: 'Clear', ...extras };
}

void test('existing total/night logs need no migration; source records are untouched', () => {
  const drives = [drive('a', '2026-09-01T10:00Z', 60), drive('b', '2026-09-01T20:00Z', 30, { period: 'night' })];
  const before = structuredClone(drives);
  const result = calculatePractice(drives, base);
  assert.equal(result.counted.total, 1.5 * hour);
  assert.equal(result.counted.night, .5 * hour);
  assert.deepEqual(result.goals.map(goal => goal.key), ['total', 'night']);
  assert.deepEqual(drives, before);
});

void test('night, poor weather and other challenges form a union, not an added total', () => {
  const drives = [
    drive('both', '2026-09-01T20:00Z', 60, { period: 'night', weather: 'Rain', challenging: true }),
    drive('day-rain', '2026-09-02T10:00Z', 60, { weather: 'Rain' }),
    drive('other', '2026-09-03T10:00Z', 60, { challenging: true }),
    drive('clear', '2026-09-04T10:00Z', 60),
  ];
  const { counted } = calculatePractice(drives, { totalGoal: 40, nightGoal: 0, practice: { challengingGoal: 10 } });
  assert.equal(counted.total, 4 * hour);
  assert.equal(counted.challenging, 3 * hour);
  assert.equal(counted.poorWeather, 2 * hour);
  assert.equal(counted.day + counted.night, counted.total);
});

void test('poor-weather inference supports explicit true and false overrides', () => {
  assert.equal(isPoorWeather({ weather: 'Snow' }), true);
  assert.equal(isPoorWeather({ weather: 'Rain', poorWeather: false }), false);
  assert.equal(isPoorWeather({ weather: 'Other', poorWeather: true }), true);
  assert.equal(isPoorWeather({ weather: 'Cloudy' }), false);
});

void test('overall completion requires every goal and never rounds an incomplete goal to 100%', () => {
  const drives = [drive('a', '2026-09-01T10:00Z', 60)];
  const result = calculatePractice(drives, { totalGoal: 1, nightGoal: .5 });
  assert.equal(result.goals[0].percent, 100);
  assert.equal(result.percent, 0);
  assert.equal(result.complete, false);
  assert.equal(calculatePractice([drive('b', '2026-09-01T10:00Z', 59.999)], { totalGoal: 1, nightGoal: 0 }).percent, 99);
});

void test('daytime and weather quotas can remain incomplete after total and night goals are met', () => {
  const result = calculatePractice([drive('a', '2026-09-01T10:00Z', 120, { period: 'night' })], { totalGoal: 2, nightGoal: 1, practice: { dayGoal: 1, poorWeatherGoal: .5 } });
  assert.equal(result.goals.find(goal => goal.key === 'day').met, false);
  assert.equal(result.goals.find(goal => goal.key === 'poorWeather').met, false);
  assert.equal(result.complete, false);
});

void test('daily cap is shared across categories, chronological, and independent of input order', () => {
  const driver = { ...base, practice: { maxMinutesPerDay: 60, timeZone: 'America/Chicago' } };
  const early = drive('early', '2026-09-01T12:00:00Z', 45);
  const late = drive('late', '2026-09-02T01:00:00Z', 45, { period: 'night', weather: 'Rain' });
  const result = calculatePractice([late, early], driver);
  assert.equal(result.creditedById.early, .75 * hour);
  assert.equal(result.creditedById.late, .25 * hour);
  assert.equal(result.counted.total, hour);
  assert.equal(result.counted.night, .25 * hour);
  assert.equal(result.counted.poorWeather, .25 * hour);
  assert.deepEqual(result, calculatePractice([early, late], driver));
});

void test('a drive crossing local midnight receives each day’s remaining allowance', () => {
  const driver = { ...base, practice: { maxMinutesPerDay: 60, timeZone: 'America/Chicago' } };
  const result = calculatePractice([
    drive('earlier', '2026-09-01T20:00Z', 60),
    drive('midnight', '2026-09-02T04:30Z', 90, { period: 'night' }),
  ], driver);
  assert.equal(result.counted.total, 2 * hour);
  assert.equal(result.counted.night, hour);
  assert.equal(result.creditedById.midnight, hour);
});

void test('daily boundaries handle spring and fall daylight-saving transitions', () => {
  const driver = { ...base, practice: { maxMinutesPerDay: 60, timeZone: 'America/Denver' } };
  for (const [start, minutes] of [['2026-03-08T07:00Z', 23 * 60 + 30], ['2026-11-01T06:00Z', 25 * 60 + 30]]) {
    assert.equal(calculatePractice([drive('dst', start, minutes)], driver).counted.total, 1.5 * hour);
  }
});

void test('stage cutoff excludes older drives and clips a crossing drive without deleting anything', () => {
  const drives = [drive('old', '2026-08-01T10:00Z', 60), drive('crossing', '2026-09-01T10:00Z', 60), drive('after', '2026-09-02T10:00Z', 60)];
  const driver = { ...base, practice: { countFrom: '2026-09-01T10:30:00Z' } };
  const { counted, creditedById } = calculatePractice(drives, driver);
  assert.equal(counted.total, 1.5 * hour);
  assert.equal(creditedById.old, 0);
  assert.equal(creditedById.crossing, .5 * hour);
  assert.equal(drives.length, 3);
  assert.equal(calculatePractice(drives, base).counted.total, 3 * hour);
});

void test('fractional minutes are retained; invalid entries cannot poison totals', () => {
  const result = calculatePractice([drive('valid', '2026-09-01T10:00Z', .5), { id: 'bad', start: 'bad', end: 'bad' }], base);
  assert.equal(result.counted.total, 30_000);
  assert.equal(result.creditedById.bad, 0);
});

void test('settings reject contradictory goals and invalid dates, zones, caps, or flags', () => {
  assert.equal(practiceError(base), null);
  assert.ok(practiceError({ totalGoal: 10, nightGoal: 11 }));
  assert.ok(practiceError({ totalGoal: 10, nightGoal: 5, practice: { dayGoal: 6 } }));
  for (const practice of [{ poorWeatherGoal: -1 }, { challengingGoal: Infinity }, { maxMinutesPerDay: 1441 }, { maxMinutesPerDay: 60 }, { timeZone: 'not-a-zone' }, { countFrom: 'bad' }, { stateCode: 42 }, []]) assert.ok(practiceError({ ...base, practice }));
  assert.equal(practiceError({ ...base, practice: { maxMinutesPerDay: 60, timeZone: 'America/Chicago', countFrom: '2026-09-01T00:00:00Z' } }), null);
  assert.equal(validConditionFlags({ poorWeather: 'false' }), false);
  assert.equal(validConditionFlags({ poorWeather: false, challenging: true }), true);
});
