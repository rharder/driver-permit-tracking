import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { REPORT_FORMATS, REPORT_ASSETS, suggestedReportFormat } from '../lib/report-formats.ts';
import { createReportPdf } from '../lib/report-pdf.ts';

const driver = { name: 'Example', legalName: 'Example Student' };
const drive = i => ({ id: String(i), start: new Date(2026, 8, i + 1, 17).toISOString(), end: new Date(2026, 8, i + 1, 17, 20, 15).toISOString(), period: i % 2 ? 'night' : 'day', weather: 'Clear', notes: 'Residential streets and parking practice.' });
test('formats default to general without a matching state and declare all offline assets', async () => {
  assert.equal(suggestedReportFormat(), 'general');
  assert.equal(suggestedReportFormat('NY'), 'general');
  assert.equal(suggestedReportFormat('co'), 'colorado-dr2324');
  assert.equal(new Set(REPORT_FORMATS.map(format => format.id)).size, REPORT_FORMATS.length);
  assert.deepEqual(REPORT_ASSETS, ['/forms/dr2324-2026.pdf']);
  for (const format of REPORT_FORMATS) {
    const assets = await Promise.all(format.assets.map(path => readFile(new URL('../public' + path, import.meta.url))));
    const pdf = await PDFDocument.load(await createReportPdf(format.id, driver, [drive(0)], assets));
    assert.ok(pdf.getPageCount() > 0);
  }
});
test('general report is offline, fillable, and paginates empty, short and long histories', async () => {
  for (const count of [0, 2, 40]) {
    const bytes = await createReportPdf('general', driver, Array.from({ length: count }, (_, i) => drive(i)));
    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    assert.equal(form.getTextField('driverName').getText(), driver.legalName);
    for (const name of ['permitNumber', 'supervisorName', 'relationship', 'signedDate']) assert.ok(!form.getTextField(name).getText());
    assert.equal(form.getFields().length, 5);
    assert.ok(count < 40 ? doc.getPageCount() === 1 : doc.getPageCount() > 1);
    for (const page of doc.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
  }
});
test('long notes and cross-midnight drives paginate without truncation or invalid dates', async () => {
  const long = { ...drive(0), end: new Date(2026, 8, 2, 1).toISOString(), notes: 'Practice note. '.repeat(600) + 'END OF NOTE' };
  const doc = await PDFDocument.load(await createReportPdf('general', driver, [long]));
  assert.ok(doc.getPageCount() > 1);
  await assert.rejects(createReportPdf('general', driver, [{ ...long, end: 'bad' }]), /invalid date/);
  await assert.rejects(createReportPdf('general', driver, [{ ...drive(0), notes: '🚗' }]), /unsupported symbols/);
});
