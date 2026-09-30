export type PrintableDrive = {
  id: string; start: string; end: string; period: 'day' | 'night'; weather: string; notes: string;
  poorWeather?: boolean; challenging?: boolean;
};
export type PrintableDriver = { name: string; legalName?: string; practice?: { stateCode?: string } };

export function pdfDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m${remainder ? ` ${String(remainder).padStart(2, '0')}s` : ''}`;
}
