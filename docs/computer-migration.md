# Moving development to another computer

Last reviewed: 2026-10-29. Intended destination: Piglet. This checklist documents what to preserve;
it does not itself export browser data, archive chat history, or copy credentials.

## What is already in Git

Source, commit history, package lockfile, Firebase client configuration and rules, Pages workflow, blank Colorado PDF,
verification HTML, README screenshot, tests, and project documentation are tracked. Clone the repository to get them.
If copying a checkout, include its hidden `.git` directory to retain history. Unpushed branches, local-only commits,
stashes, and untracked files do not come from a normal clone of GitHub.

Before moving, inspect:

```sh
git status --short
git status --short --ignored
git branch -vv
git stash list
git log --oneline origin/main..HEAD
```

Refresh remote refs with `git fetch origin` before relying on the final comparison. Review and commit only intended
project files, then push needed branches, or preserve the whole checkout privately. Do not use `git add .` blindly
when a folder may contain personal exports or credentials. The handoff and this checklist must also be committed
and pushed if Piglet will receive them through a clone rather than a file copy.

## Copy privately or recreate — never commit

Keep a private migration folder **outside this repository**, preferably on encrypted storage or transferred securely.
An ignored filename is not a security boundary: `.gitignore` does not protect a file already tracked or force-added.

| Item | What to do |
| --- | --- |
| Unsynced or local-only driving records | Use **Export → JSON backup** in each relevant browser/device. Label backups with device, origin, and date; localhost and the published site have separate storage. Keep the original browser intact until verified. |
| Original import examples | Preserve `drives_backup.json` (Driving Logger) and `2026-09-04_affidavit.pdf` (RoadReady), if still needed. Previously supplied from the iCloud Downloads folder. They may contain minors' names and driving history; keep private. |
| Original screenshot artwork | Optionally keep `driver-hours-screenshot.heic` and `driver-hours-screenshot.png` from Downloads/iCloud Downloads. The chosen README PNG is already in Git; originals are only needed for future editing. |
| Private environment files | If you later add `.env*`, transfer securely or recreate values from a password manager. No project `.env` file appeared in the migration inspection, and the current build does not require one. |
| GitHub/SSH and Firebase authentication | Prefer fresh sign-in and a new SSH key on Piglet. Authorize the key for GitHub. Do not commit private keys, CLI tokens, service-account JSON, cookies, or credential-store backups. |
| Editor preferences | Optionally transfer selected private IDE settings. `.idea/` is ignored. Reinstall extensions rather than copying dependency/build directories. |
| Development conversation | Keep any manually saved transcript or snapshot reference privately. It is not in Git and is not recreated by cloning. See below for snapshot limitations. |

The Firebase browser configuration checked into `lib/firebase-sync.ts` identifies the project; it is not a service-account
credential. Authorization still depends on Firebase Auth and Firestore rules. Do not replace it merely because the
development computer changed.

No original private sample file was copied or sanitized as part of this documentation update. A temporary Safari PDF
download path is not a durable archive; the blank DR2324 template needed by the app is already tracked in `public/forms/`.

### Browser data safety

Sign in to the same Google account on Piglet to access the existing synced household. Moving development does not
require exporting or recreating Firestore, changing family ownership, or re-inviting members. Firebase CLI login is
developer authorization; it is separate from signing into the app.

Keep JSON backups as insurance, but **do not routinely import an old backup after signing in**. Restoring a native JSON
backup replaces the current log on that device and in family sync; it could overwrite newer family records. First
compare drivers, sessions, and totals. Restore only deliberately, after also backing up the current log.
JSON exports do not migrate browser authentication, Firestore's pending-write queue, permissions, report preferences,
or every device-local setting. Keep the old browser/device until pending changes have actually synced or been
otherwise reconciled. Do not clear its site data as a migration step.

### Conversation history

The [development handoff](development-handoff.md) is the portable context for a fresh development chat, not a verbatim
archive. Do not assume copying the repo or signing in on Piglet transfers this local conversation.

An optional Codex **Share** snapshot can be attached to a new thread, but cannot fork the original thread. It omits
tool calls and their inputs/outputs and does not update with later messages. Personal-account links are readable by
anyone with the link; review for private names, paths, screenshots, and other sensitive content. Do not put the link
in this public repo. This is not a full-fidelity backup or a guarantee of resumable cross-computer history.
See [official snapshot documentation](https://learn.chatgpt.com/docs/use-chatgpt#share-a-read-only-snapshot-of-a-codex-thread).

If retaining the exact original application state matters, retain a private full-machine backup before retiring the
old computer. This guide does not prescribe copying undocumented internal Codex databases or authentication files
between installations; restoration compatibility is not established here.

## Do not bother copying generated files

Recreate `node_modules/`, `dist/`, `.next/`, `.vinext/`, `.wrangler/`, `out/`, `next-env.d.ts`, and `*.tsbuildinfo`.
Review ignored `outputs/` or `work/` folders yourself if used: they might contain private work worth preserving,
not just build caches. A clean Git status alone does not prove that all valuable local files are committed.

## Set up Piglet

1. Install Git and Node.js >=22.13.0 (Node 22 matches CI). Set your Git author name/email and authenticate to GitHub.
2. Clone, or copy the complete checkout including `.git`:

   ```sh
   git clone git@github.com:rharder/driver-permit-tracking.git
   cd driver-permit-tracking
   npm ci
   npm test
   npx tsc --noEmit
   npm run docs:states:check
   npm run build
   npm run dev
   ```

3. Open the local URL printed by the dev server. Use synthetic data for testing; localhost can connect to the real
   Firebase project when you sign in, so do not experiment destructively with a live family log.
4. If managing Firebase, install its CLI or use `npx firebase-tools login`. Confirm the selected project is
   `kids-money-tracker-f24be` via `.firebaserc`. Do not deploy rules just to move computers. When a rules deployment
   is actually intended, preserve the shared Kids Money Tracker rules and use `npx firebase-tools deploy --only firestore:rules`.
5. Existing GitHub Pages settings and Firebase data remain remote. Google sign-in needs authorized domains appropriate
   to the origin (`rharder.github.io` for production; check `localhost` if local sign-in fails). A different hostname
   or LAN address may need separate configuration; it is not implied by moving machines.
6. Read the [handoff](development-handoff.md), then check `git status` and confirm the expected commit is present.
   Verify builds, local UI, and access to private backups before retiring the original machine.

Pushing `main` triggers public deployment. Merely cloning or running locally does not deploy anything.
