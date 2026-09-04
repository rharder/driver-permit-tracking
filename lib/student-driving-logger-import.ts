import type { ParsedCsv } from './csv-import';

const APPLE_REFERENCE_DATE_OFFSET_SECONDS = 978_307_200;

type StudentDrivingLoggerRecord = {
  date: number;
  duration: string | number;
  name?: string;
  notes?: string;
  timeOfDay?: number;
  weather?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isStudentDrivingLoggerBackup(value: unknown): value is StudentDrivingLoggerRecord[] {
  return Array.isArray(value) && value.length > 0 && value.every((record) => isRecord(record)
    && typeof record.date === 'number'
    && (typeof record.duration === 'string' || typeof record.duration === 'number')
    && 'timeOfDay' in record
    && 'weather' in record);
}

function timeOfDayLabel(value: number | undefined, warnings: Set<string>) {
  if (value === 0) return 'Day';
  if (value === 1) return 'Night';
  warnings.add('One or more unfamiliar day/night codes were treated as day. Review those drives before importing.');
  return 'Day';
}

function weatherLabel(value: number | undefined, warnings: Set<string>) {
  const labels = ['Clear', 'Cloudy', 'Rain', 'Snow', 'Other'];
  if (Number.isInteger(value) && value !== undefined && value >= 0 && value < labels.length) return labels[value];
  warnings.add('One or more unfamiliar weather codes were treated as Other. Review those drives before importing.');
  return 'Other';
}

export function parseStudentDrivingLoggerBackup(value: unknown): ParsedCsv {
  if (!isStudentDrivingLoggerBackup(value)) {
    throw new Error('This JSON file is not a recognized Student Driving Logger backup.');
  }

  const warnings = new Set<string>();
  warnings.add('GPS route and distance data are not imported; Permit Hours only adds the driving log details.');
  const rows = value.map((record, index) => {
    const durationSeconds = Number(record.duration);
    const startMilliseconds = (record.date + APPLE_REFERENCE_DATE_OFFSET_SECONDS) * 1_000;
    const start = new Date(startMilliseconds);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 86_400) {
      throw new Error(`Drive ${index + 1} has an invalid duration.`);
    }
    if (!Number.isFinite(start.getTime()) || start.getUTCFullYear() < 2001 || start.getUTCFullYear() > 2100) {
      throw new Error(`Drive ${index + 1} has an invalid date.`);
    }
    const end = new Date(start.getTime() + durationSeconds * 1_000);
    return [
      typeof record.name === 'string' ? record.name.trim() : '',
      start.toISOString(),
      end.toISOString(),
      timeOfDayLabel(record.timeOfDay, warnings),
      weatherLabel(record.weather, warnings),
      typeof record.notes === 'string' ? record.notes.trim() : '',
    ];
  });

  return {
    headers: ['Driver', 'Start', 'End', 'Day or night', 'Weather', 'Notes'],
    rows,
    delimiter: 'JSON',
    warnings: [...warnings],
  };
}
