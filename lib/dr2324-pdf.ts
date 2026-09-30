import { PDFDocument, PDFDict, PDFName, PDFRef, StandardFonts, type PDFFont } from 'pdf-lib';

export const DR2324_TEMPLATE = '/forms/dr2324-2026.pdf';
export const DR2324_ROWS_PER_PAGE = 14;
export type PrintableDrive = {
  id: string; start: string; end: string; period: 'day' | 'night'; weather: string; notes: string;
  poorWeather?: boolean; challenging?: boolean;
};
export type PrintableDriver = { name: string; legalName?: string };

export function pdfDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m${remainder ? ` ${String(remainder).padStart(2, '0')}s` : ''}`;
}

function dateText(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(date);
}

function commentLines(text: string, font: PDFFont) {
  const lines: string[] = [];
  let line = '';
  for (const character of text.replace(/\s+/g, ' ').trim()) {
    if (font.widthOfTextAtSize(line + character, 10) > 520) {
      lines.push(line.trim());
      line = 'Continued: ';
    }
    line += character;
  }
  lines.push(line.trim());
  return lines;
}

/** Fill the supplied official PDF, retaining its page art, editable fields and blank signature. */
export async function createDr2324Pdf(template: Uint8Array, driver: PrintableDriver, sessions: readonly PrintableDrive[]) {
  const output = await PDFDocument.create();
  const font = await output.embedFont(StandardFonts.Helvetica);
  const rows: { date: string; day: number; night: number; comment: string; continuation: boolean }[] = [];
  for (const drive of [...sessions].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id))) {
    const start = new Date(drive.start), end = new Date(drive.end);
    const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
    if (!Number.isFinite(seconds) || seconds < 0 || !['day', 'night'].includes(drive.period)) {
      throw new Error('A drive has an invalid date or duration. Correct it before printing.');
    }
    const time = (date: Date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const comments = [
      `${time(start)} - ${start.toDateString() === end.toDateString() ? '' : dateText(end) + ' '}${time(end)}`,
      drive.weather, drive.notes, drive.poorWeather ? 'Poor weather' : '', drive.challenging ? 'Other challenging conditions' : '',
    ].filter(Boolean).join(' | ');
    let lines: string[];
    try { lines = commentLines(comments, font); }
    catch { throw new Error('A drive note contains characters the form’s font cannot print. Please replace unsupported symbols in the note and try again.'); }
    lines.forEach((comment, index) => rows.push({
      date: index ? '' : dateText(start), comment, continuation: index > 0,
      day: !index && drive.period === 'day' ? seconds : 0,
      night: !index && drive.period === 'night' ? seconds : 0,
    }));
  }
  const totals = (items: typeof rows) => items.reduce((sum, row) => ({ day: sum.day + row.day, night: sum.night + row.night }), { day: 0, night: 0 });
  const overall = totals(rows);
  const logPages = Math.max(1, Math.ceil(rows.length / DR2324_ROWS_PER_PAGE));

  async function appendFormPage(pageIndex: number, prefix: string, values: Record<string, string>) {
    // Each copy has its own field tree, so editing one sheet never changes another.
    const source = await PDFDocument.load(template);
    const form = source.getForm();
    const sourceFont = await source.embedFont(StandardFonts.Helvetica);
    for (const [name, value] of Object.entries(values)) {
      const field = form.getTextField(name);
      const width = Math.min(...field.acroField.getWidgets().map(widget => widget.getRectangle().width)) - 6;
      let size = 10;
      try {
        while (size > 7 && sourceFont.widthOfTextAtSize(value, size) > width) size -= 0.5;
        if (sourceFont.widthOfTextAtSize(value, size) > width) throw new Error('too long');
        field.setText(value);
        field.setFontSize(size);
        field.disableScrolling();
      } catch {
        throw new Error(`The value for “${name}” is too long or uses unsupported characters. Please edit it before printing.`);
      }
    }
    form.updateFieldAppearances(sourceFont);
    for (const field of form.getFields()) {
      field.acroField.setPartialName(`${prefix}.${field.getName()}`);
      field.acroField.dict.delete(PDFName.of('AA'));
    }
    const [page] = await output.copyPages(source, [pageIndex]);
    output.addPage(page);
    // copyPages copies widgets, not the document-level AcroForm. Attach the copied
    // root fields explicitly, including parent/kid widgets in the official form.
    const registered = new Set<string>();
    for (const annotation of page.node.Annots()?.asArray() ?? []) {
      if (!(annotation instanceof PDFRef)) continue;
      let ref = annotation;
      let field = output.context.lookup(ref, PDFDict);
      if (field.get(PDFName.of('Subtype')) !== PDFName.of('Widget')) continue;
      let parent = field.get(PDFName.of('Parent'));
      while (parent instanceof PDFRef) {
        ref = parent;
        field = output.context.lookup(ref, PDFDict);
        parent = field.get(PDFName.of('Parent'));
      }
      if (!registered.has(ref.toString())) output.getForm().acroForm.addField(ref);
      registered.add(ref.toString());
    }
  }

  await appendFormPage(0, 'cover', {
    'Student’s name': driver.legalName?.trim() || driver.name,
    'Total Day Driving Time': pdfDuration(overall.day),
    'Total Night Driving Time': pdfDuration(overall.night),
    'Grand Total Driving Time': pdfDuration(overall.day + overall.night),
  });
  for (let page = 0; page < logPages; page++) {
    const pageRows = rows.slice(page * DR2324_ROWS_PER_PAGE, (page + 1) * DR2324_ROWS_PER_PAGE);
    const sum = totals(pageRows);
    const values: Record<string, string> = {
      'Page Number': String(page + 1), 'Number of Pages': String(logPages),
      'Day Driving Time 15': pdfDuration(sum.day),
      'Grand Total Night Driving Time': pdfDuration(sum.night),
      'Grand Total Driving Time 15': pdfDuration(sum.day + sum.night),
    };
    pageRows.forEach((row, index) => {
      const number = index + 1;
      const suffix = number === 1 ? '' : `_${number}`;
      values[`Date_${String(number).padStart(2, '0')}`] = row.date;
      values[`Comments${suffix}`] = row.comment;
      if (!row.continuation) {
        values[`Driving Time${suffix}`] = pdfDuration(row.day);
        values[number === 1 ? 'Night Driving' : `Night Driving_${String(number).padStart(2, '0')}`] = pdfDuration(row.night);
        values[`Grand Total${suffix}`] = pdfDuration(row.day + row.night);
      }
    });
    await appendFormPage(1, `log${page + 1}`, values);
  }
  output.setTitle(`DR2324 - ${driver.legalName?.trim() || driver.name}`);
  output.setCreator('Permit Hours');
  // Original/copy appearances were already regenerated before copying. Preserve them.
  return output.save({ updateFieldAppearances: false });
}
