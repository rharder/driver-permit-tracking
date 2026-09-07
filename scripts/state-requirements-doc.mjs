import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('../', import.meta.url);
export const documentPath = new URL('docs/state-driving-requirements.md', root);
export const requirements = JSON.parse(readFileSync(new URL('data/state-requirements.json', root), 'utf8'));

const hours = value => value == null || value === 0 ? 'No separate quota listed' : `${value}h`;
const extras = preset => [
  preset.dayHours ? `${preset.dayHours}h daytime` : '',
  preset.poorWeatherHours ? `${preset.poorWeatherHours}h poor weather` : '',
  preset.challengingHours ? `${preset.challengingHours}h challenging conditions` : '',
  preset.maxMinutesPerDay ? `${preset.maxMinutesPerDay} counted min/day` : '',
  preset.requiresStart ? 'New stage: start date required' : '',
].filter(Boolean).join('; ') || '—';

export function renderStateRequirements(records = requirements) {
  const lines = [
    '# State supervised-driving requirements', '',
    'An offline reference for the typical teen, noncommercial passenger-car licensing route in all 50 states and the District of Columbia. Each entry includes its scope, sources, and review date. This is a dated summary, not legal advice or a determination of license eligibility. Verify current requirements with the state licensing agency.', '',
    'These are supervised-practice goals, not a complete licensing checklist. Age, permit dates, driver education, professional instruction, observation, supervisor qualifications, holding periods, curfews, weekly limits, and required state forms can change what applies. “No separate quota listed” does not mean nighttime practice is unnecessary. No fixed total means use a personal goal, not zero driving.', '',
    '## Using the app', '',
    'Choose **State requirements & presets** beside Driving Goals, or **Look up state requirements** in Driver Settings. Browsing never changes data. Apply a preset, review the editable goals, and save the driver. Existing Colorado defaults and existing logs stay unchanged until you choose new goals.', '',
    '- Track total, daytime, nighttime, poor-weather, and challenging-condition goals separately. A zero category goal disables that target.',
    '- Poor weather defaults to Rain/Snow; you can mark other qualifying weather or correct an entry. Challenging hours count night OR poor weather OR a manually marked challenge, once per practice interval. Review state definitions; the app cannot certify conditions. Split entries when conditions change.',
    '- A daily cap credits the earliest recorded practice first, across all categories, in the saved IANA time zone. Choose the correct zone in Driver Settings. The Texas preset uses 60 minutes per day; additional driving remains in history. The app does not enforce weekly limits or validate overlapping entries.',
    '- Later-stage presets require a start date/time. Only practice after that instant counts; earlier history remains intact. One goal profile is active per driver at a time. Switching profiles changes the progress view, not the log.',
    '- Progress uses the least-complete enabled goal, so a completed total does not hide missing nighttime or condition hours.',
    '- JSON backups preserve settings and condition tags. CSV preserves drives and condition tags, not driver settings. Printed reports distinguish full recorded time from time counted toward current goals.',
    '- Reference data works offline after the app has been loaded and cached. Source links need internet. Goals and tags use the existing local-first family sync.', '',
    '## State index', '',
    '| State | Total practice | Night | Additional tracking | Reviewed |',
    '| --- | --- | --- | --- | --- |',
    ...records.map(state => `| [${state.name}](#${state.code.toLowerCase()}) | ${state.totalHours == null ? 'No fixed minimum listed' : `${state.totalHours}h`} | ${hours(state.nightHours)} | ${extras(state)} | ${state.reviewedOn} |`), '',
  ];
  for (const state of records) {
    lines.push(`<a id="${state.code.toLowerCase()}"></a>`, '', `## ${state.name}`, '',
      `Scope: ${state.appliesTo}. Reviewed: ${state.reviewedOn}.`, '',
      `Default preset: ${state.totalHours == null ? 'personal goals (no fixed practice minimum listed)' : `${state.totalHours}h total`}; night: ${hours(state.nightHours)}.`, '',
      ...state.notes.map(note => `- ${note}`), '');
    if (extras(state) !== '—') lines.push(`Additional tracking: ${extras(state)}.`, '');
    if (state.alternativePresets?.length) lines.push('Alternate presets:', '', ...state.alternativePresets.map(preset => `- ${preset.label}: ${preset.totalHours}h total; night: ${hours(preset.nightHours)}.${extras(preset) !== '—' ? ` ${extras(preset)}.` : ''}`), '');
    lines.push('Sources:', '', ...state.sources.map(source => `- [${source.label}](${source.url})`), '');
  }
  lines.push('## Maintaining this reference', '',
    'The canonical source is `data/state-requirements.json`. The app imports that file; this document is generated from it. Do not edit the state summaries here directly.', '',
    '1. Check the linked licensing agency pages and forms for the specific age, permit issue date, education route, and licensing stage. Prefer official guidance; record discrepancies or unresolved conditions in the notes instead of guessing.',
    '2. Update the relevant entry, source links, and `reviewedOn` date. Use `null` for an unspecified numeric quota, not an invented zero-hour legal requirement. Document alternate routes and whether a new stage requires a fresh counting window.',
    '3. Keep tracked fields distinct: `totalHours`, `nightHours`, `dayHours`, `poorWeatherHours`, `challengingHours`, and `maxMinutesPerDay`. Never turn an OR requirement into two required quotas or silently combine separate stages.',
    '4. Run `npm run docs:states` to regenerate this document. Run `npm test`, `npm run docs:states:check`, `npx tsc --noEmit`, and `npm run lint` before committing both data and documentation.',
    '5. Publish the app update. Existing drivers retain their saved goals until a supervising adult reviews and reapplies a preset. Updating the reference must not silently alter a family’s goals.', '');
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const content = renderStateRequirements();
  if (process.argv.includes('--check')) {
    if (readFileSync(documentPath, 'utf8') !== content) throw new Error('State documentation is stale. Run npm run docs:states.');
    console.log('State reference matches the canonical dataset.');
  } else {
    writeFileSync(documentPath, content);
    console.log('Updated docs/state-driving-requirements.md');
  }
}
