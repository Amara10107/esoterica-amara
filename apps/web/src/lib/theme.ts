/**
 * Apariencia (v2.2): aplica los colores que eligió el administrador. El modo 'claro' no toca nada.
 * Se guarda una copia en localStorage para pintar al instante y se refresca desde el servidor.
 */
import { paletteToCssVars, resolvePalette, sanitizeTheme } from '@amara/shared';
import type { ThemeSettings } from '@amara/shared';
import { API_BASE } from './api.ts';

const CACHE_KEY = 'amara.theme';
let applied: string[] = [];

/** Pone (o quita) las variables CSS sobre <html>. */
export function applyTheme(raw: unknown): ThemeSettings {
  const theme = sanitizeTheme(raw);
  const root = document.documentElement;
  for (const k of applied) root.style.removeProperty(k);
  applied = [];
  const palette = resolvePalette(theme);
  if (!palette) {
    root.removeAttribute('data-amara-theme');
    return theme;
  }
  const vars = paletteToCssVars(palette);
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
    applied.push(k);
  }
  root.setAttribute('data-amara-theme', theme.mode);
  return theme;
}

export function applyCachedTheme(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) applyTheme(JSON.parse(raw));
  } catch {
    /* sin caché: se queda el diseño claro */
  }
}

/** Lee la apariencia del servidor (ruta pública, solo colores) y la aplica. Nunca lanza. */
export async function refreshTheme(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/public/theme`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const body = (await res.json()) as { theme?: unknown };
    const theme = applyTheme(body.theme);
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(theme));
    } catch {
      /* ignorar */
    }
  } catch {
    /* sin conexión: queda lo último aplicado */
  }
}
