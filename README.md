# Permit Hours

Permit Hours is a teen driving-hours tracker to help you track your teen's progress toward a drivers license. It
supports offline access, multiple drivers, one-tap timers, day/night goals, weather conditions, manual entries, family
sync, role-based access, exporting, and importing of popular driving log formats.

<img src="docs/permit-hours-mobile.png" alt="Permit Hours in an iPhone frame, showing driver selection, start-drive controls, and progress" width="360">

## State requirements and flexible goals

Look up all **50 states and DC** from Driving Goals or Driver Settings, with source links, review dates, and editable
presets. [The maintained state reference](docs/state-driving-requirements.md) lists every state and explains how to update
the shared dataset. Verify current requirements with your licensing agency; these summaries are not a complete licensing checklist.

Each driver can track total, daytime, nighttime, poor-weather, and challenging-condition goals, with an optional stage
start date and daily counted-minute limit. Full drive history is always retained; progress and printed reports distinguish
recorded time from counted time. JSON backups include the goal settings; JSON and CSV exports preserve condition tags.
The reference and tracking work offline, and changes use the existing family sync. Colorado’s 50-total/10-night defaults
stay unchanged unless you choose another preset.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

The included GitHub Actions workflow builds and publishes the app whenever `main` is pushed. In the repository settings,
set **Pages → Source** to **GitHub Actions**.

The Firebase Authentication authorized-domain list must include `rharder.github.io` for Google sign-in on the published
site.

## Firebase sync and access

The app uses the existing `kids-money-tracker-f24be` Firebase project but stores its data in separate
`permitHourFamilies` and `permitHourAccess` collections. Each household has an isolated document keyed by its owner’s
Firebase user ID. Deploy the checked-in rules before using cloud sync:

```bash
npx firebase-tools deploy --only firestore:rules
```

Any Google account can create its own independent Permit Hours household, become its owner, and upload its current local
log. The owner can add exact Google-account email addresses as either:

- **Supervising adults**, who can start, stop, add, and edit drives.
- **View-only members**, intended for teen drivers who should be able to follow progress without changing the log.

Only the owner can add or remove household access. The rules file also retains the existing Kids Money Tracker rules
because both apps share the same Firebase project.

After adding a member, choose **Email invitation** to open a prefilled draft in your mail app, or **Copy invitation** to
paste it into an email or message. Nothing is sent automatically. Invitations include the app link, access role, the exact
Google account to sign in with, and iPhone Home Screen instructions. Use **Invite** beside an existing member to share
their invitation again. If clipboard access is unavailable, the app shows selectable invitation text for manual copying.
Adding access requires an internet connection; copying invitations for existing members works offline.

## Data and privacy

### Starting with weak or no signal

After a successful first load, the app opens its cached copy immediately—even if a network request is hanging.
It reads your saved log on the device first and syncs separately in the background. A signal indicator alone never
means the family log is synced: that status requires a server-backed snapshot or an acknowledged upload.

App updates download in the background. The cached page is replaced only after its required scripts and styles are
fully cached; failed or stalled downloads leave the last working copy intact. The updated app is used on a later
open/reload, never by interrupting an active drive. PDF import files are cached separately and do not delay startup.

Open the app once with a working connection to install the offline copy (and to receive this startup improvement).
A new browser or a device whose browser storage was cleared needs another successful load. Keep JSON backups;
browser storage can be evicted by the operating system. Do not clear website data as a connection troubleshooting step.

### Saved driving data

Driving data is always stored in the browser first. When signed in, Firestore also keeps a persistent local cache and
automatically sends queued changes after connectivity returns. Export JSON regularly as an additional backup, especially
before clearing browser storage.

## Feedback

Choose **Feedback** beneath Driving Goals (or on the initial setup screen) to open a new issue or browse
[existing feedback](https://github.com/rharder/driver-permit-tracking/issues). Use it for bugs, ideas, and questions.
Posting requires a GitHub account and an internet connection; browsing does not require an account. Issues are public.
The app provides generic writing prompts but never automatically attaches account details or driving data. Remove personal
information from descriptions and screenshots before posting. Feedback is not queued while offline.
