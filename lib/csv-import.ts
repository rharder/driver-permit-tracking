import Papa from 'papaparse';

export type ImportField = 'driver' | 'date' | 'start' | 'end' | 'duration' | 'period' | 'weather' | 'details' | 'notes';
export type CsvMapping = Record<ImportField, number | null>;
export type ImportDateFormat = 'auto' | 'mdy' | 'dmy' | 'ymd';
export type ImportDurationUnit = 'auto' | 'minutes' | 'hours';

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
  delimiter: string;
  warnings: string[];
};

export type ImportOptions = {
  dateFormat: ImportDateFormat;
  durationUnit: ImportDurationUnit;
  defaultDriver: string;
  defaultStartTime: string;
  defaultPeriod: 'day' | 'night';
  defaultWeather: 'Clear' | 'Cloudy' | 'Rain' | 'Snow' | 'Other';
};

export type ImportCandidate = {
  sourceRow: number;
  driverName: string;
  start: string;
  end: string;
  period: 'day' | 'night';
  weather: 'Clear' | 'Cloudy' | 'Rain' | 'Snow' | 'Other';
  notes: string;
};

export type ImportRowResult = {
  sourceRow: number;
  candidate: ImportCandidate | null;
  error: string;
};

export type ImportPreset = {
  id: string;
  label: string;
  hint: string;
  filenameHints: string[];
  aliases?: Partial<Record<ImportField, string[]>>;
};

export const IMPORT_FIELDS: Array<{ id: ImportField; label: string; detail: string }> = [
  { id: 'driver', label: 'Driver', detail: 'Optional when importing for one selected driver' },
  { id: 'date', label: 'Date', detail: 'Use when the date is separate from the start time' },
  { id: 'start', label: 'Start', detail: 'A time or a complete start date and time' },
  { id: 'end', label: 'End', detail: 'A time or a complete end date and time' },
  { id: 'duration', label: 'Duration', detail: 'Used when an end time is not available' },
  { id: 'period', label: 'Day or night', detail: 'Optional; a default can be applied' },
  { id: 'weather', label: 'Weather', detail: 'Optional; a default can be applied' },
  { id: 'details', label: 'Road or skill details', detail: 'Optional; combined into the drive notes' },
  { id: 'notes', label: 'Notes', detail: 'Optional comments or road details' },
];

const BASE_ALIASES: Record<ImportField, string[]> = {
  driver: ['driver', 'driver name', 'student', 'student name', 'teen', 'learner', 'learner name'],
  date: ['date', 'drive date', 'trip date', 'session date'],
  start: ['start', 'started', 'start time', 'start date', 'start datetime', 'departure', 'begin time'],
  end: ['end', 'ended', 'end time', 'end date', 'end datetime', 'arrival', 'finish time', 'stop time'],
  duration: ['duration', 'minutes', 'mins', 'elapsed', 'elapsed time', 'drive time', 'time driven', 'practice duration', 'total time'],
  period: ['day or night', 'day night', 'day/night', 'time of day', 'lighting', 'night driving', 'daytime nighttime'],
  weather: ['weather', 'conditions', 'weather conditions', 'condition'],
  details: ['road type', 'road', 'route', 'skills practiced', 'skills', 'practice area', 'driving environment'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
};

export const IMPORT_PRESETS: ImportPreset[] = [
  {
    id: 'auto',
    label: 'Auto-detect',
    hint: 'Permit Hours will inspect the headings and sample values, then you can adjust every suggestion before importing.',
    filenameHints: [],
  },
  {
    id: 'permit-hours',
    label: 'Permit Hours backup',
    hint: 'Recognizes Permit Hours exports with driver, start, end, minutes, day_or_night, weather, and notes columns.',
    filenameHints: ['permit-hours'],
  },
  {
    id: 'roadready',
    label: 'RoadReady table',
    hint: 'RoadReady currently exports a PDF table with Date, Time, Duration, Weather, Road Type, Day/Night, and Notes. Choose this after saving or converting that table to CSV.',
    filenameHints: ['roadready', 'road-ready'],
    aliases: {
      start: ['time'],
      details: ['road type'],
      notes: ['notes'],
    },
  },
  {
    id: 'teen-driving-log',
    label: 'Teen Driving Log',
    hint: 'Teen Driving Log creates drivinglog.csv backups. Its published help identifies Start Date and End Date columns; other columns will be suggested when present.',
    filenameHints: ['drivinglog', 'teen-driving-log'],
    aliases: {
      start: ['start date'],
      end: ['end date'],
    },
  },
  {
    id: 'driving-logger',
    label: 'Student Driving Logger',
    hint: 'Student Driving Logger documents PDF and app-backup exports, but does not publish a stable CSV schema. Auto-detect will inspect any CSV conversion and leave uncertain fields for you to map.',
    filenameHints: ['student-driving-logger', 'driving-logger'],
  },
  {
    id: 'generic',
    label: 'Other app or spreadsheet',
    hint: 'Map any CSV or spreadsheet export that includes a date plus either start/end times or a duration.',
    filenameHints: [],
  },
];

function normalized(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9/ ]+/g, '').replace(/\s+/g, ' ').trim();
}

