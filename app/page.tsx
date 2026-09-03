'use client';

import { ChangeEvent, SubmitEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CarFront,
  Check,
  Clock3,
  Cloud,
  CloudRain,
  CloudUpload,
  Download,
  Eye,
  FileJson,
  FileSpreadsheet,
  History,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Snowflake,
  Square,
  Sun,
  Trash2,
  Upload,
  UserRound,
  Users,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useFirebaseSync, type FamilyRole } from '@/lib/firebase-sync';

type Period = 'day' | 'night';
type Weather = 'Clear' | 'Cloudy' | 'Rain' | 'Snow' | 'Other';

type Driver = {
  id: string;
  name: string;
  totalGoal: number;
  nightGoal: number;
};

type DriveSession = {
  id: string;
  driverId: string;
  start: string;
  end: string;
  period: Period;
  weather: Weather;
  notes: string;
};

type ActiveDrive = {
  driverId: string;
  start: string;
  period: Period;
  weather: Weather;
};

type AppData = {
  version: 1;
  drivers: Driver[];
  sessions: DriveSession[];
  active: ActiveDrive | null;
  selectedId: string | null;
};

type SessionDraft = {
  id: string | null;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: string;
  timeSource: 'duration' | 'end';
  period: Period;
  weather: Weather;
  notes: string;
};

const STORAGE_KEY = 'permit-miles-data-v1';
const EMPTY_DATA: AppData = { version: 1, drivers: [], sessions: [], active: null, selectedId: null };
const weatherOptions: Weather[] = ['Clear', 'Cloudy', 'Rain', 'Snow', 'Other'];

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function durationMs(session: DriveSession) {
  return Math.max(0, new Date(session.end).getTime() - new Date(session.start).getTime());
}

function formatDuration(milliseconds: number, showSeconds = false) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (showSeconds) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function durationBetweenTimes(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return '';
  const minutes = end - start <= 0 ? end - start + 24 * 60 : end - start;
  return String(minutes);
}

function endTimeFromDuration(startTime: string, durationMinutes: string) {
  const start = timeToMinutes(startTime);
  const duration = Number(durationMinutes);
  if (start === null || !Number.isFinite(duration) || duration <= 0 || duration > 24 * 60) return '';
  const end = (start + Math.round(duration)) % (24 * 60);
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

function endsNextDay(startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return start !== null && end !== null && end <= start;
}

function weatherIcon(weather: Weather, size = 17) {
  if (weather === 'Rain') return <CloudRain size={size} />;
  if (weather === 'Snow') return <Snowflake size={size} />;
  if (weather === 'Cloudy') return <Cloud size={size} />;
  return <Sun size={size} />;
}

function percent(value: number, goalHours: number) {
  if (goalHours <= 0) return 0;
  return Math.min(100, Math.round((value / (goalHours * 3_600_000)) * 100));
}

function downloadFile(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(new Date(value).getTime());
}

function parseJsonBackup(text: string): AppData {
  const value = JSON.parse(text) as Partial<AppData>;
  if (value.version !== 1 || !Array.isArray(value.drivers) || !Array.isArray(value.sessions)) {
    throw new Error('This JSON file is not a Permit Hours backup.');
  }

  const drivers = value.drivers.map((driver) => {
    if (!driver || typeof driver.id !== 'string' || typeof driver.name !== 'string' || !driver.name.trim()
      || !Number.isFinite(driver.totalGoal) || !Number.isFinite(driver.nightGoal)) {
      throw new Error('The JSON backup contains an invalid driver.');
    }
    return { ...driver, name: driver.name.trim() };
  });
  const driverIds = new Set(drivers.map((driver) => driver.id));
  if (driverIds.size !== drivers.length) throw new Error('The JSON backup contains duplicate driver IDs.');

  const sessions = value.sessions.map((session) => {
    if (!session || typeof session.id !== 'string' || !driverIds.has(session.driverId)
      || !isDateString(session.start) || !isDateString(session.end)
      || new Date(session.end) <= new Date(session.start)
      || !['day', 'night'].includes(session.period)
      || !weatherOptions.includes(session.weather)
      || typeof session.notes !== 'string') {
      throw new Error('The JSON backup contains an invalid drive entry.');
    }
    return session;
  });

  let active: ActiveDrive | null = null;
  if (value.active) {
    if (!driverIds.has(value.active.driverId) || !isDateString(value.active.start)
      || !['day', 'night'].includes(value.active.period) || !weatherOptions.includes(value.active.weather)) {
      throw new Error('The JSON backup contains an invalid active drive.');
    }
    active = value.active;
  }

  return {
    version: 1,
    drivers,
    sessions,
    active,
    selectedId: typeof value.selectedId === 'string' && driverIds.has(value.selectedId) ? value.selectedId : drivers[0]?.id ?? null,
  };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('The CSV file has an unfinished quoted value.');
  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function importCsvBackup(text: string, current: AppData) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The CSV file does not contain any drive entries.');
  const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim().toLowerCase());
  const requiredHeaders = ['driver', 'start', 'end', 'day_or_night', 'weather', 'notes'];
  if (requiredHeaders.some((header) => !headers.includes(header))) throw new Error('This CSV file is not a Permit Hours export.');
  const column = (name: string) => headers.indexOf(name);
  const drivers = [...current.drivers];
  const sessions = [...current.sessions];
  const driversByName = new Map(drivers.map((driver) => [driver.name.trim().toLowerCase(), driver]));
  const signatures = new Set(sessions.map((session) => `${session.driverId}\u0000${session.start}\u0000${session.end}\u0000${session.period}\u0000${session.weather}\u0000${session.notes}`));
  let imported = 0;
  let duplicates = 0;

  rows.slice(1).forEach((cells, rowIndex) => {
    const driverName = (cells[column('driver')] ?? '').trim();
    const startValue = (cells[column('start')] ?? '').trim();
    const endValue = (cells[column('end')] ?? '').trim();
    const periodValue = (cells[column('day_or_night')] ?? '').trim().toLowerCase();
    const weatherValue = (cells[column('weather')] ?? '').trim();
    const notes = cells[column('notes')] ?? '';
    if (!driverName || !isDateString(startValue) || !isDateString(endValue)
      || new Date(endValue) <= new Date(startValue)
      || !['day', 'night'].includes(periodValue) || !weatherOptions.includes(weatherValue as Weather)) {
      throw new Error(`CSV row ${rowIndex + 2} contains an invalid drive entry.`);
    }

    const driverKey = driverName.toLowerCase();
    let driver = driversByName.get(driverKey);
    if (!driver) {
      driver = { id: id(), name: driverName, totalGoal: 50, nightGoal: 10 };
      drivers.push(driver);
      driversByName.set(driverKey, driver);
    }
    const session = {
      id: id(),
      driverId: driver.id,
      start: new Date(startValue).toISOString(),
      end: new Date(endValue).toISOString(),
      period: periodValue as Period,
      weather: weatherValue as Weather,
      notes,
    } satisfies DriveSession;
    const signature = `${session.driverId}\u0000${session.start}\u0000${session.end}\u0000${session.period}\u0000${session.weather}\u0000${session.notes}`;
    if (signatures.has(signature)) {
      duplicates += 1;
      return;
    }
    signatures.add(signature);
    sessions.push(session);
    imported += 1;
  });

  return {
    data: { ...current, drivers, sessions, selectedId: current.selectedId ?? drivers[0]?.id ?? null },
    imported,
    duplicates,
  };
}

