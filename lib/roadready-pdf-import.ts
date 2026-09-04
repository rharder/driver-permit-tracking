import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ParsedCsv } from './csv-import';

type PositionedText = {
  text: string;
  x: number;
  y: number;
  width: number;
};

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
};

type RoadReadyEntry = {
  start: Date;
  daytimeMinutes: number;
  nighttimeMinutes: number;
  totalMinutes: number;
  environment: string;
  supervisor: string;
  notes: string;
};

type RoadReadyTotals = {
  daytimeMinutes: number;
  nighttimeMinutes: number;
  totalMinutes: number;
};

type ParsedTable = {
  entries: RoadReadyEntry[];
  totals: RoadReadyTotals | null;
};

export type RoadReadyTextPage = {
  width: number;
  items: PositionedText[];
};

const ROADREADY_HEADERS = ['Driver', 'Start', 'End', 'Day or night', 'Weather', 'Road or skill details', 'Notes'];

function normalized(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function key(value: string) {
  return normalized(value).toLowerCase();
}

function durationMinutes(value: string) {
  const raw = key(value);
  if (!raw || raw === '-') return 0;
  const hours = raw.match(/(\d+)\s*(?:h|hr|hrs|hour|hours)\b/);
  const minutes = raw.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (hours || minutes) return Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0);
  const clock = raw.match(/^(\d+):(\d{2})$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return null;
}

function roadReadyDate(value: string) {
  const match = normalized(value).match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2}):(\d{2})\s*(am|pm)\b/i);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const meridiem = match[6].toLowerCase();
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 1 || hour > 12 || minute > 59) return null;
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function cellText(items: PositionedText[]) {
  return normalized([...items]
    .sort((left, right) => Math.abs(right.y - left.y) > 2 ? right.y - left.y : left.x - right.x)
    .map((item) => item.text)
    .join(' '));
}

function tableColumns(items: PositionedText[]) {
  const distance = items.find((item) => key(item.text) === 'distance');
  if (!distance) return null;
  const headerItems = items.filter((item) => Math.abs(item.y - distance.y) <= 14);
  const find = (matcher: (value: string) => boolean) => headerItems.find((item) => matcher(key(item.text)));
  const starts = [
    find((value) => value.startsWith('date')),
    find((value) => value === 'daytime'),
    find((value) => value === 'nighttime'),
    find((value) => value === 'total'),
    distance,
    find((value) => value === 'environment'),
    find((value) => value === 'driving' || value === 'supervisor'),
    find((value) => value === 'notes'),
  ];
  if (starts.some((item) => !item)) return null;
  const x = starts.map((item) => item!.x);
  if (x.some((value, index) => index > 0 && value <= x[index - 1])) return null;
  return {
    starts: x,
    boundaries: x.slice(0, -1).map((value, index) => (value + x[index + 1]) / 2),
    headerBottom: Math.min(...headerItems.map((item) => item.y)),
  };
}

function assignCells(items: PositionedText[], boundaries: number[]) {
  const cells: PositionedText[][] = Array.from({ length: 8 }, () => []);
  items.forEach((item) => {
    const column = boundaries.findIndex((boundary) => item.x < boundary);
    cells[column === -1 ? 7 : column].push(item);
  });
  return cells.map(cellText);
}

function extractStudent(page: RoadReadyTextPage, tableHeaderBottom: number) {
  const label = page.items.find((item) => key(item.text) === 'student');
  if (!label) return '';
  const candidates = page.items.filter((item) => item.y < label.y - 4
    && item.y > tableHeaderBottom + 24
    && item.x >= label.x - 2
    && item.x < page.width * 0.4);
  if (!candidates.length) return '';
  const valueY = Math.max(...candidates.map((item) => item.y));
  return cellText(candidates.filter((item) => Math.abs(item.y - valueY) <= 2));
}

