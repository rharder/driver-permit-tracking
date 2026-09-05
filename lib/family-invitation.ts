export type InvitedRole = 'supervisor' | 'viewer';

type InvitationOptions = {
  email: string;
  role: InvitedRole;
  inviterName?: string | null;
  appUrl?: string;
};

export function createFamilyInvitation({
  email,
  role,
  inviterName,
  // Never use the current browser URL: it may be localhost or include sign-in parameters.
  appUrl = 'https://rharder.github.io/driver-permit-tracking/',
}: InvitationOptions) {
  const recipient = email.trim().toLowerCase();
  const name = inviterName?.trim();
  const subject = 'Join our family on Permit Hours';
  const access = role === 'supervisor'
    ? 'Your role: Supervising adult. You can start, stop, add, and edit drives.'
    : 'Your role: View only. You can follow driving progress, goals, and history without changing the log.';
  const body = [
    name
      ? `${name} has invited you to join their family driving log in Permit Hours.`
      : 'You have been invited to join a family driving log in Permit Hours.',
    access,
    `Open Permit Hours: ${appUrl}`,
    `To join, open the cloud button (Family sync), choose "Continue with Google", and sign in with this exact account: ${recipient}. Your family log will connect automatically.`,
    'Connect to the internet for your first sign-in and sync. After that, the log stays available offline; changes made by supervising adults sync when reconnected.',
    'Optional on iPhone: open the app link in Safari, tap Share, then Add to Home Screen.',
    'This invitation does not give access to other Google accounts. If you are signed in with a different account, sign out of Family sync and use the account above.',
  ].join('\n\n');

  return {
    subject,
    body,
    text: `${subject}\n\n${body}`,
    mailto: `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`,
  };
}

export async function copyInvitationText(text: string, clipboard?: Pick<Clipboard, 'writeText'>) {
  try {
    if (!clipboard) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    // Safari, embedded browsers, or denied permissions may require manual selection.
    return false;
  }
}
