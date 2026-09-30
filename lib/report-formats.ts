/** Metadata is shared by the picker and offline asset preloads. Keep generators separate. */
export const REPORT_FORMATS = [
  {
    id: 'general', label: 'General driving log', stateCode: null,
    description: 'Professional summary, complete driving history, and parent or supervisor certification.',
    notice: 'A Permit Hours report, not a government-issued form. Confirm acceptance and any additional requirements with your licensing agency.',
    filename: 'driving-log', assets: [] as readonly string[],
  },
  {
    id: 'colorado-dr2324', label: 'Colorado · DR2324', stateCode: 'CO',
    description: 'Official Colorado Drive Time Log Sheet · revision 08/25/26.',
    notice: 'The original Colorado form layout is preserved. Complete the permit number, verifier initials, and adult name, signature, and date.',
    filename: 'DR2324', assets: ['/forms/dr2324-2026.pdf'],
  },
] as const;

export type ReportFormatId = typeof REPORT_FORMATS[number]['id'];
export function suggestedReportFormat(stateCode?: string): ReportFormatId {
  return REPORT_FORMATS.find(format => format.stateCode === stateCode?.toUpperCase())?.id ?? 'general';
}
export const REPORT_ASSETS = [...new Set(REPORT_FORMATS.flatMap(format => [...format.assets]))];
