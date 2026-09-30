# Printable report formats

The print dialog offers a general Permit Hours report and independently implemented state forms.
The general report is not government-issued or a guarantee of agency acceptance. State selection only
suggests a format; every format remains selectable. Without a supported state, general is the default.
All generators run on-device and include completed drives, not goal-limited credits or active timers.

## Adding a state form

1. Obtain the current blank PDF from the issuing agency. Record the source URL and revision in the
   metadata/description and document any restrictions. Never check in a completed personal form.
2. Add its asset under `public/forms/` with a versioned filename. Inspect the pages and AcroForm
   field names, including parent/kid widgets. Preserve the official artwork and leave signatures blank.
3. Add one entry to `lib/report-formats.ts`: stable ID, label, two-letter state code, description,
   usage notice, filename prefix, and all required same-origin assets. Asset paths start with `/`.
   `REPORT_ASSETS` automatically supplies layout preloads; the service worker caches these before
   promoting the new app shell. Do not fetch forms from a remote agency during report generation.
4. Implement a generator accepting the shared types from `lib/report-types.ts`. Register it in
   `lib/report-pdf.ts`. The exhaustive mapping makes a missing generator a TypeScript error.
   Use static imports so the generator ships with the offline app. No dialog changes are needed.
5. Add tests for zero drives, page boundaries, day/night and total reconciliation, cross-midnight
   entries, long notes, independent repeated-page fields, and blank signing fields. Validate canonical
   field values AND widget appearances. Render representative PDFs and inspect every page.
6. Run `npm test`, `npx tsc --noEmit`, and the GitHub Pages build. Verify that each asset appears in
   built HTML with the repository base path. Bump the service-worker cache version and its tests.

## Existing formats

- **General:** `lib/general-log-pdf.ts`; Letter-size monochrome report, totals, chronological history,
  continuation rows, page numbering, editable identity fields, and certification/signature area.
- **Colorado DR2324:** `lib/dr2324-pdf.ts`; original revision 08/25/26 supplied from
  https://dmv.colorado.gov/sites/dmv/files/documents/DR_2324_e_wo.pdf.

Times are displayed in the device's local timezone. Durations retain whole seconds and discard
subsecond fractions per drive. Both current generators use Helvetica and reject unsupported characters
with a visible error rather than silently removing content. Blank fields can be completed in a PDF editor
or by hand; signatures are never generated. The general form does not assert licensing eligibility.
