# Permit Hours

Permit Hours is an offline-first teen driving-hours tracker. It supports multiple drivers, one-tap timers, day/night goals, weather conditions, editable entries, family sync, role-based access, and JSON/CSV exports.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

The included GitHub Actions workflow builds and publishes the app whenever `main` is pushed. In the repository settings, set **Pages → Source** to **GitHub Actions**.

The Firebase Authentication authorized-domain list must include `rharder.github.io` for Google sign-in on the published site.

## Firebase sync and access

The app uses the existing `kids-money-tracker-f24be` Firebase project but stores its data in a separate `permitHourFamilies/main` document. Deploy the checked-in rules before using cloud sync:

```bash
npx firebase-tools deploy --only firestore:rules
```

The first Google account to create the Permit Hours household becomes its owner and uploads the current local log. The owner can add exact Google-account email addresses as either:

- **Supervising adults**, who can start, stop, add, and edit drives.
- **View-only members**, intended for teen drivers who should be able to follow progress without changing the log.

Only the owner can add or remove household access. The rules file also retains the existing Kids Money Tracker rules because both apps share the same Firebase project.

## Data and privacy

Driving data is always stored in the browser first. When signed in, Firestore also keeps a persistent local cache and automatically sends queued changes after connectivity returns. Export JSON regularly as an additional backup, especially before clearing browser storage.
