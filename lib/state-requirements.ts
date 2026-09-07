import records from '../data/state-requirements.json' with { type: 'json' };
import type { GoalDriver } from './practice-goals';

export type StatePreset = {
  label: string;
  totalHours: number | null;
  nightHours: number | null;
  dayHours?: number;
  poorWeatherHours?: number;
  challengingHours?: number;
  maxMinutesPerDay?: number;
  requiresStart?: boolean;
};

export type StateRequirement = Omit<StatePreset, 'label'> & {
  code: string;
  name: string;
  appliesTo: string;
  notes: string[];
  sources: { label: string; url: string }[];
  reviewedOn: string;
  alternativePresets?: StatePreset[];
};

export const STATE_REQUIREMENTS: StateRequirement[] = records;

export function statePresets(state: StateRequirement): StatePreset[] {
  return [{ ...state, label: state.appliesTo }, ...(state.alternativePresets ?? [])];
}

export function presetGoals(state: StateRequirement, preset: StatePreset, timeZone: string, countFrom?: string): GoalDriver {
  if (preset.totalHours === null) throw new Error('This state has no fixed practice-hour preset. Set personal goals instead.');
  if (preset.requiresStart && !countFrom) throw new Error('Choose when this licensing stage began.');
  return {
    totalGoal: preset.totalHours,
    nightGoal: preset.nightHours ?? 0,
    practice: {
      stateCode: state.code,
      stageLabel: `${state.name}: ${preset.label}`,
      dayGoal: preset.dayHours ?? 0,
      poorWeatherGoal: preset.poorWeatherHours ?? 0,
      challengingGoal: preset.challengingHours ?? 0,
      maxMinutesPerDay: preset.maxMinutesPerDay ?? 0,
      timeZone,
      ...(countFrom ? { countFrom } : {}),
    },
  };
}