export function parseCsvImport(text: string): ParsedCsv {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), {
    delimiter: '',
    skipEmptyLines: 'greedy',
  });
  const rows = parsed.data.map((row) => row.map((cell) => String(cell ?? '').trim()));
  if (rows.length < 2) throw new Error('The CSV file does not contain a header and at least one drive.');
  const headers = rows[0].map((header, index) => header || `Column ${index + 1}`);
  const warnings = parsed.errors.slice(0, 5).map((error) => `Row ${(error.row ?? 0) + 1}: ${error.message}`);
  return { headers, rows: rows.slice(1), delimiter: parsed.meta.delimiter || ',', warnings };
}

export function detectImportPreset(fileName: string, headers: string[]) {
  const name = normalized(fileName);
  const joinedHeaders = headers.map(normalized).join('|');
  if (name.includes('permit hours') || joinedHeaders.includes('day or night') && joinedHeaders.includes('driver')) return 'permit-hours';
  if (name.includes('roadready') || joinedHeaders.includes('road type') && joinedHeaders.includes('day/night')) return 'roadready';
  if (name.includes('drivinglog') || joinedHeaders.includes('start date') && joinedHeaders.includes('end date')) return 'teen-driving-log';
  return 'auto';
}

function headerScore(header: string, aliases: string[]) {
  const candidate = normalized(header);
  let best = 0;
  aliases.forEach((alias) => {
    const expected = normalized(alias);
    if (candidate === expected) best = Math.max(best, 100);
    else if (candidate.includes(expected)) best = Math.max(best, 78);
    else {
      const expectedTokens = new Set(expected.split(' '));
      const candidateTokens = new Set(candidate.split(' '));
      const overlap = [...candidateTokens].filter((token) => expectedTokens.has(token)).length;
      if (overlap) best = Math.max(best, 25 + overlap * 12);
    }
  });
  return best;
}

function sampleScore(field: ImportField, values: string[]) {
  const nonEmpty = values.map((value) => value.trim()).filter(Boolean).slice(0, 8);
  if (!nonEmpty.length) return 0;
  const ratio = (predicate: (value: string) => boolean) => nonEmpty.filter(predicate).length / nonEmpty.length;
  if (field === 'period') return ratio((value) => /^(day|night|daytime|nighttime)$/i.test(value)) * 55;
  if (field === 'weather') return ratio((value) => /^(clear|sunny|normal|cloudy|overcast|rain|rainy|wet|snow|snowy|ice|other)$/i.test(value)) * 50;
  if (field === 'duration') return ratio((value) => /^\d+(?:\.\d+)?$/.test(value) || /(?:hr|hour|min|:)/i.test(value)) * 25;
  if (field === 'date' || field === 'start' || field === 'end') return ratio((value) => /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|\d{1,2}:\d{2}|\b(?:am|pm)\b/i.test(value)) * 18;
  return 0;
}

export function suggestCsvMapping(parsed: ParsedCsv, presetId = 'auto'): CsvMapping {
  const preset = IMPORT_PRESETS.find((item) => item.id === presetId);
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((field) => [field.id, null])) as CsvMapping;
  const used = new Set<number>();
  const fieldOrder: ImportField[] = ['period', 'weather', 'duration', 'end', 'start', 'date', 'driver', 'details', 'notes'];

  fieldOrder.forEach((field) => {
    const aliases = [...(preset?.aliases?.[field] ?? []), ...BASE_ALIASES[field]];
    let bestIndex: number | null = null;
    let bestScore = 0;
    parsed.headers.forEach((header, index) => {
      if (used.has(index)) return;
      const values = parsed.rows.map((row) => row[index] ?? '');
      const preferredNotesHeader = field === 'notes' && normalized(header) === 'notes' ? 20 : 0;
      const score = headerScore(header, aliases) + sampleScore(field, values) + preferredNotesHeader;
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });
    if (bestIndex !== null && bestScore >= 70) {
      mapping[field] = bestIndex;
      used.add(bestIndex);
    }
  });
  return mapping;
}

function parseTime(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59 || hour > (meridiem ? 12 : 23) || hour < 0) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  return { hour, minute };
}

function dateParts(value: string, format: ImportDateFormat) {
  const raw = value.trim();
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    const date = new Date(Math.round((serial - 25569) * 86_400_000));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), trailing: '' };
  }
  let match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T,\s]+(.+))?$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), trailing: match[4] ?? '' };
  match = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:[T,\s]+(.+))?$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    const resolved = format === 'dmy' || format === 'auto' && first > 12
      ? { month: second, day: first }
      : { month: first, day: second };
    return { year, ...resolved, trailing: match[4] ?? '' };
  }
  const fallback = new Date(raw);
  if (!Number.isFinite(fallback.getTime())) return null;
  return { year: fallback.getFullYear(), month: fallback.getMonth() + 1, day: fallback.getDate(), trailing: '' };
}

