import assert from 'node:assert/strict';
import test from 'node:test';
import { copyInvitationText, createFamilyInvitation } from '../lib/family-invitation.ts';

test('supervisor invitations include the public app, exact account, role, and setup instructions', () => {
  const invitation = createFamilyInvitation({ email: ' Parent+Driving@Example.com ', role: 'supervisor', inviterName: ' Alex Rivera ' });
  assert.match(invitation.body, /^Alex Rivera has invited you/);
  assert.match(invitation.body, /Supervising adult/);
  assert.match(invitation.body, /start, stop, add, and edit drives/);
  assert.match(invitation.body, /https:\/\/rharder\.github\.io\/driver-permit-tracking\//);
  assert.match(invitation.body, /Continue with Google/);
  assert.match(invitation.body, /parent\+driving@example\.com/);
  assert.match(invitation.body, /Family sync/);
  assert.match(invitation.body, /Safari, tap Share, then Add to Home Screen/);
  assert.match(invitation.body, /first sign-in and sync/);
  assert.match(invitation.body, /different account/);
  assert.doesNotMatch(invitation.text, /localhost|Permit Miles|token=/);
});

test('view-only invitation describes reading access without promising editing', () => {
  const { body } = createFamilyInvitation({ email: 'teen@example.com', role: 'viewer' });
  assert.match(body, /^You have been invited/);
  assert.match(body, /Your role: View only/);
  assert.match(body, /progress, goals, and history without changing the log/);
  assert.doesNotMatch(body, /You can start|undefined|null/);
});

test('mailto safely encodes the recipient, subject, and full body with email line endings', () => {
  const invitation = createFamilyInvitation({ email: 'parent+practice@example.com', role: 'supervisor', inviterName: 'Zoë & Sam? #1' });
  const mailto = new URL(invitation.mailto);
  assert.equal(mailto.protocol, 'mailto:');
  assert.equal(decodeURIComponent(mailto.pathname), 'parent+practice@example.com');
  assert.deepEqual([...mailto.searchParams.keys()], ['subject', 'body']);
  assert.equal(mailto.searchParams.get('subject'), invitation.subject);
  assert.equal(mailto.searchParams.get('body'), invitation.body.replace(/\n/g, '\r\n'));
  assert.equal(invitation.text, `${invitation.subject}\n\n${invitation.body}`);
  assert.equal(mailto.hash, '');
});

test('configured deployment links are included for other installations', () => {
  const { body } = createFamilyInvitation({ email: 'teen@example.com', role: 'viewer', appUrl: 'https://example.com/permit-hours/' });
  assert.match(body, /https:\/\/example\.com\/permit-hours\//);
  assert.doesNotMatch(body, /rharder\.github\.io/);
});

test('copy writes the complete invitation and only reports success after the clipboard resolves', async () => {
  const invitation = createFamilyInvitation({ email: 'teen@example.com', role: 'viewer' });
  let copied;
  let finishCopy;
  const pending = new Promise((resolve) => { finishCopy = resolve; });
  const clipboard = { async writeText(text) { copied = text; await pending; } };
  let finished = false;
  const result = copyInvitationText(invitation.text, clipboard).then((value) => { finished = true; return value; });
  assert.equal(copied, invitation.text);
  await Promise.resolve();
  assert.equal(finished, false);
  finishCopy();
  assert.equal(await result, true);
});

test('missing or blocked clipboard access selects the manual-copy fallback', async () => {
  assert.equal(await copyInvitationText('Invitation'), false);
  assert.equal(await copyInvitationText('Invitation', { async writeText() { throw new Error('NotAllowedError'); } }), false);
  assert.equal(await copyInvitationText('Invitation', { writeText() { throw new Error('Clipboard unavailable'); } }), false);
});
