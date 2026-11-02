/**
 * Apariencia (v2.2): aplica los colores que eligió el administrador (los recibe con cada sincronización).
 * El modo 'claro' no toca nada. Se guarda una copia local para pintar al instante al abrir.
 */
import { paletteToCssVars, resolvePalette, sanitizeTheme } from '@amara/shared';
import type { ThemeSettings } from '@amara/shared';
import { call } from './api.ts';

const CACHE_KEY = 'amara.theme';
let applied: string[] = [];

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
  for (const [k, v] of Object.entries(paletteToCssVars(palette))) {
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
    /* sin copia */
  }
}

export async function refreshTheme(): Promise<void> {
  try {
    const t = applyTheme(await call('theme:get'));
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(t));
    } catch {
      /* ignorar */
    }
  } catch {
    /* sin base local lista: queda lo último aplicado */
  }
}
