import { createDr2324Pdf } from './dr2324-pdf.ts';
import { createGeneralLogPdf } from './general-log-pdf.ts';
import type { ReportFormatId } from './report-formats.ts';
import type { PrintableDrive, PrintableDriver } from './report-types.ts';

type Generator = (driver: PrintableDriver, sessions: readonly PrintableDrive[], assets: readonly Uint8Array[]) => Promise<Uint8Array>;
// Exhaustive mapping: adding metadata requires a corresponding generator here.
const generators: Record<ReportFormatId, Generator> = {
  general: (driver, sessions) => createGeneralLogPdf(driver, sessions),
  'colorado-dr2324': (driver, sessions, assets) => createDr2324Pdf(assets[0], driver, sessions),
};
export function createReportPdf(format: ReportFormatId, driver: PrintableDriver, sessions: readonly PrintableDrive[], assets: readonly Uint8Array[] = []) {
  return generators[format](driver, sessions, assets);
}
