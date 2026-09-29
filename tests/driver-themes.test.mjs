import assert from 'node:assert/strict';
import test from 'node:test';
import { DRIVER_THEMES, assignDriverThemes, driverTheme, nextDriverTheme } from '../lib/driver-themes.ts';

test('legacy drivers receive distinct defaults without mutating records', () => {
  const drivers = [{ id: 'a' }, { id: 'b' }, { id: 'c', theme: 'unknown' }];
  const original = JSON.stringify(drivers);
  const result = assignDriverThemes(drivers);
  assert.deepEqual(result.map(driver => driver.theme), ['green', 'blue', 'purple']);
  assert.equal(JSON.stringify(drivers), original);
  assert.equal(nextDriverTheme(drivers), 'amber');
});

test('explicit choices are reserved, preserved across JSON, and stable after removal', () => {
  const drivers = assignDriverThemes([{ id: 'a' }, { id: 'b', theme: 'green' }, { id: 'c', theme: 'purple' }]);
  assert.deepEqual(drivers.map(driver => driver.theme), ['blue', 'green', 'purple']);
  const saved = JSON.parse(JSON.stringify(drivers));
  assert.deepEqual(assignDriverThemes(saved), drivers);
  assert.deepEqual(assignDriverThemes(saved.slice(1)).map(driver => driver.theme), ['green', 'purple']);
  assert.equal(nextDriverTheme(saved), 'amber');
});

test('new drivers use unused colors first, then the least-used color', () => {
  const drivers = [];
  for (let i = 0; i < DRIVER_THEMES.length; i++) drivers.push({ theme: nextDriverTheme(drivers) });
  assert.equal(new Set(drivers.map(driver => driver.theme)).size, DRIVER_THEMES.length);
  drivers.push({ theme: 'green' });
  assert.equal(nextDriverTheme(drivers), 'blue');
  assert.equal(driverTheme('untrusted-css-value').id, 'green');
});

test('every Start Drive color provides at least 4.5:1 contrast with white text', () => {
  for (const theme of DRIVER_THEMES) {
    const [r, g, b] = theme.color.slice(1).match(/../g).map(hex => {
      const value = parseInt(hex, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    assert.ok(1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05) >= 4.5, theme.name);
  }
});
