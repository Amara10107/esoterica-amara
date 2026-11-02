/**
 * Configuración de extras (v2): categorías de producto a las que aplica el botón "Extra".
 * La comparación ignora mayúsculas y acentos ("Imágenes" = "imagenes" = "IMÁGENES").
 */

/** Categorías por omisión cuando el gerente aún no ha configurado nada. */
export const DEFAULT_EXTRA_CATEGORIES: readonly string[] = ['Veladoras', 'Pulseras', 'Imágenes', 'Lociones'];

/** Minúsculas, sin acentos ni espacios repetidos, para comparar categorías. */
export function normalizeCategory(name: string): string {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Singular aproximado de una palabra ya normalizada: veladoras → veladora, lociones → locion, imagenes → imagen. */
function stemWord(w: string): string {
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s')) return w.slice(0, -1);
  return w;
}

function categoryTokens(name: string): string[] {
  return normalizeCategory(name).split(' ').filter(Boolean).map(stemWord);
}

/**
 * ¿La categoría del producto está entre las configuradas para llevar extras?
 * Ignora mayúsculas, acentos y singular/plural ("Veladora" = "Veladoras"), y acepta categorías con más palabras que
 * contengan todas las de la configurada ("Veladoras de santos" cuenta como "Veladoras").
 */
export function isExtraCategory(category: string | null | undefined, extraCategories: readonly string[] = DEFAULT_EXTRA_CATEGORIES): boolean {
  if (!category) return false;
  const c = categoryTokens(category);
  if (c.length === 0) return false;
  return extraCategories.some((e) => {
    const t = categoryTokens(e);
    return t.length > 0 && t.every((w) => c.includes(w));
  });
}

/** Limpia la lista que escribe el gerente: recorta, quita vacíos y repetidos (sin distinguir acentos). */
export function sanitizeExtraCategories(list: readonly string[], maxItems = 60, maxLen = 60): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLen);
    const key = normalizeCategory(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= maxItems) break;
  }
  return out;
}

/* ------------------------------------------------------------------ Extras por TIPO de producto (v2.1)
 * El administrador ve todos los tipos de producto que hay en el inventario (vela, pulsera, imagen...) y a cada uno le
 * asigna uno o varios extras con su precio. El vendedor solo ELIGE un extra: no puede cambiar el precio.
 */

export interface ExtraOption {
  id: string;
  /** Tipo de producto (el campo "Tipo" del producto), tal como lo escribió el administrador. */
  type: string;
  name: string;
  priceCents: number;
  active: boolean;
}

export const MAX_EXTRA_OPTIONS = 300;
export const MAX_EXTRA_PRICE_CENTS = 10_000_000;

/** Llave para comparar tipos: sin acentos/mayúsculas y en singular ("Velas" = "vela"). */
export function typeKey(type: string | null | undefined): string {
  return categoryTokens(String(type ?? '')).join(' ');
}

/** Limpia la lista recibida (de la red o del administrador): descarta filas inválidas y repetidas. */
export function sanitizeExtraCatalog(list: unknown, maxItems = MAX_EXTRA_OPTIONS): ExtraOption[] {
  if (!Array.isArray(list)) return [];
  const out: ExtraOption[] = [];
  const ids = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id.trim().slice(0, 60) : '';
    const type = String(o.type ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const name = String(o.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const price = Number(o.priceCents);
    if (!id || !type || !name || !Number.isInteger(price) || price < 0 || price > MAX_EXTRA_PRICE_CENTS) continue;
    if (ids.has(id)) continue;
    ids.add(id);
    out.push({ id, type, name, priceCents: price, active: o.active !== false });
    if (out.length >= maxItems) break;
  }
  return out;
}

/** Extras activos que se pueden ofrecer para un producto de ese tipo. */
export function extrasForType(catalog: readonly ExtraOption[], type: string | null | undefined): ExtraOption[] {
  const k = typeKey(type);
  if (!k) return [];
  return catalog.filter((e) => e.active && typeKey(e.type) === k);
}

/** Tipos únicos (sin distinguir acentos ni singular/plural), ordenados A-Z. Conserva la primera escritura vista. */
export function uniqueTypes(types: readonly (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const t of types) {
    const name = String(t ?? '').trim().replace(/\s+/g, ' ');
    const k = typeKey(name);
    if (k && !seen.has(k)) seen.set(k, name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
}
