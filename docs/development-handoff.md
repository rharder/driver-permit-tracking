# Development handoff

Last reviewed: 2026-10-29. This is a maintained project summary, not a complete chat transcript.
See [computer migration](computer-migration.md) for private backups and setup on Piglet or another computer.

## Product and deployment

Permit Hours tracks supervised teen driving time, not mileage. It supports multiple drivers, Google family sync,
offline use, imports, backups, and printable reports. It must remain responsive in very poor reception.

- Repository: https://github.com/rharder/driver-permit-tracking
- Production: https://rharder.github.io/driver-permit-tracking/
- Deployment: `.github/workflows/deploy-pages.yml` publishes pushes to `main` using GitHub Pages.
- Stack: React 19, TypeScript, Vinext/Vite, Firebase Auth and Firestore, PDF-lib, PDF.js, Papa Parse.
- GitHub Pages is the intended host. Legacy Sites/Cloudflare tooling in the repo is not an instruction to migrate hosting.
- Node requirement: >=22.13.0; CI uses Node 22. Install reproducibly with `npm ci`.

## Code map

| Area | Starting points |
| --- | --- |
| Main interface, local log, dialogs, import/export | `app/page.tsx` |
| Goal calculations and daily/stage counting | `lib/practice-goals.ts` |
| State presets and maintained reference | `lib/state-requirements.ts`, `docs/state-driving-requirements.md` |
| Family auth, roles, offline upload checkpoint | `lib/firebase-sync.ts`, `lib/sync-status.ts`, `firestore.rules` |
| Offline shell and background updates | `public/sw.js`, `lib/use-app-updates.ts`, `lib/app-updates.ts`, `scripts/prepare-offline.mjs` |
| Report registry and generators | `lib/report-formats.ts`, `lib/report-pdf.ts`, `lib/general-log-pdf.ts`, `lib/dr2324-pdf.ts` |
| Import adapters | `lib/csv-import.ts`, `lib/student-driving-logger-import.ts`, `lib/roadready-pdf-import.ts` |
| Driver colors, invitation drafts, feedback | `lib/driver-themes.ts`, `lib/family-invitation.ts`, `lib/feedback.ts` |
| Regression tests | `tests/*.test.mjs` |

## Behaviors and constraints to preserve

### Offline-first operation and safe updates

Startup must use the cached shell and locally saved log immediately; do not wait for Firebase or a network timeout.
Connectivity alone does not establish a synced state: require a server-backed snapshot or acknowledged upload.
Do not clear website data, delete the installed PWA, or rename storage keys as an update fix.
The legacy `permit-miles-data-v1` local-storage key is intentional despite the Permit Hours branding.

Production updates check in the background on launch, return to foreground, reconnect, and every five minutes while
visible. Cache required build assets before committing new HTML. Preserve the old working shell on failed downloads.
Build versions use the Git commit SHA; the build script includes generated chunks in the offline asset list.

A downloaded update may reload after ten seconds of idle time, even during a drive. Before reload, verify that the
latest local log is durably saved and that pending family changes are safely checkpointed. Open forms, imports,
account actions, or failed checkpoints defer reload. Preserve account/family binding of pending uploads, avoid
overwriting newer data from another tab, and retain the reload-loop guard. The active drive's original timestamp
survives reload; elapsed time is recomputed, not restarted. iOS suspension is expected; no background execution guarantee.

### Driving data and progress

- Multiple driver profiles, but only one active drive at a time in the log. Weather remains editable during a drive.
- Driver names can start as first names; allow a full legal name for reports. Normal driver tabs use the first name
  and completed hours truncated to an integer, such as `1h`.
- Six driver color themes; new drivers get an unused color, or the least-used color if necessary. Keep primary button
  text readable and mobile dialog close controls reachable.
- Defaults: 50 total hours, including 10 nighttime hours. Goals and state presets are editable; not legal eligibility advice.
- Preserve full history when stage-start dates or daily caps limit credited progress. Day/night are exclusive;
  weather/challenging categories may overlap. Daily counting uses the saved IANA time zone, including DST.
- Overall percentage is NOT the least-complete category percentage. Compute remaining required time as the maximum
  of total deficit, combined day-plus-night deficits, poor-weather deficit, and challenging-condition deficit.
  Subtract that from the total-hour target, divide by that target, and floor the percentage. Clamp to 0–99 until
  every goal is met; then show 100. For a 50-total/10-night goal: 5 daytime hours = 10%; 45 daytime/0 night = 80%;
  45 daytime/5 night = 90%. Individual category bars still show their own progress.

### Sync, imports, and reports

- Firebase project `kids-money-tracker-f24be` is shared with Kids Money Tracker. Permit Hours uses
  `permitHourFamilies` and `permitHourAccess`. Preserve the other app's rules when editing/deploying `firestore.rules`.
- Any Google account can own an independent household. Owners manage access; supervising adults edit logs;
  view-only members cannot. Invitations use prefilled email drafts or copyable text, not automatic email delivery.
- JSON is the full app-log backup; CSV is interchange, not a complete restore. Native JSON restoration replaces
  the current log, including in family sync. Preview/confirm imports; keep raw source files privately.
- Supported import paths include flexible delimited files, Driving Logger JSON, and RoadReady PDF exports.
  Do not add personally identifiable source exports as public test fixtures; sanitize first.
- General report is professional but not government-issued. Colorado DR2324 is a state form, not national.
  The official blank template is tracked at `public/forms/dr2324-2026.pdf` (revision 08/25/26).
- Reports use all recorded drives, not capped/stage-filtered progress. Leave signatures/certification fields blank.
  Offer Open PDF and Download PDF for Safari instead of relying only on `window.print()`.
- Remember the report selection on the device; initially choose a supported state form when known, otherwise general.
  See [report format guide](report-formats.md) to add a new form and its offline assets.
- Feedback links to public GitHub issues; never automatically attach personal driving records or account details.

## Validation and deployment

```sh
npm ci
npm test
npx tsc --noEmit
npm run docs:states:check
npm run build
```

For state dataset changes, run `npm run docs:states` and review the generated reference.
For reports, follow the visual/field validation checklist in `docs/report-formats.md`.
For offline/update changes, also test a production build: development mode does not install the production update handler.
Exercise offline reopen, a hanging/weak network, return to foreground, update during an active drive, unsynced edits,
and an open form. Automated checks do not replace testing Safari and the installed iPhone PWA.

Pushing `main` deploys publicly. The Pages workflow handles the project-site asset path relocation; do not omit it
when changing the build. Firebase rules deploy separately. Verify the Actions result and live build after deployment.

## Recent history anchors

Use `git show <commit>` for exact implementation and tests; this list is not a release log.

- `44d036a`: overall progress constrained by remaining required categories.
- `f51e5bd`: safe automatic PWA updates without losing offline drives.
- `083bbf4`: weather changes during an active drive.
- `9e82aa1`: remembered report selection.
- `be15b5d`: professional general report and extensible state form registry.

The initial feature ideas are historical input, not an authoritative list of unfinished work.
The repository does not contain the full development conversation or all original private sample files.
When starting a new chat, ask it to read this file, the README, and the relevant tests before making changes.
