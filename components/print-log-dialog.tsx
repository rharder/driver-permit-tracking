'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createDr2324Pdf, DR2324_TEMPLATE, type PrintableDrive, type PrintableDriver } from '@/lib/dr2324-pdf';

export function PrintLogDialog({ driver, sessions, onClose }: {
  driver: PrintableDriver; sessions: readonly PrintableDrive[]; onClose: () => void;
}) {
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    void (async () => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}${DR2324_TEMPLATE}`, { signal: controller.signal });
        if (!response.ok) throw new Error('The official form is not available. Open the app once online to save its offline copy, then try again.');
        const template = new Uint8Array(await response.arrayBuffer());
        window.clearTimeout(timer);
        const bytes = await createDr2324Pdf(template, driver, sessions);
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
        const name = driver.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'driver';
        setPdf({ url, name: `DR2324-${name}.pdf` });
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
  }, [driver, sessions]);

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="permit-dialog scroll-dialog sm:max-w-lg">
      <DialogHeader><DialogTitle>Print Colorado driving log</DialogTitle><DialogDescription>Official DR2324 · revised August 25, 2026 · {driver.legalName?.trim() || driver.name}</DialogDescription></DialogHeader>
      <div className="print-pdf-body scroll-dialog-body">
        <p>Includes all completed drives for this driver, with separate day, night, and total time. An ongoing drive is not included.</p>
        <p>Review the entries and totals. Fill in the permit number and verifier initials, then have the responsible adult complete the name, signature, and date. These are left blank for you.</p>
        {!driver.legalName?.trim() && <p>Only the app name is on file. Add the full legal name in Driver Settings before submitting, or complete it in the PDF.</p>}
        {error ? <p role="alert" className="field-error">{error}</p> : pdf ? <>
          <div className="print-pdf-actions">
            <a className="print-pdf-open" href={pdf.url} target="_blank" rel="noopener noreferrer">Open PDF to print</a>
            <a href={pdf.url} download={pdf.name}>Download PDF</a>
          </div>
          <p>In the PDF tab, use File → Print (⌘P on Mac). If Safari does not open the print window, download the PDF and print it from Preview. Choose US Letter at Actual Size / 100%.</p>
        </> : <p role="status">Preparing your PDF on this device…</p>}
        <p className="print-pdf-note">The form’s original layout is preserved. Long comments continue on extra rows. Totals include all recorded driving, not state-goal filters. No signature or verifier initials are generated.</p>
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
