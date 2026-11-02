/** Utilidades de las pantallas de administración en línea (usuarios, sucursales, permisos, cortes, auditoría, sistema). */

/** La API responde con una lista o con `{ items, total }`; siempre devolvemos una lista. */
export function asList<T>(d: unknown): T[] {
  if (Array.isArray(d)) return d as T[];
  if (d && typeof d === 'object' && Array.isArray((d as { items?: unknown }).items)) return (d as { items: T[] }).items;
  return [];
}

/** Cadena de consulta sin vacíos: buildQuery({a:1,b:''}) → "?a=1". */
export function buildQuery(params: Record<string, string | number | boolean | null | undefined> = {}): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v === true ? '1' : String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

/** ISO de hace `days` días (para filtros "últimos 30 días"). */
export function daysAgoIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export const ROLE_NAME: Record<string, string> = { gerente: 'Administrador', vendedor: 'Vendedor', desarrollador: 'Desarrollador' };
