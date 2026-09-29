export const DRIVER_THEMES = [
  { id: 'green', name: 'Green', color: '#2e6447', dark: '#204c34', light: '#dce8df', paper: '#edf4ef' },
  { id: 'blue', name: 'Blue', color: '#255ba0', dark: '#194478', light: '#dae7f8', paper: '#edf3fc' },
  { id: 'purple', name: 'Purple', color: '#7042a0', dark: '#532b7c', light: '#eadff6', paper: '#f5effb' },
  { id: 'amber', name: 'Amber', color: '#88530f', dark: '#663c08', light: '#f4e4c8', paper: '#fbf4e7' },
  { id: 'rose', name: 'Rose', color: '#a03460', dark: '#7a2146', light: '#f5dce6', paper: '#fceef3' },
  { id: 'teal', name: 'Teal', color: '#12696d', dark: '#094e52', light: '#d5eceb', paper: '#eaf6f5' },
] as const;

export type DriverThemeId = typeof DRIVER_THEMES[number]['id'];
type ThemedDriver = { theme?: string };

export function isDriverTheme(value: unknown): value is DriverThemeId {
  return DRIVER_THEMES.some(theme => theme.id === value);
}

export function driverTheme(value?: string) {
  return DRIVER_THEMES.find(theme => theme.id === value) ?? DRIVER_THEMES[0];
}

function leastUsedTheme(drivers: readonly ThemedDriver[]): DriverThemeId {
  const counts = DRIVER_THEMES.map(theme => drivers.filter(driver => driver.theme === theme.id).length);
  return DRIVER_THEMES[counts.indexOf(Math.min(...counts))].id;
}

// Resolve older logs without mutating them or triggering a cloud write just by viewing.
// Reserve explicit choices first so automatic defaults do not take those colors.
export function assignDriverThemes<T extends ThemedDriver>(drivers: readonly T[]): (T & { theme: DriverThemeId })[] {
  const assigned: ThemedDriver[] = drivers.filter(driver => isDriverTheme(driver.theme));
  return drivers.map(driver => {
    const theme = isDriverTheme(driver.theme) ? driver.theme : leastUsedTheme(assigned);
    if (!isDriverTheme(driver.theme)) assigned.push({ theme });
    return { ...driver, theme };
  });
}

export function nextDriverTheme(drivers: readonly ThemedDriver[]): DriverThemeId {
  return leastUsedTheme(assignDriverThemes(drivers));
}
