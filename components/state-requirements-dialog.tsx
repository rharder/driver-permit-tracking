'use client';

import { useState } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { STATE_REQUIREMENTS, presetGoals, statePresets } from '@/lib/state-requirements';
import type { GoalDriver } from '@/lib/practice-goals';

export function StateRequirementsDialog({ initialState = 'CO', onClose, onApply }: {
  initialState?: string;
  onClose: () => void;
  onApply?: (goals: GoalDriver) => void;
}) {
  const [code, setCode] = useState(initialState);
  const [presetIndex, setPresetIndex] = useState(0);
  const [start, setStart] = useState('');
  const state = STATE_REQUIREMENTS.find(item => item.code === code) ?? STATE_REQUIREMENTS[0];
  const presets = statePresets(state);
  const preset = presets[presetIndex] ?? presets[0];
  const startValid = Boolean(start && Number.isFinite(new Date(start).getTime()));
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="permit-dialog scroll-dialog sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>State practice requirements</DialogTitle>
        <DialogDescription>Find a starting point for your goals. Rules vary by age, training route, and licensing stage.</DialogDescription>
      </DialogHeader>
      <div className="scroll-dialog-body dialog-form state-lookup">
        <label htmlFor="requirements-state">State or district
          <select id="requirements-state" value={state.code} onChange={event => { setCode(event.target.value); setPresetIndex(0); setStart(''); }}>
            {STATE_REQUIREMENTS.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        <label htmlFor="requirements-route">Licensing stage / training route
          <select id="requirements-route" value={presetIndex} onChange={event => { setPresetIndex(Number(event.target.value)); setStart(''); }}>
            {presets.map((item, index) => <option key={index} value={index}>{item.label}</option>)}
          </select>
        </label>
        <div className="state-hours">
          <div><strong>{preset.totalHours === null ? 'Personal goal' : `${preset.totalHours}h`}</strong><span>{preset.totalHours === null ? 'No fixed minimum listed' : 'Total practice'}</span></div>
          <div><strong>{preset.nightHours ? `${preset.nightHours}h` : 'No separate quota'}</strong><span>Nighttime</span></div>
        </div>
        {(preset.dayHours || preset.poorWeatherHours || preset.challengingHours || preset.maxMinutesPerDay) ? <ul className="state-extra-rules">
          {preset.dayHours ? <li>At least {preset.dayHours} hours in daylight.</li> : null}
          {preset.poorWeatherHours ? <li>At least {preset.poorWeatherHours} hours in poor weather (within the total).</li> : null}
          {preset.challengingHours ? <li>At least {preset.challengingHours} hours in challenging conditions: night, poor weather, or other qualifying practice. Overlapping categories count once.</li> : null}
          {preset.maxMinutesPerDay ? <li>Count only the first {preset.maxMinutesPerDay} minutes per calendar day. All driving remains recorded.</li> : null}
        </ul> : null}
        {preset.requiresStart && <label htmlFor="stage-start">When did this new licensing stage begin?
          <Input id="stage-start" type="datetime-local" value={start} onChange={event => setStart(event.target.value)} required />
          <small className="field-help">Earlier practice stays in the log but does not count toward this stage. Enter local time on this device.</small>
        </label>}
        <ul className="state-notes">{state.notes.map(note => <li key={note}>{note}</li>)}</ul>
        <div className="state-sources"><strong>Sources · reviewed {state.reviewedOn}</strong>
          {state.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={13} /></a>)}
        </div>
        <p className="field-help">This offline reference is a dated summary, not legal advice or confirmation of license eligibility. Verify current rules and required forms with your licensing agency; source links need internet. Education hours, permit waits, supervisor eligibility, weekly caps, and curfews are not automatically checked.</p>
        {onApply && <p className="field-help">Applying a preset replaces the draft goals and counting window—not any drives. Review and save the driver settings to keep it. You can customize every goal.</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Close</Button>
        {onApply && preset.totalHours !== null && <Button disabled={preset.requiresStart && !startValid} onClick={() => {
          onApply(presetGoals(state, preset, Intl.DateTimeFormat().resolvedOptions().timeZone, preset.requiresStart ? new Date(start).toISOString() : undefined));
          onClose();
        }}><MapPin size={16} /> Use these goals</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
