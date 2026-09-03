# Permit Miles

Permit Miles is an offline-first teen driving-hours tracker. It supports multiple drivers, one-tap timers, day/night goals, weather conditions, editable entries, and JSON/CSV exports without requiring an account.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

The included GitHub Actions workflow builds and publishes the app whenever `main` is pushed. In the repository settings, set **Pages → Source** to **GitHub Actions**.

## Data and privacy

Driving data is stored only in the browser on the current device. Export JSON regularly as a backup, especially before clearing browser storage or changing devices. Cloud sync is intentionally left for a later phase because it requires a shared backend and an access model for parents and read-only teen accounts.
