import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvImport, suggestCsvMapping, normalizeCsvRows } from '../lib/csv-import.ts';

const options = { dateFormat: 'auto', durationUnit: 'minutes', defaultDriver: 'Test', defaultStartTime: '12:00', defaultPeriod: 'day', defaultWeather: 'Clear' };
const csv = 'driver,start,end,minutes,day_or_night,weather,notes,poor_weather,other_challenging\nTest,2026-09-01T17:00:30.123Z,2026-09-01T17:20:30.123Z,20,night,Rain,Test drive,false,true';

void test('CSV condition flags and absolute timestamps round-trip without timezone or second loss', () => {
  const parsed = parseCsvImport(csv);
  const mapping = suggestCsvMapping(parsed);
  const [result] = normalizeCsvRows(parsed, mapping, options);
  assert.equal(result.error, '');
  assert.equal(result.candidate.start, '2026-09-01T17:00:30.123Z');
  assert.equal(result.candidate.end, '2026-09-01T17:20:30.123Z');
  assert.equal(result.candidate.poorWeather, false);
  assert.equal(result.candidate.challenging, true);
  assert.equal(result.candidate.period, 'night');
  assert.equal(result.candidate.weather, 'Rain');
});

void test('old CSVs and remembered mappings without condition fields still import', () => {
  const parsed = parseCsvImport('driver,start,end,weather\nTest,2026-09-01T17:00:00Z,2026-09-01T17:20:00Z,Rain');
  const mapping = suggestCsvMapping(parsed);
  assert.equal(mapping.poorWeather, null);
  assert.equal(mapping.challenging, null);
  delete mapping.poorWeather;
  delete mapping.challenging;
  const [result] = normalizeCsvRows(parsed, mapping, options);
  assert.equal(result.error, '');
  assert.equal(result.candidate.poorWeather, undefined);
});

void test('unknown flag values are reported instead of silently changing conditions', () => {
  const parsed = parseCsvImport(csv.replace('false,true', 'maybe,true'));
  assert.match(normalizeCsvRows(parsed, suggestCsvMapping(parsed), options)[0].error, /Condition flags/);
});