export default function Home() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const [period, setPeriod] = useState<Period>('day');
  const [weather, setWeather] = useState<Weather>('Clear');
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(true);
  const [newName, setNewName] = useState('');
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [driverDraft, setDriverDraft] = useState<Driver>({ id: '', name: '', totalGoal: 50, nightGoal: 10 });
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft | null>(null);
  const [notice, setNotice] = useState('');
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<FamilyRole, 'owner'>>('supervisor');
  const [cloudBusy, setCloudBusy] = useState(false);

  useEffect(() => {
    let initialData = EMPTY_DATA;
    let loadNotice = '';
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppData;
        if (parsed.version === 1 && Array.isArray(parsed.drivers) && Array.isArray(parsed.sessions)) {
          initialData = parsed;
        }
      }
    } catch {
      loadNotice = 'Saved data could not be loaded. A fresh log is ready.';
    }
    const hour = new Date().getHours();
    queueMicrotask(() => {
      setData(initialData);
      setNotice(loadNotice);
      setPeriod(hour < 6 || hour >= 19 ? 'night' : 'day');
      setOnline(navigator.onLine);
      setReady(true);
    });

    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    if ('serviceWorker' in navigator) {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      navigator.serviceWorker.register(`${base}/sw.js`).catch(() => undefined);
    }
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, ready]);

  useEffect(() => {
    if (!data.active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [data.active]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const shareableData = useMemo(() => ({ ...data, selectedId: null }), [data]);
  const acceptCloudData = useCallback((remote: AppData) => {
    setData((current) => ({
      ...remote,
      selectedId: current.selectedId && remote.drivers.some((driver) => driver.id === current.selectedId)
        ? current.selectedId
        : remote.drivers[0]?.id ?? null,
    }));
  }, []);
  const cloud = useFirebaseSync({ data: shareableData, localReady: ready, onRemoteData: acceptCloudData });
  const readOnly = cloud.state.role === 'viewer';

  const selected = data.drivers.find((driver) => driver.id === data.selectedId) ?? data.drivers[0] ?? null;
  const activeDriver = data.drivers.find((driver) => driver.id === data.active?.driverId) ?? null;
  const driverSessions = useMemo(
    () => selected ? data.sessions.filter((session) => session.driverId === selected.id).sort((a, b) => b.start.localeCompare(a.start)) : [],
    [data.sessions, selected],
  );
  const totalTime = driverSessions.reduce((sum, session) => sum + durationMs(session), 0);
  const nightTime = driverSessions.filter((session) => session.period === 'night').reduce((sum, session) => sum + durationMs(session), 0);
  const totalPercent = selected ? percent(totalTime, selected.totalGoal) : 0;
  const nightPercent = selected ? percent(nightTime, selected.nightGoal) : 0;
  const liveDuration = data.active ? now - new Date(data.active.start).getTime() : 0;

  function addFirstDriver(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return setNotice('This account has view-only access.');
    const name = newName.trim();
    if (!name) return;
    const driver: Driver = { id: id(), name, totalGoal: 50, nightGoal: 10 };
    setData({ ...data, drivers: [driver], selectedId: driver.id });
    setNewName('');
    setNotice(`${name} is ready to start logging.`);
  }

  function openAddDriver() {
    if (readOnly) return setNotice('This account has view-only access.');
    setDriverDraft({ id: '', name: '', totalGoal: 50, nightGoal: 10 });
    setDriverDialogOpen(true);
  }

  function openEditDriver(driver: Driver) {
    if (readOnly) return setNotice('This account has view-only access.');
    setDriverDraft({ ...driver });
    setDriverDialogOpen(true);
  }

  function saveDriver(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return setNotice('This account has view-only access.');
    const name = driverDraft.name.trim();
    if (!name) return;
    if (driverDraft.id) {
      setData({ ...data, drivers: data.drivers.map((driver) => driver.id === driverDraft.id ? { ...driverDraft, name } : driver) });
      setNotice('Driver goals updated.');
    } else {
      const driver = { ...driverDraft, id: id(), name };
      setData({ ...data, drivers: [...data.drivers, driver], selectedId: driver.id });
      setNotice(`${name} was added.`);
    }
    setDriverDialogOpen(false);
  }

  function removeDriver() {
    if (readOnly) return setNotice('This account has view-only access.');
    if (!driverDraft.id || !confirm(`Delete ${driverDraft.name} and all of their driving entries?`)) return;
    const remaining = data.drivers.filter((driver) => driver.id !== driverDraft.id);
    setData({
      ...data,
      drivers: remaining,
      sessions: data.sessions.filter((session) => session.driverId !== driverDraft.id),
      active: data.active?.driverId === driverDraft.id ? null : data.active,
      selectedId: remaining[0]?.id ?? null,
    });
    setDriverDialogOpen(false);
    setNotice('Driver and entries deleted.');
  }

  function startDrive() {
    if (readOnly) return setNotice('This account has view-only access.');
    if (!selected || data.active) return;
    const active = { driverId: selected.id, start: new Date().toISOString(), period, weather };
    setNow(Date.now());
    setData({ ...data, active });
  }

  function stopDrive() {
    if (readOnly) return setNotice('This account has view-only access.');
    if (!data.active) return;
    const session: DriveSession = {
      id: id(),
      driverId: data.active.driverId,
      start: data.active.start,
      end: new Date().toISOString(),
      period: data.active.period,
      weather: data.active.weather,
      notes: '',
    };
    setData({ ...data, active: null, sessions: [...data.sessions, session], selectedId: session.driverId });
    setNotice(`Drive saved — ${formatDuration(durationMs(session))}.`);
  }

  function openNewSession() {
    if (readOnly) return setNotice('This account has view-only access.');
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    setSessionDraft({
      id: null,
      date: dateInputValue(start),
      startTime: timeInputValue(start),
      endTime: timeInputValue(end),
      durationMinutes: '60',
      timeSource: 'duration',
      period,
      weather,
      notes: '',
    });
    setSessionDialogOpen(true);
  }

  function openEditSession(session: DriveSession) {
    if (readOnly) return setNotice('This account has view-only access.');
    const start = new Date(session.start);
    const end = new Date(session.end);
    setSessionDraft({
      id: session.id,
      date: dateInputValue(start),
      startTime: timeInputValue(start),
      endTime: timeInputValue(end),
      durationMinutes: String(Math.max(1, Math.round(durationMs(session) / 60_000))),
      timeSource: 'end',
      period: session.period,
      weather: session.weather,
      notes: session.notes,
    });
    setSessionDialogOpen(true);
  }

  function updateSessionStartTime(startTime: string) {
    if (!sessionDraft) return;
    if (sessionDraft.timeSource === 'end') {
      setSessionDraft({ ...sessionDraft, startTime, durationMinutes: durationBetweenTimes(startTime, sessionDraft.endTime) });
      return;
    }
    const endTime = endTimeFromDuration(startTime, sessionDraft.durationMinutes);
    setSessionDraft({ ...sessionDraft, startTime, endTime: endTime || sessionDraft.endTime });
  }

  function updateSessionDuration(durationMinutes: string) {
    if (!sessionDraft) return;
    const endTime = endTimeFromDuration(sessionDraft.startTime, durationMinutes);
    setSessionDraft({ ...sessionDraft, durationMinutes, timeSource: 'duration', endTime: endTime || sessionDraft.endTime });
  }

  function updateSessionEndTime(endTime: string) {
    if (!sessionDraft) return;
    setSessionDraft({
      ...sessionDraft,
      endTime,
      durationMinutes: durationBetweenTimes(sessionDraft.startTime, endTime),
      timeSource: 'end',
    });
  }

  function saveSession(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return setNotice('This account has view-only access.');
    if (!selected || !sessionDraft) return;
    const start = new Date(`${sessionDraft.date}T${sessionDraft.startTime}`);
    const end = new Date(`${sessionDraft.date}T${sessionDraft.endTime}`);
    if (end <= start) end.setDate(end.getDate() + 1);
    const session: DriveSession = {
      id: sessionDraft.id ?? id(),
      driverId: selected.id,
      start: start.toISOString(),
      end: end.toISOString(),
      period: sessionDraft.period,
      weather: sessionDraft.weather,
      notes: sessionDraft.notes.trim(),
    };
    setData({
      ...data,
      sessions: sessionDraft.id
        ? data.sessions.map((item) => item.id === sessionDraft.id ? session : item)
        : [...data.sessions, session],
    });
    setSessionDialogOpen(false);
    setNotice(sessionDraft.id ? 'Drive updated.' : 'Drive added.');
  }

  function removeSession(session: DriveSession) {
    if (readOnly) return setNotice('This account has view-only access.');
    if (!confirm('Delete this drive from the log?')) return;
    setData({ ...data, sessions: data.sessions.filter((item) => item.id !== session.id) });
    setNotice('Drive deleted.');
  }

  function exportJson() {
    downloadFile(`permit-hours-${dateInputValue(new Date())}.json`, JSON.stringify(data, null, 2), 'application/json');
  }

  function exportCsv() {
    const header = ['driver', 'start', 'end', 'minutes', 'day_or_night', 'weather', 'notes'];
    const rows = data.sessions.map((session) => {
      const driver = data.drivers.find((item) => item.id === session.driverId);
      return [driver?.name ?? 'Unknown', session.start, session.end, Math.round(durationMs(session) / 60_000), session.period, session.weather, session.notes];
    });
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    downloadFile(`permit-hours-${dateInputValue(new Date())}.csv`, csv, 'text/csv;charset=utf-8');
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (readOnly) return setNotice('This account has view-only access.');
    if (file.size > 5 * 1024 * 1024) return setNotice('That backup is too large to import.');

    try {
      const text = await file.text();
      const isJson = file.name.toLowerCase().endsWith('.json') || file.type.includes('json');
      if (isJson) {
        const imported = parseJsonBackup(text);
        const hasCurrentLog = data.drivers.length > 0 || data.sessions.length > 0 || data.active;
        if (hasCurrentLog && !confirm('Restore this JSON backup? It will replace the current log on this device and in family sync.')) return;
        setData(imported);
        setNotice(`Backup restored — ${imported.sessions.length} drive${imported.sessions.length === 1 ? '' : 's'}.`);
        return;
      }

      const result = importCsvBackup(text, data);
      setData(result.data);
      const duplicateNote = result.duplicates ? ` ${result.duplicates} duplicate${result.duplicates === 1 ? '' : 's'} skipped.` : '';
      setNotice(`${result.imported} drive${result.imported === 1 ? '' : 's'} imported.${duplicateNote}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That backup could not be imported.');
    }
  }

  async function runCloudAction(action: () => Promise<void>, success?: string) {
    setCloudBusy(true);
    try {
      await action();
      if (success) setNotice(success);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud action failed. Please try again.';
      setNotice(message.includes('permission') ? 'That Google account does not have access yet.' : message);
      return false;
    } finally {
      setCloudBusy(false);
    }
  }

  function addHouseholdMember(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    const members = {
      supervisorEmails: inviteRole === 'supervisor'
        ? [...cloud.state.members.supervisorEmails, email]
        : cloud.state.members.supervisorEmails.filter((item) => item !== email),
      viewerEmails: inviteRole === 'viewer'
        ? [...cloud.state.members.viewerEmails, email]
        : cloud.state.members.viewerEmails.filter((item) => item !== email),
    };
    void runCloudAction(() => cloud.updateMembers(members), `${email} can now sign in.`).then((saved) => {
      if (saved) setInviteEmail('');
    });
  }

  function removeHouseholdMember(email: string) {
    void runCloudAction(() => cloud.updateMembers({
      supervisorEmails: cloud.state.members.supervisorEmails.filter((item) => item !== email),
      viewerEmails: cloud.state.members.viewerEmails.filter((item) => item !== email),
    }), 'Access removed.');
  }

  const syncIcon = !online || cloud.state.status === 'offline'
    ? <WifiOff size={15} />
    : cloud.state.user
      ? <Cloud size={15} />
      : <CloudUpload size={15} />;

  if (!ready) {
    return <main className="loading-screen"><span className="brand-mark"><CarFront size={20} /></span><span>Loading Permit Hours…</span></main>;
  }

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Permit Hours home">
          <span className="brand-mark"><CarFront size={20} strokeWidth={2.4} /></span>
          <span>Permit Hours</span>
        </a>
        <div className="top-actions">
          {(!readOnly || data.drivers.length > 0) && (
            <div className="export-actions" aria-label="Import and export data">
              {!readOnly && <label className="import-action" title="Import JSON or CSV">
                <Upload size={16} /> <span>Import</span>
                <input className="file-picker" type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => void importBackup(event)} />
              </label>}
              {data.drivers.length > 0 && <>
                <button type="button" onClick={exportJson} title="Export JSON"><FileJson size={16} /> <span>JSON</span></button>
                <button type="button" onClick={exportCsv} title="Export CSV"><FileSpreadsheet size={16} /> <span>CSV</span></button>
              </>}
            </div>
          )}
          <button
            className={`sync-pill ${cloud.state.status} ${online ? '' : 'offline'}`}
            type="button"
            onClick={() => setAccountDialogOpen(true)}
            aria-label="Cloud sync and household access"
          >
            {syncIcon}<span>{cloud.state.user ? cloud.state.message : online ? 'Sync with Google' : 'Working offline'}</span>
          </button>
        </div>
      </header>

      {data.drivers.length === 0 ? (
        <section className="welcome-panel">
          <div className="welcome-art"><CarFront size={36} /></div>
          <p className="eyebrow">Offline first</p>
          <h1>Start a driving log.</h1>
          <p>Your log is saved on this device, works without a signal, and can sync securely across your family’s devices.</p>
          {readOnly ? (
            <div className="readonly-empty"><Eye size={21} /><span>No drivers have been added to this shared log yet.</span></div>
          ) : (
            <form onSubmit={addFirstDriver} className="welcome-form">
              <label htmlFor="first-driver">Driver’s first name</label>
              <div><Input id="first-driver" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Maya" /><Button type="submit" disabled={!newName.trim()}><Plus /> Add driver</Button></div>
            </form>
          )}
          <div className="default-note"><Check size={16} /> Starts with Colorado’s default goals: 50 hours total, including 10 at night.</div>
        </section>
      ) : (
        <>
          <section className="driver-bar" aria-label="Drivers">
            {data.drivers.map((driver) => (
              <button
                className={`driver-chip ${selected?.id === driver.id ? 'active' : ''}`}
                key={driver.id}
                type="button"
                onClick={() => setData({ ...data, selectedId: driver.id })}
              >
                <span className="avatar">{driver.name.charAt(0).toUpperCase()}</span>
                {driver.name}
                {data.active?.driverId === driver.id && <span className="live-dot" aria-label="drive in progress" />}
              </button>
            ))}
            {!readOnly && <button className="add-driver" type="button" onClick={openAddDriver}><Plus size={17} /> Add driver</button>}
          </section>

          <div className="dashboard">
            <section className={`drive-panel ${data.active?.driverId === selected?.id ? 'is-driving' : ''}`}>
              {data.active?.driverId === selected?.id ? (
                <>
                  <div>
                    <p className="eyebrow live-label"><span /> Drive in progress · {data.active.period}</p>
                    <h1>Keep your eyes on the road.</h1>
                    <p className="lede">Started at {new Date(data.active.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {data.active.weather}</p>
                  </div>
                  <div className="timer" aria-live="off">{formatDuration(liveDuration, true)}</div>
                  {readOnly ? (
                    <div className="viewer-badge"><Eye size={16} /> Live view only</div>
                  ) : (
                    <button className="stop-button" type="button" onClick={stopDrive}>
                      <span><Square size={20} fill="currentColor" /></span>
                      <strong>Stop & save</strong>
                      <small>End this drive</small>
                    </button>
                  )}
                  <p className="save-note">{readOnly ? 'A supervising driver can stop and save this drive.' : 'The timer keeps running if you close the app.'}</p>
                </>
              ) : data.active && activeDriver ? (
                <div className="other-active">
                  <span className="other-active-icon"><CarFront size={28} /></span>
                  <p className="eyebrow">Drive in progress</p>
                  <h1>{activeDriver.name} is on the road.</h1>
                  <p>The app tracks one active drive at a time on this device.</p>
                  <Button type="button" onClick={() => setData({ ...data, selectedId: activeDriver.id })}>View active drive</Button>
                </div>
              ) : readOnly ? (
                <div className="viewer-panel">
                  <span className="other-active-icon"><Eye size={28} /></span>
                  <p className="eyebrow">View-only access</p>
                  <h1>{selected?.name}’s progress is up to date.</h1>
                  <p>You can review hours and driving history. A supervising adult can start drives or change the log.</p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="eyebrow">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p>
                    <h1>Ready for a drive, {selected?.name}?</h1>
                    <p className="lede">Choose the conditions, then start the clock.</p>
                  </div>
                  <div className="drive-options">
                    <div className="period-toggle" aria-label="Drive period">
                      <button className={period === 'day' ? 'selected' : ''} onClick={() => setPeriod('day')} type="button"><Sun size={18} /> Day</button>
                      <button className={period === 'night' ? 'selected' : ''} onClick={() => setPeriod('night')} type="button"><Moon size={18} /> Night</button>
                    </div>
                    <div className="weather-options" aria-label="Weather">
                      {weatherOptions.map((option) => (
                        <button className={weather === option ? 'selected' : ''} key={option} type="button" onClick={() => setWeather(option)}>
                          {weatherIcon(option)}<span>{option}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="start-button" type="button" onClick={startDrive} aria-label="Start drive">
                    <span className="start-icon">▶</span>
                    <strong>Start drive</strong>
                    <small>Tap when you’re ready</small>
                  </button>
                  <p className="save-note">Your drive is saved locally as soon as you stop.</p>
                </>
              )}
            </section>

            <aside className="progress-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Driving goals</p>
                  <h2>{totalPercent}% complete</h2>
                </div>
                {selected && !readOnly && <button type="button" onClick={() => openEditDriver(selected)} aria-label="Edit driver and goals"><Settings2 size={19} /></button>}
              </div>
              <GoalCard icon={<CarFront size={20} />} label="Total time" value={totalTime} goal={selected?.totalGoal ?? 50} progress={totalPercent} />
              <GoalCard icon={<Moon size={20} />} label="Night time" value={nightTime} goal={selected?.nightGoal ?? 10} progress={nightPercent} night />
              <div className="encouragement">
                <Sun size={19} />
                <p><strong>{totalPercent >= 100 ? 'Goal reached!' : 'Keep it rolling.'}</strong> {totalPercent >= 100 ? 'You’ve completed the total-time goal.' : `${formatDuration(Math.max(0, (selected?.totalGoal ?? 50) * 3_600_000 - totalTime))} left to reach the total goal.`}</p>
              </div>
              <div className="privacy-note">{cloud.state.user ? <Cloud size={16} /> : <Download size={16} />}<p><strong>{cloud.state.user ? 'Offline-safe cloud sync.' : 'Stored on this device.'}</strong> {cloud.state.user ? 'Changes save locally first and sync when a connection is available.' : 'Sign in to sync with your family, or export a backup.'}</p></div>
            </aside>
          </div>

          <section className="history-panel">
            <div className="history-heading">
              <div><p className="eyebrow">Drive log</p><h2>Recent drives</h2></div>
              {!readOnly && <Button variant="outline" type="button" onClick={openNewSession}><Plus /> Add drive</Button>}
            </div>
            {driverSessions.length === 0 ? (
              <div className="empty-history"><History size={24} /><div><strong>No drives yet</strong><p>Start the timer or add a past drive manually.</p></div></div>
            ) : (
              <div className="session-list">
                {driverSessions.map((session) => (
                  <article className="session-row" key={session.id}>
                    <div className={`session-period ${session.period}`} aria-label={`${session.period} drive`}>{session.period === 'day' ? <Sun size={18} /> : <Moon size={18} />}</div>
                    <div className="session-date"><strong>{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(session.start))}</strong><span>{new Date(session.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}–{new Date(session.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>
                    <div className="session-weather">{weatherIcon(session.weather)}<span>{session.weather}</span></div>
                    <strong className="session-duration">{formatDuration(durationMs(session))}</strong>
                    {!readOnly && <div className="session-actions"><button type="button" onClick={() => openEditSession(session)} aria-label="Edit drive"><Pencil size={16} /></button><button type="button" onClick={() => removeSession(session)} aria-label="Delete drive"><Trash2 size={16} /></button></div>}
                    {session.notes && <p className="session-notes">{session.notes}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {notice && <output className="toast"><Check size={17} /> {notice}</output>}

      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent className="permit-dialog account-dialog sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Family sync</DialogTitle>
            <DialogDescription>Keep everyone’s copy of the driving log current—even when a device temporarily loses its connection.</DialogDescription>
          </DialogHeader>

          {!cloud.state.user ? (
            <div className="account-intro">
              <span className="account-hero"><CloudUpload size={28} /></span>
              <div><strong>Sync with your Google account</strong><p>Your local log stays available offline. When connected, Firebase syncs it to approved family members.</p></div>
              <Button type="button" disabled={cloudBusy || !online} onClick={() => void runCloudAction(cloud.signInWithGoogle)}><UserRound /> Continue with Google</Button>
              {!online && <small>Connect to the internet once to sign in. Your driving log remains available offline.</small>}
            </div>
          ) : (
            <div className="account-content">
              <div className="account-profile">
                <span>{(cloud.state.user.displayName ?? cloud.state.user.email ?? '?').charAt(0).toUpperCase()}</span>
                <div><strong>{cloud.state.user.displayName ?? 'Google account'}</strong><small>{cloud.state.user.email}</small></div>
                {cloud.state.role && <em>{cloud.state.role === 'owner' ? 'Owner' : cloud.state.role === 'supervisor' ? 'Supervisor' : 'View only'}</em>}
              </div>

              {(cloud.state.status === 'setup' || cloud.state.status === 'unapproved') && (
                <div className={`access-message ${cloud.state.status}`}>
                  <ShieldCheck size={21} />
                  <div>
                    <strong>{cloud.state.status === 'setup' ? 'Create your shared household' : 'This account is not approved yet'}</strong>
                    <p>{cloud.state.status === 'setup'
                      ? 'Your current on-device log will become a new, private family log. You’ll be its owner.'
                      : 'Ask the household owner to add this exact email, or sign out and use another Google account.'}</p>
                  </div>
                  {cloud.state.status === 'setup' && <Button type="button" disabled={cloudBusy || !online} onClick={() => void runCloudAction(cloud.createHousehold, 'Family sync is ready.')}>
                    Create & sync
                  </Button>}
                </div>
              )}

              {cloud.state.cloudReady && (
                <div className="sync-summary">
                  {cloud.state.status === 'offline' ? <WifiOff size={19} /> : <Cloud size={19} />}
                  <div><strong>{cloud.state.message}</strong><p>{cloud.state.status === 'offline' ? 'Changes stay on this device and will upload automatically after reconnecting.' : 'This device and your family’s other signed-in devices share one driving log.'}</p></div>
                </div>
              )}

              {cloud.state.role === 'owner' && cloud.state.cloudReady && (
                <section className="household-access">
                  <div className="access-heading"><Users size={19} /><div><strong>Household access</strong><p>Add exact Google-account email addresses.</p></div></div>
                  <form className="invite-form" onSubmit={addHouseholdMember}>
                    <Input type="email" aria-label="Family member email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="family@example.com" required />
                    <select aria-label="Access role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Exclude<FamilyRole, 'owner'>)}>
                      <option value="supervisor">Supervising adult</option>
                      <option value="viewer">View only</option>
                    </select>
                    <Button type="submit" disabled={cloudBusy || !inviteEmail.trim()}>Add</Button>
                  </form>
                  <div className="member-list">
                    {cloud.state.members.supervisorEmails.map((email) => <MemberRow key={email} email={email} accessLabel="Supervising adult" disabled={cloudBusy} onRemove={() => removeHouseholdMember(email)} />)}
                    {cloud.state.members.viewerEmails.map((email) => <MemberRow key={email} email={email} accessLabel="View only" disabled={cloudBusy} onRemove={() => removeHouseholdMember(email)} />)}
                    {cloud.state.members.supervisorEmails.length + cloud.state.members.viewerEmails.length === 0 && <p className="no-members">No additional family members yet.</p>}
                  </div>
                  <p className="role-help"><ShieldCheck size={15} /><span><strong>Supervising adults</strong> can start, stop, and edit drives. <strong>View-only members</strong> can follow progress without changing the log.</span></p>
                </section>
              )}

              {cloud.state.role && cloud.state.role !== 'owner' && cloud.state.cloudReady && (
                <div className="role-explainer">
                  {cloud.state.role === 'viewer' ? <Eye size={19} /> : <ShieldCheck size={19} />}
                  <p>{cloud.state.role === 'viewer' ? 'You can see drivers, goals, and drive history, but you cannot change the shared log.' : 'You can start, stop, and edit drives. Only the household owner can manage access.'}</p>
                </div>
              )}
            </div>
          )}

          {cloud.state.user && <DialogFooter><Button variant="outline" type="button" disabled={cloudBusy} onClick={() => void runCloudAction(cloud.signOutUser)}><LogOut /> Sign out</Button></DialogFooter>}
        </DialogContent>
      </Dialog>

      <Dialog open={driverDialogOpen} onOpenChange={setDriverDialogOpen}>
        <DialogContent className="permit-dialog sm:max-w-md">
          <DialogHeader><DialogTitle>{driverDraft.id ? 'Driver settings' : 'Add a driver'}</DialogTitle><DialogDescription>Each driver has their own goals and driving log on this device.</DialogDescription></DialogHeader>
          <form id="driver-form" onSubmit={saveDriver} className="dialog-form">
            <label htmlFor="driver-name">Name<Input id="driver-name" value={driverDraft.name} onChange={(event) => setDriverDraft({ ...driverDraft, name: event.target.value })} placeholder="First name" required /></label>
            <div className="form-grid"><label htmlFor="total-goal">Total hours goal<Input id="total-goal" type="number" min="1" step="1" value={driverDraft.totalGoal} onChange={(event) => setDriverDraft({ ...driverDraft, totalGoal: Number(event.target.value) })} required /></label><label htmlFor="night-goal">Night hours goal<Input id="night-goal" type="number" min="0" step="1" value={driverDraft.nightGoal} onChange={(event) => setDriverDraft({ ...driverDraft, nightGoal: Number(event.target.value) })} required /></label></div>
          </form>
          <DialogFooter className="permit-dialog-footer">
            {driverDraft.id && <Button variant="destructive" type="button" onClick={removeDriver}><Trash2 /> Delete</Button>}
            <div><Button variant="outline" type="button" onClick={() => setDriverDialogOpen(false)}>Cancel</Button><Button type="submit" form="driver-form">Save driver</Button></div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogContent className="permit-dialog sm:max-w-lg">
          <DialogHeader><DialogTitle>{sessionDraft?.id ? 'Edit drive' : 'Add a drive'}</DialogTitle><DialogDescription>Enter an end time or a duration—the other value updates automatically.</DialogDescription></DialogHeader>
          {sessionDraft && <form id="session-form" onSubmit={saveSession} className="dialog-form">
            <label htmlFor="drive-date">Date<Input id="drive-date" type="date" value={sessionDraft.date} onChange={(event) => setSessionDraft({ ...sessionDraft, date: event.target.value })} required /></label>
            <div className="time-entry-grid">
              <label htmlFor="drive-start">Started<Input id="drive-start" type="time" value={sessionDraft.startTime} onChange={(event) => updateSessionStartTime(event.target.value)} required /></label>
              <label htmlFor="drive-end">Ended<Input id="drive-end" type="time" value={sessionDraft.endTime} onChange={(event) => updateSessionEndTime(event.target.value)} required /></label>
              <label htmlFor="drive-duration">Duration <span>(minutes)</span><Input id="drive-duration" type="number" inputMode="numeric" min="1" max="1440" step="1" value={sessionDraft.durationMinutes} onChange={(event) => updateSessionDuration(event.target.value)} required /></label>
            </div>
            <p className="duration-summary" aria-live="polite"><Clock3 size={15} /><span>Calculated drive time: <strong>{formatDuration(Number(sessionDraft.durationMinutes || 0) * 60_000)}</strong>{endsNextDay(sessionDraft.startTime, sessionDraft.endTime) ? ' · ends the next day' : ''}</span></p>
            <div className="form-grid"><label htmlFor="drive-period">Time of day<select id="drive-period" value={sessionDraft.period} onChange={(event) => setSessionDraft({ ...sessionDraft, period: event.target.value as Period })}><option value="day">Day</option><option value="night">Night</option></select></label><label htmlFor="drive-weather">Weather<select id="drive-weather" value={sessionDraft.weather} onChange={(event) => setSessionDraft({ ...sessionDraft, weather: event.target.value as Weather })}>{weatherOptions.map((option) => <option key={option}>{option}</option>)}</select></label></div>
            <label htmlFor="drive-notes">Notes <span>(optional)</span><textarea id="drive-notes" rows={3} value={sessionDraft.notes} onChange={(event) => setSessionDraft({ ...sessionDraft, notes: event.target.value })} placeholder="Highway practice, parking, rain…" /></label>
          </form>}
          <DialogFooter><Button variant="outline" type="button" onClick={() => setSessionDialogOpen(false)}>Cancel</Button><Button type="submit" form="session-form">Save drive</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function GoalCard({ icon, label, value, goal, progress, night = false }: { icon: React.ReactNode; label: string; value: number; goal: number; progress: number; night?: boolean }) {
  return (
    <div className={`goal-card ${night ? 'night-goal' : ''}`}>
      <div className="goal-icon">{icon}</div>
      <div className="goal-copy"><span>{label}</span><strong>{formatDuration(value)} <small>of {goal}h</small></strong></div>
      <span className="goal-percent">{progress}%</span>
      <div className="meter" aria-label={`${progress}% of ${label.toLowerCase()} goal`}><span style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

function MemberRow({ email, accessLabel, disabled, onRemove }: { email: string; accessLabel: string; disabled: boolean; onRemove: () => void }) {
  return (
    <div className="member-row">
      <span><strong>{email}</strong><small>{accessLabel}</small></span>
      <button type="button" disabled={disabled} onClick={onRemove} aria-label={`Remove ${email}`}><Trash2 size={15} /></button>
    </div>
  );
}
