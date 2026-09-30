import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pdfDuration, type PrintableDrive, type PrintableDriver } from './report-types.ts';

/** Browser-only generation: no service, upload, or network dependency. */
export async function createGeneralLogPdf(driver: PrintableDriver, sessions: readonly PrintableDrive[]) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(.12, .17, .2), muted = rgb(.35, .39, .42), rule = rgb(.75, .78, .79), pale = rgb(.95, .96, .96);
  const sorted = [...sessions].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  const entries = sorted.map(drive => {
    const seconds = Math.floor((Date.parse(drive.end) - Date.parse(drive.start)) / 1000);
    if (!Number.isFinite(seconds) || seconds < 0 || !['day', 'night'].includes(drive.period)) throw new Error('A drive has an invalid date or duration. Correct it before printing.');
    return { drive, seconds };
  });
  const day = entries.reduce((sum, { drive, seconds }) => sum + (drive.period === 'day' ? seconds : 0), 0);
  const night = entries.reduce((sum, { drive, seconds }) => sum + (drive.period === 'night' ? seconds : 0), 0);
  const date = (value: string) => new Date(value).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const time = (value: string) => new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  function wrap(value: string, width: number, size = 9) {
    const lines: string[] = [];
    let line = '';
    for (const word of value.replace(/\s+/g, ' ').trim().split(' ')) {
      if (line && regular.widthOfTextAtSize(`${line} ${word}`, size) > width) { lines.push(line); line = ''; }
      for (const character of (line ? ' ' : '') + word) {
        if (regular.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ''; }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
  let page = doc.addPage([612, 792]);
  let y = 0;
  const text = (value: string, x: number, top: number, size = 9, strong = false, color = ink) => page.drawText(value, { x, y: top, size, font: strong ? bold : regular, color });
  const line = (top: number) => page.drawLine({ start: { x: 36, y: top }, end: { x: 576, y: top }, thickness: .5, color: rule });
  const field = (name: string, label: string, x: number, top: number, width: number, value = '') => {
    text(label, x, top, 8, true, muted);
    const input = doc.getForm().createTextField(name);
    input.setText(value);
    let size = 11;
    while (size > 7 && regular.widthOfTextAtSize(value, size) > width - 8) size -= .5;
    if (regular.widthOfTextAtSize(value, size) > width - 8) throw new Error('The driver name is too long to fit. Please shorten the name before printing.');
    input.disableScrolling();
    input.addToPage(page, { x, y: top - 28, width, height: 22, borderWidth: .5, borderColor: rule, font: regular });
    input.setFontSize(size);
  };
  const heading = (continuation = false) => {
    text('PERMIT HOURS  /  SUPERVISED PRACTICE RECORD', 36, 753, 8, true, muted);
    text('Supervised Driving Log', 36, 726, 23, true);
    line(712);
    if (continuation) {
      y = 695;
      for (const value of wrap(`Driver: ${driver.legalName?.trim() || driver.name}`, 540)) { text(value, 36, y); y -= 13; }
      text('Driving history continued', 36, y - 5, 10, true); y -= 25;
    }
  };
  const tableHeader = () => {
    page.drawRectangle({ x: 36, y: y - 23, width: 540, height: 23, color: ink });
    ['DATE / TIME', 'DAY', 'NIGHT', 'CONDITIONS / NOTES'].forEach((label, index) => text(label, [44, 162, 244, 330][index], y - 15, 8, true, rgb(1, 1, 1)));
    y -= 23;
  };
  const nextLogPage = () => { page = doc.addPage([612, 792]); heading(true); tableHeader(); };
  try {
    heading();
    field('driverName', 'DRIVER FULL LEGAL NAME', 36, 692, 348, driver.legalName?.trim() || driver.name);
    field('permitNumber', 'PERMIT NUMBER (IF REQUIRED)', 400, 692, 176);
    const labels = ['DAYTIME', 'NIGHTTIME', 'TOTAL RECORDED'];
    [day, night, day + night].forEach((seconds, i) => {
      const x = 36 + i * 184;
      page.drawRectangle({ x, y: 590, width: 172, height: 60, color: pale });
      text(labels[i], x + 12, 632, 8, true, muted);
      text(pdfDuration(seconds), x + 12, 607, 17, true);
    });
    text(`${entries.length} completed drive${entries.length === 1 ? '' : 's'}${entries.length ? `  |  ${date(entries[0].drive.start)} - ${date(entries.at(-1)!.drive.end)}` : ''}`, 36, 572, 9, true);
    text('All recorded driving; goal limits are not applied. An ongoing drive is excluded.', 36, 556, 9, false, muted);
    y = 538;
    tableHeader();
    if (!entries.length) { text('No completed drives recorded.', 44, y - 22, 10); y -= 44; }
    entries.forEach(({ drive, seconds }, index) => {
      const details = [drive.weather, drive.notes, drive.poorWeather ? 'Poor weather' : '', drive.challenging ? 'Other challenging conditions' : ''].filter(Boolean).join(' | ') || '-';
      const lines = wrap(details, 238);
      const endDate = date(drive.start) !== date(drive.end) ? date(drive.end) + ' ' : '';
      const dateLines = [date(drive.start), ...wrap(`${time(drive.start)} - ${endDate}${time(drive.end)}`, 106, 8)];
      for (let offset = 0; offset < lines.length; offset += 4) {
        const part = lines.slice(offset, offset + 4);
        const left = offset ? [`Drive ${index + 1} (cont.)`] : dateLines;
        const height = Math.max(part.length, left.length, 2) * 12 + 16;
        if (y - height < 64) nextLogPage();
        if (index % 2 === 0) page.drawRectangle({ x: 36, y: y - height, width: 540, height, color: pale });
        left.forEach((value, i) => text(value, 44, y - 17 - i * 12, i ? 8 : 9));
        if (!offset) {
          text(drive.period === 'day' ? pdfDuration(seconds) : '-', 162, y - 17, 8);
          text(drive.period === 'night' ? pdfDuration(seconds) : '-', 244, y - 17, 8);
        }
        part.forEach((value, i) => text(value, 330, y - 17 - i * 12, 9));
        y -= height; line(y);
      }
    });
    if (y < 250) {
      page = doc.addPage([612, 792]); heading(); y = 690;
      for (const value of wrap(`Driver: ${driver.legalName?.trim() || driver.name}`, 540)) { text(value, 36, y); y -= 13; }
      text(`Total recorded: ${pdfDuration(day + night)} | ${entries.length} completed drives`, 36, y - 3, 9, true);
      y -= 22;
    }
    y -= 26;
    text('REVIEW AND CERTIFICATION', 36, y, 11, true);
    y -= 18;
    for (const value of wrap('I certify that the supervised driving entries and totals in this report are accurate to the best of my knowledge. Review every page before signing.', 540)) { text(value, 36, y); y -= 13; }
    y -= 17;
    field('supervisorName', 'PARENT / GUARDIAN / SUPERVISOR NAME', 36, y, 348);
    field('relationship', 'RELATIONSHIP TO DRIVER', 400, y, 176);
    y -= 62;
    page.drawLine({ start: { x: 36, y }, end: { x: 384, y }, thickness: .5, color: rule });
    text('SIGNATURE', 36, y - 12, 8, true, muted);
    field('signedDate', 'DATE', 400, y + 22, 176);
    y -= 38;
    for (const value of wrap('Not a government-issued form. Confirm acceptance and any additional documentation, signatures, or state forms with your licensing agency.', 540, 8)) { text(value, 36, y, 8, false, muted); y -= 11; }
    for (const [index, item] of doc.getPages().entries()) {
      page = item; line(44);
      text('Permit Hours | General driving log', 36, 29, 8, false, muted);
      text(`Page ${index + 1} of ${doc.getPageCount()}`, 506, 29, 8, false, muted);
    }
    doc.getForm().updateFieldAppearances(regular);
    doc.setTitle(`Driving log - ${driver.legalName?.trim() || driver.name}`);
    doc.setCreator('Permit Hours');
    return await doc.save();
  } catch (error) {
    if (error instanceof Error && /WinAnsi cannot encode/.test(error.message)) throw new Error('A name or note contains characters the report font cannot print. Please replace unsupported symbols and try again.');
    throw error;
  }
}