function buildLocalDate(dateValue: string, timeValue: string, format: ImportDateFormat) {
  const date = dateParts(dateValue, format);
  const time = parseTime(timeValue || date?.trailing || '00:00');
  if (!date || !time || date.month < 1 || date.month > 12 || date.day < 1 || date.day > 31) return null;
  const result = new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0);
  if (result.getFullYear() !== date.year || result.getMonth() !== date.month - 1 || result.getDate() !== date.day) return null;
  return result;
}

function includesDate(value: string) {
  return /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}|[A-Za-z]{3,9}\s+\d{1,2}/.test(value);
}

function parseDateTime(dateValue: string, timeOrDateTime: string, format: ImportDateFormat, fallbackTime = '') {
  const source = timeOrDateTime.trim();
  if (source && includesDate(source)) {
    const split = source.match(/^(.*?\d{1,4})(?:[T,\s]+)(.+)$/);
    if (split) return buildLocalDate(split[1], split[2], format);
    return buildLocalDate(source, fallbackTime, format);
  }
  return buildLocalDate(dateValue, source || fallbackTime, format);
}

function parseDuration(value: string, unit: ImportDurationUnit) {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const amount = Number(raw);
    return Math.round((unit === 'hours' ? amount * 60 : amount));
  }
  const clock = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const hours = Number(raw.match(/([\d.]+)\s*(?:h|hr|hrs|hour|hours)/)?.[1] ?? 0);
  const minutes = Number(raw.match(/([\d.]+)\s*(?:m|min|mins|minute|minutes)/)?.[1] ?? 0);
  const total = Math.round(hours * 60 + minutes);
  return total || null;
}

function normalizePeriod(value: string, fallback: 'day' | 'night') {
  const raw = normalized(value);
  if (/night|dark/.test(raw)) return 'night' as const;
  if (/day|light/.test(raw)) return 'day' as const;
  return fallback;
}

function normalizeWeather(value: string, fallback: ImportOptions['defaultWeather']) {
  const raw = normalized(value);
  if (!raw) return fallback;
  if (/snow|ice|sleet/.test(raw)) return 'Snow' as const;
  if (/rain|wet|storm/.test(raw)) return 'Rain' as const;
  if (/cloud|overcast|fog/.test(raw)) return 'Cloudy' as const;
  if (/clear|sun|normal|fair/.test(raw)) return 'Clear' as const;
  return 'Other' as const;
}

export function normalizeCsvRows(parsed: ParsedCsv, mapping: CsvMapping, options: ImportOptions): ImportRowResult[] {
  const value = (row: string[], field: ImportField) => mapping[field] === null ? '' : row[mapping[field]!] ?? '';
  return parsed.rows.map((row, index) => {
    const sourceRow = index + 2;
    const driverName = value(row, 'driver').trim() || options.defaultDriver.trim();
    if (!driverName) return { sourceRow, candidate: null, error: 'Choose a driver column or enter a default driver.' };

    const dateValue = value(row, 'date');
    const startValue = value(row, 'start');
    const start = parseDateTime(dateValue, startValue, options.dateFormat, options.defaultStartTime);
    if (!start) return { sourceRow, candidate: null, error: 'Could not read the date and start time.' };

    const endValue = value(row, 'end');
    const startDateFallback = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    let end = endValue ? parseDateTime(dateValue || startDateFallback, endValue, options.dateFormat) : null;
    if (end && !includesDate(endValue) && end <= start) end = new Date(end.getTime() + 86_400_000);
    if (!end) {
      const minutes = parseDuration(value(row, 'duration'), options.durationUnit);
      if (!minutes || minutes <= 0 || minutes > 1_440) return { sourceRow, candidate: null, error: 'Choose a valid end time or duration between 1 minute and 24 hours.' };
      end = new Date(start.getTime() + minutes * 60_000);
    }
    if (end <= start || end.getTime() - start.getTime() > 86_400_000) return { sourceRow, candidate: null, error: 'The end time must be after the start and within 24 hours.' };

    const candidate: ImportCandidate = {
      sourceRow,
      driverName,
      start: start.toISOString(),
      end: end.toISOString(),
      period: normalizePeriod(value(row, 'period'), options.defaultPeriod),
      weather: normalizeWeather(value(row, 'weather'), options.defaultWeather),
      notes: [value(row, 'notes').trim(), value(row, 'details').trim()].filter(Boolean).join(' · '),
    };
    return { sourceRow, candidate, error: '' };
  });
}

export function mappingKey(headers: string[]) {
  return headers.map(normalized).join('\u001f');
}
