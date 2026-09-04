'use client';

import { ChangeEvent, SubmitEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CarFront,
  Check,
  CircleHelp,
  Clock3,
  Cloud,
  CloudRain,
  CloudUpload,
  Download,
  Eye,
  FileJson,
  FileSpreadsheet,
  FileText,
  History,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useFirebaseSync, type FamilyRole } from '@/lib/firebase-sync';
import {
  IMPORT_FIELDS,
  IMPORT_PRESETS,
  detectImportPreset,
  mappingKey,
  normalizeCsvRows,
  parseCsvImport,
  suggestCsvMapping,
  type CsvMapping,
  type ImportCandidate,
  type ImportDateFormat,
  type ImportDurationUnit,
  type ImportOptions,
  type ImportRowResult,
  type ParsedCsv,
} from '@/lib/csv-import';
import { isStudentDrivingLoggerBackup, parseStudentDrivingLoggerBackup } from '@/lib/student-driving-logger-import';
import { parseRoadReadyPdf } from '@/lib/roadready-pdf-import';

type Period = 'day' | 'night';
type Weather = 'Clear' | 'Cloudy' | 'Rain' | 'Snow' | 'Other';

type Driver = {
  id: string;
  name: string;
  legalName?: string;
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
  importBatchId?: string;
  importSource?: string;
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

type CsvImportPreview = {
  ready: ImportCandidate[];
  duplicates: number;
  errors: ImportRowResult[];
};

type CsvImportDraft = {
  fileName: string;
  parsed: ParsedCsv;
  mapping: CsvMapping;
  presetId: string;
  options: ImportOptions;
  step: 'map' | 'preview' | 'done';
  preview: CsvImportPreview | null;
  remembered: boolean;
  imported: { sessionIds: string[]; createdDriverIds: string[] } | null;
};

type SavedImportMapping = {
  mapping: CsvMapping;
  presetId: string;
  dateFormat: ImportDateFormat;
  durationUnit: ImportDurationUnit;
};

const STORAGE_KEY = 'permit-miles-data-v1';
const IMPORT_MAPPINGS_KEY = 'permit-hours-import-mappings-v1';
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
  if (weather === 'Other') return <CircleHelp size={size} />;
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

function printDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' }).format(value);
}

function printTime(value: Date) {
  return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
      || (driver.legalName !== undefined && typeof driver.legalName !== 'string')
      || !Number.isFinite(driver.totalGoal) || !Number.isFinite(driver.nightGoal)) {
      throw new Error('The JSON backup contains an invalid driver.');
    }
    return { ...driver, name: driver.name.trim(), legalName: driver.legalName?.trim() || undefined };
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

