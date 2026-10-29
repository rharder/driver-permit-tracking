import test from 'node:test';
import assert from 'node:assert/strict';
import { appVersionLabel } from '../lib/app-version.ts';

void test('published versions use the first seven characters of the build commit', () => {
  assert.equal(appVersionLabel('c56e5642c7e1004d7c2a92c3012cf52385146068'), 'Version c56e564');
  assert.equal(appVersionLabel('44d036a1234567890123456789012345678901234'), 'Version 44d036a');
});

void test('local builds are clearly labeled rather than claiming a published version', () => {
  assert.equal(appVersionLabel(), 'Development version');
  assert.equal(appVersionLabel('development'), 'Development version');
  assert.equal(appVersionLabel(''), 'Development version');
});
