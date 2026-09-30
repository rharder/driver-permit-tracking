'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createReportPdf } from '@/lib/report-pdf';
import { REPORT_FORMATS, suggestedReportFormat, type ReportFormatId } from '@/lib/report-formats';
import type { PrintableDrive, PrintableDriver } from '@/lib/report-types';

export function PrintLogDialog({ driver, sessions, onClose }: {
  driver: PrintableDriver; sessions: readonly PrintableDrive[]; onClose: () => void;
}) {
  const [formatId, setFormatId] = useState<ReportFormatId>(() => suggestedReportFormat(driver.practice?.stateCode));
  const format = REPORT_FORMATS.find(item => item.id === formatId)!;
  const [pdf, setPdf] = useState<{ url: string; name: string; formatId: ReportFormatId } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setPdf(null);
    setError('');
    let cancelled = false;
    let url: string | undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    void (async () => {
      try {
        const assets = await Promise.all(format.assets.map(async path => {
          const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${path}`, { signal: controller.signal });
          if (!response.ok) throw new Error('The form is not available. Open the app once online to save its offline copy, or choose the general report.');
          return new Uint8Array(await response.arrayBuffer());
        }));
        window.clearTimeout(timer);
        const bytes = await createReportPdf(format.id, driver, sessions, assets);
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
        const name = driver.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'driver';
        setPdf({ url, name: `${format.filename}-${name}.pdf`, formatId: format.id });
      } catch (cause) {
        if (!cancelled) setError(controller.signal.aborted ? 'The form download stalled. Reconnect once to save the offline form, then try again.' : cause instanceof Error ? cause.message : 'The PDF could not be prepared. Please try again.');
      } finally { window.clearTimeout(timer); }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
      // Allow a newly opened Safari PDF tab to finish loading after this dialog closes.
      if (url) window.setTimeout(() => URL.revokeObjectURL(url!), 60_000);
    };
  }, [driver, sessions, format]);

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="permit-dialog scroll-dialog sm:max-w-lg">
      <DialogHeader><DialogTitle>Print driving log</DialogTitle><DialogDescription>Choose a report for {driver.legalName?.trim() || driver.name}.</DialogDescription></DialogHeader>
      <div className="print-pdf-body scroll-dialog-body">
        <label className="report-format-label">Report format
          <select value={formatId} onChange={event => { setPdf(null); setError(''); setFormatId(event.target.value as ReportFormatId); }}>
            {REPORT_FORMATS.map(item => <option key={item.id} value={item.id}>{item.label}{item.stateCode === driver.practice?.stateCode ? ' (suggested for your state)' : ''}</option>)}
          </select>
        </label>
        <p>{format.description}</p>
        <p className="print-pdf-note">{format.notice}</p>
        <p>Includes all completed drives for this driver, with separate day, night, and total time. An ongoing drive is not included.</p>
        <p>Review the entries and totals. Complete any blank identification and certification fields before signing. No signatures are generated.</p>
        {!driver.legalName?.trim() && <p>Only the app name is on file. Add the full legal name in Driver Settings before submitting, or complete it in the PDF.</p>}
        {error ? <p role="alert" className="field-error">{error}</p> : pdf?.formatId === formatId ? <>
          <div className="print-pdf-actions">
            <a className="print-pdf-open" href={pdf.url} target="_blank" rel="noopener noreferrer">Open PDF to print</a>
            <a href={pdf.url} download={pdf.name}>Download PDF</a>
          </div>
          <p>In the PDF tab, use File → Print (⌘P on Mac). If Safari does not open the print window, download the PDF and print it from Preview. Choose US Letter at Actual Size / 100%.</p>
        </> : <p role="status">Preparing your PDF on this device…</p>}
        <p className="print-pdf-note">Prepared on this device. Long notes continue on additional rows or pages. Totals include all recorded driving, not state-goal filters.</p>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
