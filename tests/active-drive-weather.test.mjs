import assert from 'node:assert/strict';
import test from 'node:test';
import { updateActiveDriveWeather } from '../lib/active-drive-weather.ts';
import { isPoorWeather } from '../lib/practice-goals.ts';

const active = { driverId: 'kevin', start: '2026-10-08T17:00:00Z', period: 'night', weather: 'Clear', poorWeather: false, challenging: true };

test('weather can change mid-drive without restarting the timer or changing driver and period', () => {
  const updated = updateActiveDriveWeather(active, 'kevin', 'Rain', false);
  assert.deepEqual(updated, { ...active, weather: 'Rain', poorWeather: undefined });
  assert.equal(active.weather, 'Clear');
  const restored = JSON.parse(JSON.stringify(updated));
  assert.equal(restored.weather, 'Rain');
  assert.equal(restored.start, active.start);
  assert.equal(isPoorWeather(restored), true);
  assert.equal(isPoorWeather(updateActiveDriveWeather(updated, 'kevin', 'Clear', false)), false);
});

test('viewers, other drivers, and ended drives cannot be changed', () => {
  assert.equal(updateActiveDriveWeather(active, 'kevin', 'Snow', true), active);
  assert.equal(updateActiveDriveWeather(active, 'claire', 'Snow', false), active);
  assert.equal(updateActiveDriveWeather(null, 'kevin', 'Snow', false), null);
});
