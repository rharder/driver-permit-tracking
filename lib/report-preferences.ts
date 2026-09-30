import { REPORT_FORMATS, suggestedReportFormat, type ReportFormatId } from './report-formats.ts';

export const REPORT_PREFERENCE_KEY = 'permit-hours-report-format-v1';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
const isFormat = (value: unknown): value is ReportFormatId => REPORT_FORMATS.some(format => format.id === value);

export function createReportPreferences(storage: () => PreferenceStorage) {
  // Keep the choice for this session even when private browsing blocks storage.
  let sessionChoice: ReportFormatId | undefined;
  let writeFailed = false;
  return {
    read(stateCode?: string): ReportFormatId {
      if (writeFailed && sessionChoice) return sessionChoice;
      try {
        const saved = storage().getItem(REPORT_PREFERENCE_KEY);
        return isFormat(saved) ? saved : (saved === null ? sessionChoice : undefined) ?? suggestedReportFormat(stateCode);
      } catch {
        return sessionChoice ?? suggestedReportFormat(stateCode);
      }
    },
    remember(format: ReportFormatId) {
      sessionChoice = format;
      try { storage().setItem(REPORT_PREFERENCE_KEY, format); writeFailed = false; }
      catch { writeFailed = true; /* Printing must remain available without persistent storage. */ }
    },
  };
}

export const reportPreferences = createReportPreferences(() => window.localStorage);
