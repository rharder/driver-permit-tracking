export const FEEDBACK_ISSUES_URL = 'https://github.com/rharder/driver-permit-tracking/issues';

// Static prompts only. Never include account details, URLs with user data, or log exports.
export const FEEDBACK_PROMPT = `## Feedback
Describe your idea, question, or the problem you encountered.

## If reporting a problem
What were you trying to do?
What happened, and what did you expect instead?
Steps to reproduce:

Device and browser (optional):
Were you online or offline?

Please review before submitting: this issue will be public. Do not include driver names, email addresses, permit numbers, driving-log exports, or screenshots showing personal information.`;

const newIssueUrl = new URL(`${FEEDBACK_ISSUES_URL}/new`);
newIssueUrl.searchParams.set('body', FEEDBACK_PROMPT);
export const NEW_FEEDBACK_URL = newIssueUrl.toString();
