import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appVersionLabel } from '../lib/app-version.ts';

void test('published versions increase with the deployment workflow run number and retain the commit', () => {
  assert.equal(appVersionLabel('c56e5642c7e1004d7c2a92c3012cf52385146068', '41'), 'Version 41 · c56e564');
  assert.equal(appVersionLabel('44d036a1234567890123456789012345678901234', '42'), 'Version 42 · 44d036a');
});

void test('build configuration uses the workflow number and keeps it across deployment retries', () => {
  const build = 'c56e5642c7e1004d7c2a92c3012cf52385146068';
  for (const attempt of ['1', '2']) {
    const label = execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
      import config from './next.config.ts';
      import { appVersionLabel } from './lib/app-version.ts';
      console.log(appVersionLabel(config.env.NEXT_PUBLIC_APP_BUILD, config.env.NEXT_PUBLIC_APP_VERSION));
    `], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, GITHUB_SHA: build, GITHUB_RUN_NUMBER: '41', GITHUB_RUN_ATTEMPT: attempt },
      encoding: 'utf8',
    });
    assert.equal(label.trim(), 'Version 41 · c56e564');
  }
});

void test('builds without a workflow run number fall back to their commit', () => {
  assert.equal(appVersionLabel('c56e5642c7e1004d7c2a92c3012cf52385146068'), 'Version c56e564');
  assert.equal(appVersionLabel('44d036a1234567890123456789012345678901234'), 'Version 44d036a');
  assert.equal(appVersionLabel('c56e5642c7e1004d7c2a92c3012cf52385146068', ''), 'Version c56e564');
});

void test('local builds are clearly labeled rather than claiming a published version', () => {
  assert.equal(appVersionLabel(), 'Development version');
  assert.equal(appVersionLabel('development'), 'Development version');
  assert.equal(appVersionLabel(''), 'Development version');
  assert.equal(appVersionLabel('development', '42'), 'Development version');
});
