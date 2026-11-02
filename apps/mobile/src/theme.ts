import { paletteToMobile, resolvePalette, sanitizeTheme } from '@amara/shared';

/** Diseño: blanco predominante, morado profundo y dorado de acento (mismos colores que el panel web). */
export const colors: Record<string, string> = {
  bg: '#FFFFFF',
  surface: '#FAF7F1',
  border: '#E6DFD0',
  borderStrong: '#302142',
  text: '#2A2230',
  muted: '#574963',
  gold: '#A8873F',
  goldBright: '#D3AD64',
  goldSoft: '#F3EAD6',
  dark: '#302142',
  danger: '#9B1C1C',
  dangerSoft: '#FBEAEA',
  ok: '#2F6B3A',
  okSoft: '#E9F3EB',
  white: '#FFFFFF',
  // v2.1: paleta del panel web (morado profundo + dorado + crema)
  purple: '#302142',
  purpleSoft: '#463361',
  purpleMuted: '#B9AEC9',
  cream: '#F5F0E6',
  // v2.2: fondo de tarjetas y campos (blanco en claro; cambia con la apariencia)
  card: '#FFFFFF',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;

/** Relación de aspecto real del logo (1254x1254, cuadrado): se usa SIEMPRE con resizeMode contain. */
export const LOGO_ASPECT = 1;

// ───────────── v2.2: apariencia elegida por el administrador ─────────────
// Los estilos se crean al cargar cada pantalla, así que los colores se leen de una copia guardada ANTES de que
// existan. SecureStore.getItem es síncrono; si no está disponible (pruebas) se queda el diseño claro.
export const THEME_CACHE_KEY = 'amara.theme';

export function applyThemeToColors(raw: unknown): void {
  const palette = resolvePalette(sanitizeTheme(raw));
  if (palette) Object.assign(colors, paletteToMobile(palette));
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store') as { getItem?: (k: string) => string | null };
  const raw = SecureStore.getItem?.(THEME_CACHE_KEY);
  if (raw) applyThemeToColors(JSON.parse(raw));
} catch {
  /* sin copia o sin SecureStore: diseño claro */
}
