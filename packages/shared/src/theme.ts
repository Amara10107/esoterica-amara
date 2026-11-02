/**
 * Apariencia (v2.2): claro / oscuro / personalizado. Se guarda UNA vez en el servidor (administrador) y la reciben la web,
 * el escritorio y el teléfono. 'claro' no cambia nada (cada app conserva sus colores de siempre).
 * Módulo puro (sin dependencias) para probarlo y usarlo en las cuatro apps.
 */

export type ThemeMode = 'claro' | 'oscuro' | 'personalizado';
export const THEME_MODES: readonly ThemeMode[] = ['claro', 'oscuro', 'personalizado'];

/** Los 9 colores que definen una apariencia. Todos '#RRGGBB'. */
export interface ThemePalette {
  /** Fondo de pantalla. */
  bg: string;
  /** Fondo de tarjetas, ventanas y campos. */
  card: string;
  /** Fondo suave (zonas, filas alternas). */
  surface: string;
  /** Texto principal. */
  text: string;
  /** Texto secundario. */
  muted: string;
  /** Líneas y bordes. */
  line: string;
  /** Color de acento (dorado). */
  accent: string;
  /** Acento suave (resaltados). */
  accentSoft: string;
  /** Color principal (morado): botones oscuros, barras. */
  primary: string;
}

export const PALETTE_KEYS: readonly (keyof ThemePalette)[] = ['bg', 'card', 'surface', 'text', 'muted', 'line', 'accent', 'accentSoft', 'primary'];

export const PALETTE_LABELS: Record<keyof ThemePalette, string> = {
  bg: 'Fondo',
  card: 'Tarjetas y campos',
  surface: 'Fondo suave',
  text: 'Texto',
  muted: 'Texto secundario',
  line: 'Bordes',
  accent: 'Acento (dorado)',
  accentSoft: 'Acento suave',
  primary: 'Color principal',
};

export interface ThemeSettings {
  mode: ThemeMode;
  /** Colores usados cuando mode = 'personalizado'. */
  custom: ThemePalette;
  /** Paleta elegida como base (solo informativo para la pantalla). */
  presetId?: string | null;
}

export const LIGHT_PALETTE: ThemePalette = {
  bg: '#FFFFFF', card: '#FFFFFF', surface: '#FAF7F1', text: '#2A2230', muted: '#574963',
  line: '#E6DFD0', accent: '#A8873F', accentSoft: '#F3EAD6', primary: '#302142',
};

export const DARK_PALETTE: ThemePalette = {
  bg: '#16111D', card: '#221A2F', surface: '#1C1526', text: '#F1ECF7', muted: '#B9AEC9',
  line: '#3A2E4D', accent: '#D3AD64', accentSoft: '#3A2F1C', primary: '#5E4392',
};

export interface PalettePreset { id: string; name: string; palette: ThemePalette }

export const PALETTE_PRESETS: readonly PalettePreset[] = [
  { id: 'morado-dorado', name: 'Morado y dorado', palette: LIGHT_PALETTE },
  { id: 'medianoche', name: 'Medianoche', palette: DARK_PALETTE },
  { id: 'oceano', name: 'Océano', palette: { bg: '#FFFFFF', card: '#FFFFFF', surface: '#F1F7FA', text: '#12293A', muted: '#4A6578', line: '#D5E3EC', accent: '#0E7C86', accentSoft: '#DDF1F3', primary: '#15405E' } },
  { id: 'bosque', name: 'Bosque', palette: { bg: '#FFFFFF', card: '#FFFFFF', surface: '#F3F7F1', text: '#1E2B22', muted: '#506355', line: '#D9E4D5', accent: '#8A7A2B', accentSoft: '#F0EBCB', primary: '#1F4D35' } },
  { id: 'rosa', name: 'Rosa', palette: { bg: '#FFFFFF', card: '#FFFFFF', surface: '#FBF3F5', text: '#33202A', muted: '#6B4C59', line: '#EBD7DD', accent: '#B5446E', accentSoft: '#F8E1E9', primary: '#5A1F3D' } },
  { id: 'carbon', name: 'Carbón y oro', palette: { bg: '#121212', card: '#1E1E1E', surface: '#181818', text: '#F2F2F2', muted: '#B0B0B0', line: '#333333', accent: '#D3AD64', accentSoft: '#3A311D', primary: '#8A6D2F' } },
];

export const DEFAULT_THEME: ThemeSettings = { mode: 'claro', custom: { ...LIGHT_PALETTE }, presetId: 'morado-dorado' };

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: unknown): v is string => typeof v === 'string' && HEX.test(v.trim());

/** Acepta '#abc', 'ABCDEF' o '#ABCDEF' y devuelve '#RRGGBB' en mayúsculas; null si no es un color. */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  let t = v.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(t)) t = t.split('').map((c) => c + c).join('');
  return /^[0-9a-fA-F]{6}$/.test(t) ? `#${t.toUpperCase()}` : null;
}

export function sanitizePalette(raw: unknown, fallback: ThemePalette = LIGHT_PALETTE): ThemePalette {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...fallback };
  for (const k of PALETTE_KEYS) out[k] = normalizeHex(o[k]) ?? fallback[k];
  return out;
}

export function sanitizeTheme(raw: unknown): ThemeSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mode = THEME_MODES.includes(o.mode as ThemeMode) ? (o.mode as ThemeMode) : 'claro';
  const presetId = typeof o.presetId === 'string' && o.presetId.length <= 40 ? o.presetId : null;
  return { mode, custom: sanitizePalette(o.custom), presetId };
}

/** Colores que se aplican; null = no tocar nada (modo claro: cada app se queda como está). */
export function resolvePalette(t: ThemeSettings): ThemePalette | null {
  if (t.mode === 'oscuro') return { ...DARK_PALETTE };
  if (t.mode === 'personalizado') return { ...t.custom };
  return null;
}

/** Variables CSS para la web y el escritorio. Se ponen sobre <html>, que gana a :root. */
export function paletteToCssVars(p: ThemePalette): Record<string, string> {
  return {
    '--bg': p.bg,
    '--card': p.card,
    '--bg-2': p.surface,
    '--bg-soft': p.surface,
    '--ink': p.text,
    '--ink-2': p.text,
    '--ink-3': p.muted,
    '--muted': p.muted,
    '--line': p.line,
    '--line-2': p.line,
    '--gold': p.accent,
    '--gold-2': p.accent,
    '--gold-soft': p.accentSoft,
    '--primary': p.primary,
    '--purple': p.primary,
  };
}

/** ¿El color es oscuro? (para escoger texto claro encima). */
export function isDarkColor(hex: string): boolean {
  const h = normalizeHex(hex);
  if (!h) return false;
  const n = parseInt(h.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/** Colores del teléfono (theme.ts) a partir de la paleta. `white` siempre es blanco (texto sobre botones oscuros). */
export function paletteToMobile(p: ThemePalette): Record<string, string> {
  return {
    bg: p.bg,
    card: p.card,
    surface: p.surface,
    border: p.line,
    borderStrong: p.primary,
    text: p.text,
    muted: p.muted,
    gold: p.accent,
    goldBright: p.accent,
    goldSoft: p.accentSoft,
    dark: p.primary,
    purple: p.primary,
    purpleSoft: p.primary,
    purpleMuted: p.muted,
    cream: p.surface,
  };
}
