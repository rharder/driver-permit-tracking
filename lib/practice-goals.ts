export type PracticeSettings = {
  dayGoal?: number;
  poorWeatherGoal?: number;
  challengingGoal?: number;
  maxMinutesPerDay?: number;
  timeZone?: string;
  countFrom?: string;
  stateCode?: string;
  stageLabel?: string;
};

export type GoalDriver = { totalGoal: number; nightGoal: number; practice?: PracticeSettings };
export type PracticeDrive = {
  id: string;
  start: string;
  end: string;
  period: 'day' | 'night';
  weather: string;
  poorWeather?: boolean;
  challenging?: boolean;
};

export type GoalCategory = 'total' | 'day' | 'night' | 'poorWeather' | 'challenging';
export const GOAL_LABELS: Record<GoalCategory, string> = {
  total: 'Total time', day: 'Daytime', night: 'Nighttime',
  poorWeather: 'Poor weather', challenging: 'Challenging conditions',
};

export function isPoorWeather(drive: Pick<PracticeDrive, 'weather' | 'poorWeather'>) {
  return drive.poorWeather ?? (drive.weather === 'Rain' || drive.weather === 'Snow');
}

export function isChallenging(drive: Pick<PracticeDrive, 'weather' | 'poorWeather' | 'period' | 'challenging'>) {
  return drive.period === 'night' || isPoorWeather(drive) || drive.challenging === true;
}

export function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true; }
  catch { return false; }
}

export function practiceError(driver: GoalDriver): string | null {
  if (!Number.isFinite(driver.totalGoal) || driver.totalGoal <= 0) return 'Set a total goal greater than zero.';
  const practice = driver.practice;
  if (practice !== undefined && (!practice || typeof practice !== 'object' || Array.isArray(practice))) return 'Invalid practice settings.';
  for (const value of [driver.nightGoal, practice?.dayGoal ?? 0, practice?.poorWeatherGoal ?? 0, practice?.challengingGoal ?? 0]) {
    if (!Number.isFinite(value) || value < 0 || value > driver.totalGoal) return 'Each category goal must be between zero and the total goal.';
  }
  if ((practice?.dayGoal ?? 0) + driver.nightGoal > driver.totalGoal) return 'Daytime plus nighttime goals cannot exceed the total goal.';
  const cap = practice?.maxMinutesPerDay ?? 0;
  if (!Number.isFinite(cap) || cap < 0 || cap > 1440) return 'The daily limit must be between 0 and 1,440 minutes (0 means unlimited).';
  if (practice?.countFrom !== undefined && (typeof practice.countFrom !== 'string' || !Number.isFinite(Date.parse(practice.countFrom)))) return 'Choose a valid stage start date and time.';
  if (practice?.timeZone !== undefined && (typeof practice.timeZone !== 'string' || !validTimeZone(practice.timeZone))) return 'Choose a valid IANA time zone, such as America/Denver.';
  if (cap > 0 && !practice?.timeZone) return 'Set the time zone used for the daily limit.';
  for (const value of [practice?.stateCode, practice?.stageLabel]) {
    if (value !== undefined && typeof value !== 'string') return 'Invalid state or stage label.';
  }
  return null;
}

export function validConditionFlags(drive: { poorWeather?: unknown; challenging?: unknown }) {
  return [drive.poorWeather, drive.challenging].every(value => value === undefined || typeof value === 'boolean');
}

// Find calendar midnight in a saved IANA zone, including 23/25-hour DST days.
// Binary search avoids depending on the viewer's device time zone or rounding minutes.
function dayBoundary(start: number, end: number, dayKey: (time: number) => string) {
  const key = dayKey(start);
  if (dayKey(end - 1) === key && end - start < 26 * 3_600_000) return end;
  let low = start;
  let high = Math.min(end, start + 26 * 3_600_000);
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (dayKey(middle) === key) low = middle;
    else high = middle;
  }
  return high;
}

export function calculatePractice(drives: PracticeDrive[], driver: GoalDriver) {
  const counted: Record<GoalCategory, number> = { total: 0, day: 0, night: 0, poorWeather: 0, challenging: 0 };
  const creditedById: Record<string, number> = Object.create(null);
  const settings = driver.practice ?? {};
  const cutoff = settings.countFrom ? Date.parse(settings.countFrom) : -Infinity;
  const cap = (settings.maxMinutesPerDay ?? 0) > 0 ? settings.maxMinutesPerDay! * 60_000 : Infinity;
  const zone = settings.timeZone && validTimeZone(settings.timeZone) ? settings.timeZone : 'UTC';
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayKey = (time: number) => formatter.format(time);
  const usedByDay = new Map<string, number>();
  // A single shared daily allowance credits the earliest recorded practice first.
  // Night/weather categories use those same credited slices, never separate caps.
  const ordered = [...drives].sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id));
  for (const drive of ordered) {
    let start = Math.max(Date.parse(drive.start), cutoff);
    const end = Date.parse(drive.end);
    creditedById[drive.id] = 0;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    while (start < end) {
      const until = Number.isFinite(cap) ? dayBoundary(start, end, dayKey) : end;
      const key = Number.isFinite(cap) ? dayKey(start) : '';
      const used = usedByDay.get(key) ?? 0;
      const credit = Math.max(0, Math.min(until - start, cap - used));
      if (Number.isFinite(cap)) usedByDay.set(key, used + credit);
      creditedById[drive.id] += credit;
      counted.total += credit;
      counted[drive.period] += credit;
      if (isPoorWeather(drive)) counted.poorWeather += credit;
      if (isChallenging(drive)) counted.challenging += credit;
      start = until;
    }
  }
  const targets: Record<GoalCategory, number> = {
    total: driver.totalGoal, day: settings.dayGoal ?? 0, night: driver.nightGoal,
    poorWeather: settings.poorWeatherGoal ?? 0, challenging: settings.challengingGoal ?? 0,
  };
  const goals = (Object.keys(targets) as GoalCategory[]).filter(key => targets[key] > 0).map(key => ({
    key, label: GOAL_LABELS[key], hours: targets[key], value: counted[key],
    percent: Math.min(100, Math.floor(counted[key] / (targets[key] * 3_600_000) * 100)),
    met: counted[key] >= targets[key] * 3_600_000,
  }));
  return { counted, creditedById, goals, complete: goals.length > 0 && goals.every(goal => goal.met), percent: goals.length ? Math.min(...goals.map(goal => goal.percent)) : 0 };
}

export function countingDescription(settings?: PracticeSettings) {
  const parts = [settings?.stageLabel || 'Personal practice goals'];
  parts.push(settings?.countFrom ? `Counting from ${new Date(settings.countFrom).toLocaleString()}` : 'Counting all recorded dates');
  if (settings?.maxMinutesPerDay) parts.push(`First ${settings.maxMinutesPerDay} minutes per calendar day (${settings.timeZone}); later practice stays in the log`);
  return parts.join(' · ');
}