export default function Home() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const [period, setPeriod] = useState<Period>('day');
  const [weather, setWeather] = useState<Weather>('Clear');
  const [revealedWeather, setRevealedWeather] = useState<{ value: Weather } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(true);
  const [newName, setNewName] = useState('');
  const [driverDialogOpen, setDriverDialogOpen] = useState(false);
  const [driverDraft, setDriverDraft] = useState<Driver>({ id: '', name: '', legalName: '', totalGoal: 50, nightGoal: 10 });
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<DriveSession | null>(null);
  const [csvImport, setCsvImport] = useState<CsvImportDraft | null>(null);
  const [notice, setNotice] = useState('');
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Exclude<FamilyRole, 'owner'>>('supervisor');
  const [cloudBusy, setCloudBusy] = useState(false);
  const [importingFile, setImportingFile] = useState(false);

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

  useEffect(() => {
    if (!revealedWeather) return;
    const timer = window.setTimeout(() => setRevealedWeather(null), 1800);
    return () => window.clearTimeout(timer);
  }, [revealedWeather]);

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
  const printableSessions = useMemo(() => [...driverSessions].sort((a, b) => a.start.localeCompare(b.start)), [driverSessions]);
  const totalTime = driverSessions.reduce((sum, session) => sum + durationMs(session), 0);
  const nightTime = driverSessions.filter((session) => session.period === 'night').reduce((sum, session) => sum + durationMs(session), 0);
  const totalPercent = selected ? percent(totalTime, selected.totalGoal) : 0;
  const nightPercent = selected ? percent(nightTime, selected.nightGoal) : 0;
  const liveDuration = data.active ? now - new Date(data.active.start).getTime() : 0;

  function selectWeather(option: Weather) {
    setWeather(option);
    setRevealedWeather({ value: option });
  }

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
    setDriverDraft({ id: '', name: '', legalName: '', totalGoal: 50, nightGoal: 10 });
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
    const legalName = driverDraft.legalName?.trim() || undefined;
    if (!name) return;
    if (driverDraft.id) {
      setData({ ...data, drivers: data.drivers.map((driver) => driver.id === driverDraft.id ? { ...driverDraft, name, legalName } : driver) });
      setNotice('Driver details updated.');
    } else {
      const driver = { ...driverDraft, id: id(), name, legalName };
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

  function removeSession() {
    if (readOnly) return setNotice('This account has view-only access.');
    if (!sessionToDelete) return;
    setData((current) => ({ ...current, sessions: current.sessions.filter((item) => item.id !== sessionToDelete.id) }));
    setSessionToDelete(null);
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

  function printDrivingLog() {
    if (!selected) return;
    const previousTitle = document.title;
    const safeName = selected.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'driver';
    const restoreTitle = () => { document.title = previousTitle; };
    document.title = `permit-hours-${safeName}-${dateInputValue(new Date())}`;
    window.addEventListener('afterprint', restoreTitle, { once: true });
    window.print();
    window.setTimeout(restoreTitle, 1_000);
  }

  function prepareImportPreview(draft: CsvImportDraft): CsvImportPreview {
    const results = normalizeCsvRows(draft.parsed, draft.mapping, draft.options);
    const driversByName = new Map(data.drivers.map((driver) => [driver.name.trim().toLowerCase(), driver.id]));
    const signatures = new Set(data.sessions.map((session) => `${session.driverId}\u0000${session.start}\u0000${session.end}\u0000${session.period}\u0000${session.weather}\u0000${session.notes}`));
    const ready: ImportCandidate[] = [];
    const errors: ImportRowResult[] = [];
    let duplicates = 0;

    results.forEach((result) => {
      if (!result.candidate) {
        errors.push(result);
        return;
      }
      const candidate = result.candidate;
      const driverKey = candidate.driverName.trim().toLowerCase();
      const driverId = driversByName.get(driverKey) ?? `new:${driverKey}`;
      const signature = `${driverId}\u0000${candidate.start}\u0000${candidate.end}\u0000${candidate.period}\u0000${candidate.weather}\u0000${candidate.notes}`;
      if (signatures.has(signature)) {
        duplicates += 1;
        return;
      }
      signatures.add(signature);
      ready.push(candidate);
    });
    return { ready, duplicates, errors };
  }

  function openParsedImport(fileName: string, parsed: ParsedCsv, sourcePreset?: string) {
    const key = mappingKey(parsed.headers);
    let saved: SavedImportMapping | null = null;
    try {
      const mappings = JSON.parse(localStorage.getItem(IMPORT_MAPPINGS_KEY) ?? '{}') as Record<string, SavedImportMapping>;
      saved = mappings[key] ?? null;
    } catch {
      saved = null;
    }
    const detectedPreset = sourcePreset ?? saved?.presetId ?? detectImportPreset(fileName, parsed.headers);
    const savedMappingIsValid = saved && IMPORT_FIELDS.every(({ id: field }) => saved!.mapping[field] === null
      || Number.isInteger(saved!.mapping[field]) && saved!.mapping[field]! >= 0 && saved!.mapping[field]! < parsed.headers.length);
    setCsvImport({
      fileName,
      parsed,
      mapping: savedMappingIsValid ? saved!.mapping : suggestCsvMapping(parsed, detectedPreset),
      presetId: detectedPreset,
      options: {
        dateFormat: saved?.dateFormat ?? 'auto',
        durationUnit: saved?.durationUnit ?? 'auto',
        defaultDriver: selected?.name ?? '',
        defaultStartTime: '',
        defaultPeriod: period,
        defaultWeather: weather,
      },
      step: 'map',
      preview: null,
      remembered: Boolean(savedMappingIsValid),
      imported: null,
    });
  }

  function openCsvImport(fileName: string, text: string) {
    openParsedImport(fileName, parseCsvImport(text));
  }

  function setImportPreset(presetId: string) {
    setCsvImport((current) => current ? {
      ...current,
      presetId,
      mapping: suggestCsvMapping(current.parsed, presetId),
      preview: null,
      remembered: false,
    } : null);
  }

  function previewCsvImport() {
    if (!csvImport) return;
    const preview = prepareImportPreview(csvImport);
    setCsvImport({ ...csvImport, preview, step: 'preview' });
  }

  function commitCsvImport() {
    if (!csvImport?.preview?.ready.length) return;
    const batchId = id();
    const drivers = [...data.drivers];
    const sessions = [...data.sessions];
    const driversByName = new Map(drivers.map((driver) => [driver.name.trim().toLowerCase(), driver]));
    const signatures = new Set(sessions.map((session) => `${session.driverId}\u0000${session.start}\u0000${session.end}\u0000${session.period}\u0000${session.weather}\u0000${session.notes}`));
    const sessionIds: string[] = [];
    const createdDriverIds: string[] = [];

    csvImport.preview.ready.forEach((candidate) => {
      const driverKey = candidate.driverName.trim().toLowerCase();
      let driver = driversByName.get(driverKey);
      if (!driver) {
        driver = { id: id(), name: candidate.driverName.trim(), totalGoal: 50, nightGoal: 10 };
        drivers.push(driver);
        driversByName.set(driverKey, driver);
        createdDriverIds.push(driver.id);
      }
      const signature = `${driver.id}\u0000${candidate.start}\u0000${candidate.end}\u0000${candidate.period}\u0000${candidate.weather}\u0000${candidate.notes}`;
      if (signatures.has(signature)) return;
      signatures.add(signature);
      const session: DriveSession = {
        id: id(),
        driverId: driver.id,
        start: candidate.start,
        end: candidate.end,
        period: candidate.period,
        weather: candidate.weather,
        notes: candidate.notes,
        importBatchId: batchId,
        importSource: csvImport.fileName,
      };
      sessions.push(session);
      sessionIds.push(session.id);
    });

    if (!sessionIds.length) return setNotice('Those drives are already in the log.');
    setData({ ...data, drivers, sessions, selectedId: data.selectedId ?? drivers[0]?.id ?? null });
    try {
      const key = mappingKey(csvImport.parsed.headers);
      const mappings = JSON.parse(localStorage.getItem(IMPORT_MAPPINGS_KEY) ?? '{}') as Record<string, SavedImportMapping>;
      mappings[key] = {
        mapping: csvImport.mapping,
        presetId: csvImport.presetId,
        dateFormat: csvImport.options.dateFormat,
        durationUnit: csvImport.options.durationUnit,
      };
      localStorage.setItem(IMPORT_MAPPINGS_KEY, JSON.stringify(mappings));
    } catch {
      // Import still succeeds if this browser cannot remember mapping preferences.
    }
    setCsvImport({ ...csvImport, step: 'done', imported: { sessionIds, createdDriverIds } });
  }

  function undoCsvImport() {
    if (!csvImport?.imported) return;
    const sessionIds = new Set(csvImport.imported.sessionIds);
    const createdDriverIds = new Set(csvImport.imported.createdDriverIds);
    setData((current) => {
      const sessions = current.sessions.filter((session) => !sessionIds.has(session.id));
      const drivers = current.drivers.filter((driver) => !createdDriverIds.has(driver.id) || sessions.some((session) => session.driverId === driver.id));
      return {
        ...current,
        sessions,
        drivers,
        selectedId: drivers.some((driver) => driver.id === current.selectedId) ? current.selectedId : drivers[0]?.id ?? null,
      };
    });
    setCsvImport(null);
    setNotice('Import undone.');
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (readOnly) return setNotice('This account has view-only access.');
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const maximumSize = isPdf ? 15 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maximumSize) return setNotice(`That ${isPdf ? 'PDF' : 'backup'} is too large to import.`);

    setImportingFile(true);
    try {
      if (isPdf) {
        setNotice('Reading RoadReady PDF…');
        openParsedImport(file.name, await parseRoadReadyPdf(await file.arrayBuffer()), 'roadready');
        setNotice('RoadReady drives are ready to review.');
        return;
      }
      const text = await file.text();
      const isJson = file.name.toLowerCase().endsWith('.json') || file.type.includes('json');
      if (isJson) {
        const jsonValue = JSON.parse(text) as unknown;
        if (isStudentDrivingLoggerBackup(jsonValue)) {
          openParsedImport(file.name, parseStudentDrivingLoggerBackup(jsonValue), 'driving-logger');
          return;
        }
        const imported = parseJsonBackup(text);
        const hasCurrentLog = data.drivers.length > 0 || data.sessions.length > 0 || data.active;
        if (hasCurrentLog && !confirm('Restore this JSON backup? It will replace the current log on this device and in family sync.')) return;
        setData(imported);
        setNotice(`Backup restored — ${imported.sessions.length} drive${imported.sessions.length === 1 ? '' : 's'}.`);
        return;
      }

      openCsvImport(file.name, text);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'That backup could not be imported.');
    } finally {
      setImportingFile(false);
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
              {!readOnly && <label className={`import-action ${importingFile ? 'busy' : ''}`} title="Import PDF, JSON, CSV, or TSV" aria-disabled={importingFile}>
                <Upload size={16} /> <span>{importingFile ? 'Reading…' : 'Import'}</span>
                <input className="file-picker" type="file" disabled={importingFile} accept=".pdf,.json,.csv,.tsv,application/pdf,application/json,text/csv,text/tab-separated-values" onChange={(event) => void importBackup(event)} />
              </label>}
              {data.drivers.length > 0 && <>
                <DropdownMenu>
                  <DropdownMenuTrigger type="button" title="Export driving data"><Download size={16} /> <span>Export</span></DropdownMenuTrigger>
                  <DropdownMenuContent className="export-menu" align="end">
                    <DropdownMenuItem onClick={exportJson}><FileJson /><span><strong>JSON backup</strong><small>Complete data for restoring later</small></span></DropdownMenuItem>
                    <DropdownMenuItem onClick={exportCsv}><FileSpreadsheet /><span><strong>CSV spreadsheet</strong><small>Drive history for other apps</small></span></DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button type="button" onClick={printDrivingLog} title={`Print ${selected?.name ?? 'driver'}’s signed log`}><Printer size={16} /> <span>Print</span></button>
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
                        <button className={`${weather === option ? 'selected' : ''} ${revealedWeather?.value === option ? 'reveal-label' : ''}`} key={option} type="button" onClick={() => selectWeather(option)}>
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
                    {!readOnly && <div className="session-actions"><button type="button" onClick={() => openEditSession(session)} aria-label="Edit drive"><Pencil size={16} /></button><button type="button" onClick={() => setSessionToDelete(session)} aria-label="Delete drive"><Trash2 size={16} /></button></div>}
                    {session.notes && <p className="session-notes">{session.notes}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {selected && <PrintableReport
        driver={selected}
        sessions={printableSessions}
        totalTime={totalTime}
        nightTime={nightTime}
      />}

      {notice && <output className="toast"><Check size={17} /> {notice}</output>}

      <AlertDialog open={Boolean(sessionToDelete)} onOpenChange={(open) => { if (!open) setSessionToDelete(null); }}>
        <AlertDialogContent className="permit-alert">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this drive?</AlertDialogTitle>
            <AlertDialogDescription>
              {sessionToDelete ? `${formatDuration(durationMs(sessionToDelete))} on ${new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(sessionToDelete.start))}` : 'This drive'} will be removed from the log. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep drive</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={removeSession}>Delete drive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(csvImport)} onOpenChange={(open) => { if (!open) setCsvImport(null); }}>
        <DialogContent className="permit-dialog import-dialog sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{csvImport?.step === 'done' ? 'Driving history imported' : 'Import driving history'}</DialogTitle>
            <DialogDescription>
              {csvImport?.step === 'done'
                ? 'The new drives are saved on this device and will join family sync normally.'
                : 'Your file is processed on this device. Review the suggested columns before anything is added.'}
            </DialogDescription>
          </DialogHeader>

          {csvImport?.step === 'map' && <div className="import-form dialog-form">
            <div className="import-source-row">
              <label htmlFor="import-source">Source
                <select id="import-source" value={csvImport.presetId} onChange={(event) => setImportPreset(event.target.value)}>
                  {IMPORT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                </select>
              </label>
              <div className="import-file-summary">{csvImport.fileName.toLowerCase().endsWith('.json') ? <FileJson size={18} /> : csvImport.fileName.toLowerCase().endsWith('.pdf') ? <FileText size={18} /> : <FileSpreadsheet size={18} />}<span><strong>{csvImport.fileName}</strong><small>{csvImport.parsed.rows.length} rows · {csvImport.parsed.headers.length} fields</small></span></div>
            </div>
            <p className="import-hint"><CircleHelp size={16} /><span>{IMPORT_PRESETS.find((preset) => preset.id === csvImport.presetId)?.hint}</span></p>
            {csvImport.remembered && <p className="remembered-mapping"><Check size={15} /> Using the mapping you approved last time for these columns.</p>}

            <div className="mapping-heading"><div><strong>Match the columns</strong><p>Suggested locally from headings and sample values.</p></div><Button variant="outline" type="button" onClick={() => setCsvImport({ ...csvImport, mapping: suggestCsvMapping(csvImport.parsed, csvImport.presetId), remembered: false })}>Suggest again</Button></div>
            <div className="mapping-grid">
              {IMPORT_FIELDS.map((field) => <label key={field.id} htmlFor={`map-${field.id}`}>
                <span>{field.label}<small>{field.detail}</small></span>
                <select
                  id={`map-${field.id}`}
                  value={csvImport.mapping[field.id] ?? ''}
                  onChange={(event) => setCsvImport({
                    ...csvImport,
                    mapping: { ...csvImport.mapping, [field.id]: event.target.value === '' ? null : Number(event.target.value) },
                    remembered: false,
                  })}
                >
                  <option value="">Not included</option>
                  {csvImport.parsed.headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header}</option>)}
                </select>
              </label>)}
            </div>

            <details className="raw-preview">
              <summary>Preview parsed rows</summary>
              <div className="import-table-scroll"><table><thead><tr>{csvImport.parsed.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>{csvImport.parsed.rows.slice(0, 3).map((row, rowIndex) => <tr key={rowIndex}>{csvImport.parsed.headers.map((_, columnIndex) => <td key={columnIndex}>{row[columnIndex] || '—'}</td>)}</tr>)}</tbody></table></div>
            </details>

            <div className="import-defaults">
              <label htmlFor="import-driver">Driver when blank<Input id="import-driver" value={csvImport.options.defaultDriver} onChange={(event) => setCsvImport({ ...csvImport, options: { ...csvImport.options, defaultDriver: event.target.value } })} placeholder="Driver’s name" /></label>
              <label htmlFor="import-date-format">Date format<select id="import-date-format" value={csvImport.options.dateFormat} onChange={(event) => setCsvImport({ ...csvImport, options: { ...csvImport.options, dateFormat: event.target.value as ImportDateFormat } })}><option value="auto">Auto / U.S. when ambiguous</option><option value="mdy">Month / day / year</option><option value="dmy">Day / month / year</option><option value="ymd">Year / month / day</option></select></label>
              <label htmlFor="import-duration-unit">Numeric durations<select id="import-duration-unit" value={csvImport.options.durationUnit} onChange={(event) => setCsvImport({ ...csvImport, options: { ...csvImport.options, durationUnit: event.target.value as ImportDurationUnit } })}><option value="auto">Auto (plain numbers are minutes)</option><option value="minutes">Minutes</option><option value="hours">Hours</option></select></label>
              <label htmlFor="import-start-default">Start time when missing<Input id="import-start-default" type="time" value={csvImport.options.defaultStartTime} onChange={(event) => setCsvImport({ ...csvImport, options: { ...csvImport.options, defaultStartTime: event.target.value } })} /></label>
              <label htmlFor="import-period-default">Day/night when blank<select id="import-period-default" value={csvImport.options.defaultPeriod} onChange={(event) => setCsvImport({ ...csvImport, options: { ...csvImport.options, defaultPeriod: event.target.value as Period } })}><option value="day">Day</option><option value="night">Night</option></select></label>
              <label htmlFor="import-weather-default">Weather when blank<select id="import-weather-default" value={csvImport.options.defaultWeather} onChange={(event) => setCsvImport({ ...csvImport, options: { ...csvImport.options, defaultWeather: event.target.value as Weather } })}>{weatherOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
            </div>
            {csvImport.parsed.warnings.length > 0 && <div className="import-warnings"><strong>File warnings</strong>{csvImport.parsed.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
          </div>}

          {csvImport?.step === 'preview' && csvImport.preview && <div className="import-review">
            <div className="import-counts">
              <span className="ready"><strong>{csvImport.preview.ready.length}</strong> ready</span>
              <span><strong>{csvImport.preview.duplicates}</strong> duplicates skipped</span>
              <span className={csvImport.preview.errors.length ? 'warning' : ''}><strong>{csvImport.preview.errors.length}</strong> rows need attention</span>
            </div>
            {csvImport.preview.ready.length > 0 && <div className="import-table-scroll"><table><thead><tr><th>Row</th><th>Driver</th><th>Date and time</th><th>Duration</th><th>Type</th></tr></thead><tbody>{csvImport.preview.ready.slice(0, 10).map((candidate) => <tr key={candidate.sourceRow}><td>{candidate.sourceRow}</td><td>{candidate.driverName}</td><td>{new Date(candidate.start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td><td>{formatDuration(new Date(candidate.end).getTime() - new Date(candidate.start).getTime())}</td><td>{candidate.period}</td></tr>)}</tbody></table>{csvImport.preview.ready.length > 10 && <p className="more-rows">Plus {csvImport.preview.ready.length - 10} more ready drives.</p>}</div>}
            {csvImport.preview.errors.length > 0 && <div className="import-errors"><strong>Rows that will not be imported</strong>{csvImport.preview.errors.slice(0, 8).map((result) => <p key={result.sourceRow}><span>Row {result.sourceRow}</span>{result.error}</p>)}{csvImport.preview.errors.length > 8 && <p>Plus {csvImport.preview.errors.length - 8} more rows with issues.</p>}</div>}
            <p className="import-review-note">Nothing has been added yet. Go back to adjust a mapping or import the valid drives shown here.</p>
          </div>}

          {csvImport?.step === 'done' && csvImport.imported && <div className="import-complete">
            <span><Check size={30} /></span>
            <strong>{csvImport.imported.sessionIds.length} drive{csvImport.imported.sessionIds.length === 1 ? '' : 's'} added</strong>
            <p>The column choices were remembered for future files with the same headings.</p>
          </div>}

          {csvImport?.step === 'map' && <DialogFooter><Button variant="outline" type="button" onClick={() => setCsvImport(null)}>Cancel</Button><Button type="button" onClick={previewCsvImport}>Review drives</Button></DialogFooter>}
          {csvImport?.step === 'preview' && <DialogFooter><Button variant="outline" type="button" onClick={() => setCsvImport({ ...csvImport, step: 'map' })}>Back to mapping</Button><Button type="button" disabled={!csvImport.preview?.ready.length} onClick={commitCsvImport}>Import {csvImport.preview?.ready.length ?? 0} drives</Button></DialogFooter>}
          {csvImport?.step === 'done' && <DialogFooter><Button variant="outline" type="button" onClick={undoCsvImport}><RotateCcw /> Undo import</Button><Button type="button" onClick={() => setCsvImport(null)}>Done</Button></DialogFooter>}
        </DialogContent>
      </Dialog>

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
          <DialogHeader><DialogTitle>{driverDraft.id ? 'Driver settings' : 'Add a driver'}</DialogTitle><DialogDescription>Choose the name shown in the app and the legal name used on signed reports.</DialogDescription></DialogHeader>
          <form id="driver-form" onSubmit={saveDriver} className="dialog-form">
            <label htmlFor="driver-name">Name used in the app<Input id="driver-name" value={driverDraft.name} onChange={(event) => setDriverDraft({ ...driverDraft, name: event.target.value })} placeholder="First name or nickname" required /><small className="field-help">This is the short name shown when switching drivers.</small></label>
            <label htmlFor="driver-legal-name">Full legal name <span>(optional)</span><Input id="driver-legal-name" value={driverDraft.legalName ?? ''} onChange={(event) => setDriverDraft({ ...driverDraft, legalName: event.target.value })} placeholder="First, middle, and last name" autoComplete="off" /><small className="field-help">Used on the printable supervised driving log. Until added, the app name is used.</small></label>
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
              <label htmlFor="drive-duration">Duration<span className="duration-input"><Input id="drive-duration" type="number" inputMode="numeric" min="1" max="1440" step="1" value={sessionDraft.durationMinutes} onChange={(event) => updateSessionDuration(event.target.value)} required /><span aria-hidden="true">min</span></span></label>
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

function PrintableReport({ driver, sessions, totalTime, nightTime }: {
  driver: Driver;
  sessions: DriveSession[];
  totalTime: number;
  nightTime: number;
}) {
  const daytimeTime = Math.max(0, totalTime - nightTime);
  return (
    <section className="print-report">
      <header className="print-header">
        <div><span className="print-brand-mark"><CarFront size={18} /></span><strong>Permit Hours</strong></div>
        <div><h1>Supervised Driving Log</h1><p>Generated {printDate(new Date())}</p></div>
      </header>

      <div className="print-driver-fields">
        <p><span>Driver’s full legal name</span><strong>{driver.legalName?.trim() || driver.name}</strong></p>
        <p><span>Permit number</span><i /></p>
        <p><span>Parent, guardian, or instructor</span><i /></p>
      </div>

      <div className="print-totals" aria-label="Driving totals and goals">
        <div><span>Daytime</span><strong>{formatDuration(daytimeTime)}</strong></div>
        <div><span>Nighttime</span><strong>{formatDuration(nightTime)}</strong><small>Goal {driver.nightGoal}h</small></div>
        <div><span>Total driving</span><strong>{formatDuration(totalTime)}</strong><small>Goal {driver.totalGoal}h</small></div>
      </div>

      <table className="print-log-table">
        <caption>Detailed practice log</caption>
        <thead><tr><th>Date</th><th>Start–end</th><th>Day</th><th>Night</th><th>Weather</th><th>Notes</th></tr></thead>
        <tbody>
          {sessions.length ? sessions.map((session) => {
            const start = new Date(session.start);
            const end = new Date(session.end);
            const duration = formatDuration(durationMs(session));
            const nextDay = start.toDateString() !== end.toDateString();
            return <tr key={session.id}>
              <td>{printDate(start)}</td>
              <td>{printTime(start)}–{printTime(end)}{nextDay ? ' +1' : ''}</td>
              <td>{session.period === 'day' ? duration : '—'}</td>
              <td>{session.period === 'night' ? duration : '—'}</td>
              <td>{session.weather}</td>
              <td>{session.notes || '—'}</td>
            </tr>;
          }) : <tr><td colSpan={6} className="print-empty">No completed drives are recorded.</td></tr>}
        </tbody>
        <tfoot><tr><th colSpan={2}>Totals</th><td>{formatDuration(daytimeTime)}</td><td>{formatDuration(nightTime)}</td><td colSpan={2}>{formatDuration(totalTime)} total</td></tr></tfoot>
      </table>

      <section className="print-certification">
        <h2>Review and certification</h2>
        <p>Review the entries and totals before signing. The parent, guardian, or driving instructor responsible for this log should sign below. Confirm that your licensing agency accepts this report and whether it requires an additional state form.</p>
        <p className="certification-statement">I certify that the supervised driving experience recorded above is complete and accurate to the best of my knowledge.</p>
        <div className="print-signature-fields">
          <p><i /><span>Signature</span></p>
          <p><i /><span>Printed name</span></p>
          <p><i /><span>Date</span></p>
        </div>
        <small>Generated from the Permit Hours driving log. This report does not replace a form specifically required by a state licensing agency.</small>
      </section>
    </section>
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
