/** Fechas del corte por periodo (días de calendario AAAA-MM-DD; las semanas empiezan en lunes). PURO. */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (s: string): boolean => DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

export function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0 = domingo
  return addDays(day, -((dow + 6) % 7));
}

export type PeriodPreset = 'semana' | 'semana_pasada' | 'mes';

/** Rango sugerido. La semana en curso llega hasta hoy; la pasada es de lunes a domingo; el mes, del 1 a hoy. */
export function presetRange(preset: PeriodPreset, today: string): { from: string; to: string } {
  if (preset === 'semana') return { from: mondayOf(today), to: today };
  if (preset === 'semana_pasada') {
    const mon = addDays(mondayOf(today), -7);
    return { from: mon, to: addDays(mon, 6) };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export function validateRange(from: string, to: string): string | null {
  if (!isDay(from) || !isDay(to)) return 'Escribe las fechas como AAAA-MM-DD (por ejemplo 2026-10-19).';
  if (from > to) return 'La fecha inicial no puede ser posterior a la final.';
  return null;
}