function parseRoadReadyTable(page: RoadReadyTextPage): ParsedTable | null {
  const columns = tableColumns(page.items);
  if (!columns) return null;
  const totalsItem = page.items
    .filter((item) => key(item.text) === 'totals' && item.y < columns.headerBottom)
    .sort((left, right) => right.y - left.y)[0];
  const dateBoundary = columns.boundaries[0];
  const dateItems = page.items
    .filter((item) => item.x < dateBoundary
      && item.y < columns.headerBottom - 3
      && (!totalsItem || item.y > totalsItem.y + 3)
      && /\d{1,2}\/\d{1,2}\/\d{4}/.test(item.text))
    .sort((left, right) => right.y - left.y);
  if (!dateItems.length) return null;

  const entries = dateItems.map((dateItem, index) => {
    const previousDate = dateItems[index - 1];
    const nextDate = dateItems[index + 1];
    const rowTop = previousDate ? (previousDate.y + dateItem.y) / 2 : columns.headerBottom - 3;
    const estimatedGap = previousDate ? previousDate.y - dateItem.y : nextDate ? dateItem.y - nextDate.y : 38;
    const rowBottom = nextDate
      ? (dateItem.y + nextDate.y) / 2
      : totalsItem
        ? totalsItem.y + 3
        : dateItem.y - Math.max(24, estimatedGap * 0.7);
    const cells = assignCells(page.items.filter((item) => item.y < rowTop && item.y > rowBottom), columns.boundaries);
    const start = roadReadyDate(cells[0]);
    const daytime = durationMinutes(cells[1]);
    const nighttime = durationMinutes(cells[2]);
    const total = durationMinutes(cells[3]);
    if (!start) throw new Error(`RoadReady row ${index + 1} has a date or start time that could not be read.`);
    if (daytime === null || nighttime === null || total === null || total <= 0) {
      throw new Error(`RoadReady row ${index + 1} has a duration that could not be read.`);
    }
    if (daytime + nighttime !== total) {
      throw new Error(`RoadReady row ${index + 1} does not pass its daytime/nighttime total check.`);
    }
    return {
      start,
      daytimeMinutes: daytime,
      nighttimeMinutes: nighttime,
      totalMinutes: total,
      environment: cells[5] === '-' ? '' : cells[5],
      supervisor: cells[6] === '-' ? '' : cells[6],
      notes: cells[7] === '-' ? '' : cells[7],
    };
  });

  let totals: RoadReadyTotals | null = null;
  if (totalsItem) {
    const footerCells = assignCells(page.items.filter((item) => Math.abs(item.y - totalsItem.y) <= 3), columns.boundaries);
    const daytime = durationMinutes(footerCells[1]);
    const nighttime = durationMinutes(footerCells[2]);
    const total = durationMinutes(footerCells[3]);
    if (daytime !== null && nighttime !== null && total !== null) {
      totals = { daytimeMinutes: daytime, nighttimeMinutes: nighttime, totalMinutes: total };
    }
  }
  return { entries, totals };
}

function sameTotals(left: RoadReadyTotals, right: RoadReadyTotals) {
  return left.daytimeMinutes === right.daytimeMinutes
    && left.nighttimeMinutes === right.nighttimeMinutes
    && left.totalMinutes === right.totalMinutes;
}

