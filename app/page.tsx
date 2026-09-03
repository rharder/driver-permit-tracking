'use client';

import { SubmitEvent, useEffect, useMemo, useState } from 'react';
import {
  CarFront,
  Check,
  Cloud,
  CloudRain,
  Download,
  FileJson,
  FileSpreadsheet,
  History,
  Moon,
  Pencil,
  Plus,
  Settings2,
  Snowflake,
  Square,
  Sun,
  Trash2,
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
    const name = newName.trim();
    if (!name) return;
    const driver: Driver = { id: id(), name, totalGoal: 50, nightGoal: 10 };
    setData({ ...data, drivers: [driver], selectedId: driver.id });
    setNewName('');
    setNotice(`${name} is ready to start logging.`);
  }

  function openAddDriver() {
    setDriverDraft({ id: '', name: '', totalGoal: 50, nightGoal: 10 });
    setDriverDialogOpen(true);
  }

  function openEditDriver(driver: Driver) {
    setDriverDraft({ ...driver });
    setDriverDialogOpen(true);
  }

  function saveDriver(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
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
    if (!selected || data.active) return;
    const active = { driverId: selected.id, start: new Date().toISOString(), period, weather };
    setNow(Date.now());
    setData({ ...data, active });
  }

  function stopDrive() {
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
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    setSessionDraft({
      id: null,
      date: dateInputValue(start),
      startTime: timeInputValue(start),
      endTime: timeInputValue(end),
      period,
      weather,
      notes: '',
    });
    setSessionDialogOpen(true);
  }

  function openEditSession(session: DriveSession) {
    const start = new Date(session.start);
    const end = new Date(session.end);
    setSessionDraft({
      id: session.id,
      date: dateInputValue(start),
      startTime: timeInputValue(start),
      endTime: timeInputValue(end),
      period: session.period,
      weather: session.weather,
      notes: session.notes,
    });
    setSessionDialogOpen(true);
  }

  function saveSession(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
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
          {data.drivers.length > 0 && (
            <div className="export-actions" aria-label="Export data">
              <button type="button" onClick={exportJson} title="Export JSON"><FileJson size={16} /> <span>JSON</span></button>
              <button type="button" onClick={exportCsv} title="Export CSV"><FileSpreadsheet size={16} /> <span>CSV</span></button>
            </div>
          )}
          <span className={`offline-pill ${online ? '' : 'offline'}`}><span /> {online ? 'Offline ready' : 'Working offline'}</span>
        </div>
      </header>

      {data.drivers.length === 0 ? (
        <section className="welcome-panel">
          <div className="welcome-art"><CarFront size={36} /></div>
          <p className="eyebrow">Private by design</p>
          <h1>Start a driving log.</h1>
          <p>Add your first teen driver. Their log stays on this device, works without a signal, and never needs an account.</p>
          <form onSubmit={addFirstDriver} className="welcome-form">
            <label htmlFor="first-driver">Driver’s first name</label>
            <div><Input id="first-driver" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Maya" /><Button type="submit" disabled={!newName.trim()}><Plus /> Add driver</Button></div>
          </form>
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
            <button className="add-driver" type="button" onClick={openAddDriver}><Plus size={17} /> Add driver</button>
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
                  <button className="stop-button" type="button" onClick={stopDrive}>
                    <span><Square size={20} fill="currentColor" /></span>
                    <strong>Stop & save</strong>
                    <small>End this drive</small>
                  </button>
                  <p className="save-note">The timer keeps running if you close the app.</p>
                </>
              ) : data.active && activeDriver ? (
                <div className="other-active">
                  <span className="other-active-icon"><CarFront size={28} /></span>
                  <p className="eyebrow">Drive in progress</p>
                  <h1>{activeDriver.name} is on the road.</h1>
                  <p>The app tracks one active drive at a time on this device.</p>
                  <Button type="button" onClick={() => setData({ ...data, selectedId: activeDriver.id })}>View active drive</Button>
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
                {selected && <button type="button" onClick={() => openEditDriver(selected)} aria-label="Edit driver and goals"><Settings2 size={19} /></button>}
              </div>
              <GoalCard icon={<CarFront size={20} />} label="Total time" value={totalTime} goal={selected?.totalGoal ?? 50} progress={totalPercent} />
              <GoalCard icon={<Moon size={20} />} label="Night time" value={nightTime} goal={selected?.nightGoal ?? 10} progress={nightPercent} night />
              <div className="encouragement">
                <Sun size={19} />
                <p><strong>{totalPercent >= 100 ? 'Goal reached!' : 'Keep it rolling.'}</strong> {totalPercent >= 100 ? 'You’ve completed the total-time goal.' : `${formatDuration(Math.max(0, (selected?.totalGoal ?? 50) * 3_600_000 - totalTime))} left to reach the total goal.`}</p>
              </div>
              <div className="privacy-note"><Download size={16} /><p><strong>Stored on this device.</strong> Export JSON for a complete backup or CSV for a spreadsheet.</p></div>
            </aside>
          </div>

          <section className="history-panel">
            <div className="history-heading">
              <div><p className="eyebrow">Drive log</p><h2>Recent drives</h2></div>
              <Button variant="outline" type="button" onClick={openNewSession}><Plus /> Add drive</Button>
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
                    <div className="session-actions"><button type="button" onClick={() => openEditSession(session)} aria-label="Edit drive"><Pencil size={16} /></button><button type="button" onClick={() => removeSession(session)} aria-label="Delete drive"><Trash2 size={16} /></button></div>
                    {session.notes && <p className="session-notes">{session.notes}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {notice && <output className="toast"><Check size={17} /> {notice}</output>}

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
          <DialogHeader><DialogTitle>{sessionDraft?.id ? 'Edit drive' : 'Add a drive'}</DialogTitle><DialogDescription>Correct the time, conditions, or notes for this entry.</DialogDescription></DialogHeader>
          {sessionDraft && <form id="session-form" onSubmit={saveSession} className="dialog-form">
            <label htmlFor="drive-date">Date<Input id="drive-date" type="date" value={sessionDraft.date} onChange={(event) => setSessionDraft({ ...sessionDraft, date: event.target.value })} required /></label>
            <div className="form-grid"><label htmlFor="drive-start">Started<Input id="drive-start" type="time" value={sessionDraft.startTime} onChange={(event) => setSessionDraft({ ...sessionDraft, startTime: event.target.value })} required /></label><label htmlFor="drive-end">Ended<Input id="drive-end" type="time" value={sessionDraft.endTime} onChange={(event) => setSessionDraft({ ...sessionDraft, endTime: event.target.value })} required /></label></div>
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
