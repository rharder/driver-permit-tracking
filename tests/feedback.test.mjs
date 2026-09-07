import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDBACK_ISSUES_URL, FEEDBACK_PROMPT, NEW_FEEDBACK_URL } from '../lib/feedback.ts';

void test('feedback opens a draft at this repository, without auto-posting or requesting labels', () => {
  assert.equal(FEEDBACK_ISSUES_URL, 'https://github.com/rharder/driver-permit-tracking/issues');
  const url = new URL(NEW_FEEDBACK_URL);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/rharder/driver-permit-tracking/issues/new');
  assert.deepEqual([...url.searchParams.keys()], ['body']);
  assert.equal(url.searchParams.get('body'), FEEDBACK_PROMPT);
});

void test('generic prompts cover ideas and bugs and warn against exposing driving data', () => {
  assert.match(FEEDBACK_PROMPT, /idea, question/);
  assert.match(FEEDBACK_PROMPT, /Steps to reproduce/);
  assert.match(FEEDBACK_PROMPT, /will be public/);
  assert.match(FEEDBACK_PROMPT, /Do not include driver names, email addresses, permit numbers, driving-log exports/);
  assert.match(FEEDBACK_PROMPT, /screenshots showing personal information/);
});
