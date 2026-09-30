import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { createDr2324Pdf } from '../lib/dr2324-pdf.ts';

const template = await readFile(new URL('../public/forms/dr2324-2026.pdf', import.meta.url));
const drive = i => ({ id: String(i), start: new Date(2026, 8, i + 1, 17).toISOString(), end: new Date(2026, 8, i + 1, 17, 20).toISOString(), period: i % 2 ? 'night' : 'day', weather: 'Clear', notes: '' });
test('official form keeps independent editable pages, correct totals and blank signatures', async () => {
  const pdf = await PDFDocument.load(await createDr2324Pdf(template, { name: 'Example', legalName: 'Example Student' }, Array.from({ length: 15 }, (_, i) => drive(i)).reverse()));
  const form = pdf.getForm();
  const text = name => form.getTextField(name).getText();
  assert.equal(pdf.getPageCount(), 3);
  assert.equal(form.getFields().length, 186);
  assert.equal(text('cover.Student’s name'), 'Example Student');
  assert.equal(text('cover.Grand Total Driving Time'), '5h 00m');
  assert.equal(text('cover.Total Night Driving Time'), '2h 20m');
  assert.equal(text('log1.Grand Total Driving Time 15'), '4h 40m');
  assert.equal(text('log2.Grand Total Driving Time 15'), '0h 20m');
  assert.equal(text('log2.Page Number'), '2');
  assert.equal(text('log1.Number of Pages'), '2');
  assert.equal(text('log1.Date_01'), '09/01/2026');
  assert.equal(text('log2.Date_01'), '09/15/2026');
  for (const name of ['cover.Permit number', 'cover.Name', 'cover.Date', 'log1.Verifiers Initials']) assert.ok(!text(name));
  assert.ok(form.getSignature('cover.Signature Field 1'));
  for (const page of pdf.getPages()) assert.deepEqual(page.getSize(), { width: 612, height: 792 });
});
test('empty history and exactly fourteen drives need one log sheet', async () => {
  for (const count of [0, 14]) {
    const pdf = await PDFDocument.load(await createDr2324Pdf(template, { name: 'Example' }, Array.from({ length: count }, (_, i) => drive(i))));
    assert.equal(pdf.getPageCount(), 2);
    assert.equal(pdf.getForm().getTextField('cover.Student’s name').getText(), 'Example');
  }
});
test('long comments continue without double-counting time; seconds are retained', async () => {
  const entry = { ...drive(0), end: new Date(2026, 8, 1, 17, 20, 31).toISOString(), notes: 'Long practice note. '.repeat(130) };
  const pdf = await PDFDocument.load(await createDr2324Pdf(template, { name: 'Example' }, [entry]));
  const form = pdf.getForm();
  assert.ok(pdf.getPageCount() > 2);
  assert.equal(form.getTextField('cover.Grand Total Driving Time').getText(), '0h 20m 31s');
  assert.match(form.getTextField('log1.Comments_2').getText(), /^Continued:/);
  assert.ok(!form.getTextField('log1.Grand Total_2').getText());
});
test('invalid dates and unprintable notes fail visibly', async () => {
  await assert.rejects(createDr2324Pdf(template, { name: 'Example' }, [{ ...drive(0), end: 'invalid' }]), /invalid date/);
  await assert.rejects(createDr2324Pdf(template, { name: 'Example' }, [{ ...drive(0), notes: '🚗' }]), /unsupported symbols/);
});