export function parseRoadReadyTextPages(pages: RoadReadyTextPage[]): ParsedCsv {
  const hasRoadReadyName = pages.some((page) => page.items.some((item) => key(item.text) === 'roadready'));
  const parsedPages = pages.map(parseRoadReadyTable).filter((table): table is ParsedTable => Boolean(table));
  const entries = parsedPages.flatMap((table) => table.entries);
  if (!hasRoadReadyName || !entries.length) {
    throw new Error('No readable RoadReady driving log was found. Scanned PDFs are not supported yet.');
  }

  const studentNames = [...new Set(pages.map((page) => {
    const columns = tableColumns(page.items);
    return columns ? extractStudent(page, columns.headerBottom) : '';
  }).filter(Boolean))];
  if (studentNames.length > 1) throw new Error('This RoadReady PDF appears to contain more than one student.');
  const studentName = studentNames[0] ?? '';
  const calculatedTotals = entries.reduce<RoadReadyTotals>((totals, entry) => ({
    daytimeMinutes: totals.daytimeMinutes + entry.daytimeMinutes,
    nighttimeMinutes: totals.nighttimeMinutes + entry.nighttimeMinutes,
    totalMinutes: totals.totalMinutes + entry.totalMinutes,
  }), { daytimeMinutes: 0, nighttimeMinutes: 0, totalMinutes: 0 });
  const footers = parsedPages.map((page) => page.totals).filter((totals): totals is RoadReadyTotals => Boolean(totals));
  const summedFooters = footers.reduce<RoadReadyTotals>((totals, footer) => ({
    daytimeMinutes: totals.daytimeMinutes + footer.daytimeMinutes,
    nighttimeMinutes: totals.nighttimeMinutes + footer.nighttimeMinutes,
    totalMinutes: totals.totalMinutes + footer.totalMinutes,
  }), { daytimeMinutes: 0, nighttimeMinutes: 0, totalMinutes: 0 });
  if (footers.length && !sameTotals(calculatedTotals, footers[footers.length - 1]) && !sameTotals(calculatedTotals, summedFooters)) {
    throw new Error('The extracted drives do not match the totals printed in the RoadReady PDF. Nothing was imported.');
  }

  const warnings = [
    'RoadReady PDFs do not include weather, so the selected default weather will be used.',
    'Distance is not imported. Environment and driving supervisor are preserved with the log details.',
  ];
  if (!studentName) warnings.push('The student name could not be read. Choose an existing driver or enter a name before importing.');
  if (!footers.length) warnings.push('No printed totals row was found, so the extracted durations could not be cross-checked.');
  if (entries.some((entry) => entry.daytimeMinutes > 0 && entry.nighttimeMinutes > 0)) {
    warnings.push('Drives containing both daytime and nighttime hours were split into consecutive entries.');
  }

  const rows = entries.flatMap((entry) => {
    let segmentStart = entry.start;
    return ([
      { minutes: entry.daytimeMinutes, period: 'Day' },
      { minutes: entry.nighttimeMinutes, period: 'Night' },
    ] as const).filter((segment) => segment.minutes > 0).map((segment) => {
      const segmentEnd = new Date(segmentStart.getTime() + segment.minutes * 60_000);
      const notes = [entry.notes, entry.supervisor ? `Supervisor: ${entry.supervisor}` : ''].filter(Boolean).join(' · ');
      const row = [studentName, segmentStart.toISOString(), segmentEnd.toISOString(), segment.period, '', entry.environment, notes];
      segmentStart = segmentEnd;
      return row;
    });
  });

  return { headers: ROADREADY_HEADERS, rows, delimiter: 'PDF', warnings };
}

export async function parseRoadReadyPdf(buffer: ArrayBuffer): Promise<ParsedCsv> {
  if (typeof window !== 'undefined') {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
  }
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  try {
    const document = await loadingTask.promise;
    if (document.numPages > 100) throw new Error('This PDF has too many pages to import safely.');
    const pages: RoadReadyTextPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.flatMap((item) => {
        if (!('str' in item) || !normalized(item.str)) return [];
        const textItem = item as PdfTextItem;
        return [{
          text: normalized(textItem.str),
          x: Number(textItem.transform[4]),
          y: Number(textItem.transform[5]),
          width: Number(textItem.width),
        }];
      });
      pages.push({ width: Number(page.view[2]) - Number(page.view[0]), items });
    }
    return parseRoadReadyTextPages(pages);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/password/i.test(message)) throw new Error('Password-protected RoadReady PDFs cannot be imported.');
    throw error;
  } finally {
    await loadingTask.destroy();
  }
}
