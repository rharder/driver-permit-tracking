'use client';

import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { isPoorWeather, type GoalDriver, type PracticeSettings } from '@/lib/practice-goals';

function localDateTime(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function PracticeGoalFields({ driver, onChange }: { driver: GoalDriver; onChange: (settings: PracticeSettings) => void }) {
  const settings = driver.practice ?? {};
  const update = (patch: Partial<PracticeSettings>) => onChange({ ...settings, ...patch });
  return <details className="advanced-goals" open={Boolean(settings.stateCode || settings.dayGoal || settings.poorWeatherGoal || settings.challengingGoal || settings.countFrom || settings.maxMinutesPerDay) || undefined}>
    <summary>Additional goals & counting rules</summary>
    <div className="dialog-form">
      <p className="field-help">Zero disables a category goal. Weather and challenging hours are subsets of the total, not extra hours to add. Day and night are separate.</p>
      <div className="form-grid">
        {([['dayGoal', 'Daytime hours'], ['poorWeatherGoal', 'Poor-weather hours'], ['challengingGoal', 'Challenging-condition hours']] as const).map(([key, label]) => <label key={key} htmlFor={`goal-${key}`}>{label}<Input id={`goal-${key}`} type="number" min="0" step="0.25" value={settings[key] ?? 0} onChange={event => update({ [key]: Number(event.target.value) })} /></label>)}
      </div>
      <p className="field-help">Challenging = night OR poor weather OR another qualifying challenge you mark. Rain/snow defaults to poor weather; edit each drive to confirm. If conditions change mid-drive, record separate entries.</p>
      <label htmlFor="goal-stage-label">Goal / stage label <span>(optional)</span><Input id="goal-stage-label" value={settings.stageLabel ?? ''} onChange={event => update({ stageLabel: event.target.value })} placeholder="e.g. Learner permit practice" /></label>
      <label htmlFor="goal-count-from">Count practice starting <span>(optional)</span><Input id="goal-count-from" type="datetime-local" value={localDateTime(settings.countFrom)} onChange={event => {
        const parsed = new Date(event.target.value);
        if (!event.target.value || Number.isFinite(parsed.getTime())) update({ countFrom: event.target.value ? parsed.toISOString() : undefined });
      }} /><small className="field-help">Blank counts all history. Use the start of a new stage for additional hours. Local time on this device; existing drives are never removed.</small></label>
      <label htmlFor="goal-daily-cap">Maximum counted minutes per day<Input id="goal-daily-cap" type="number" min="0" max="1440" step="1" value={settings.maxMinutesPerDay ?? 0} onChange={event => update({ maxMinutesPerDay: Number(event.target.value), timeZone: settings.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone })} /><small className="field-help">0 = unlimited. A limit credits the earliest practice first, using the same allowance for every category.</small></label>
      {Boolean(settings.maxMinutesPerDay) && <label htmlFor="goal-time-zone">Calendar-day time zone<Input id="goal-time-zone" value={settings.timeZone ?? ''} onChange={event => update({ timeZone: event.target.value })} placeholder="America/Chicago" /><small className="field-help">An IANA time zone, shared across devices. For Texas use America/Chicago, or America/Denver in the Mountain Time area.</small></label>}
    </div>
  </details>;
}

export function ConditionFields({ value, onChange, showChallenge = true }: {
  value: { weather: string; poorWeather?: boolean; challenging?: boolean };
  onChange: (patch: { poorWeather?: boolean; challenging?: boolean }) => void;
  showChallenge?: boolean;
}) {
  const id = useId();
  return <fieldset className="condition-fields">
    <legend>Qualifying conditions</legend>
    <label className="condition-check" htmlFor={`${id}-poor`}><Checkbox id={`${id}-poor`} checked={isPoorWeather(value)} onCheckedChange={checked => onChange({ poorWeather: checked })} />Poor / inclement weather</label>
    {showChallenge && <label className="condition-check" htmlFor={`${id}-other`}><Checkbox id={`${id}-other`} checked={value.challenging ?? false} onCheckedChange={checked => onChange({ challenging: checked })} />Other challenging conditions</label>}
    <small>Mark only qualifying practice.{showChallenge ? ' Night and poor weather already count as challenging; use “other” for an additional challenge and describe it in notes.' : ' Rain/snow is selected automatically; you can correct it here.'}</small>
  </fieldset>;
}
