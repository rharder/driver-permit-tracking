/** Update the existing drive, never its start time or another driver's drive. */
export function updateActiveDriveWeather<T extends { driverId: string; weather: string; poorWeather?: boolean }>(
  active: T | null, driverId: string | undefined, weather: T['weather'], readOnly: boolean,
): T | null {
  if (!active || readOnly || active.driverId !== driverId) return active;
  // Match manual weather edits: recalculate weather-derived credit for the new condition.
  return { ...active, weather, poorWeather: undefined };
}
