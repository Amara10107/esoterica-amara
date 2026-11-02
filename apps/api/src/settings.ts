/** Configuración global guardada en la colección `settings` (un documento por llave). */
import { DEFAULT_EXTRA_CATEGORIES, DEFAULT_THEME, sanitizeExtraCatalog, sanitizeExtraCategories, sanitizeTheme } from '@amara/shared';
import type { ExtraOption, ThemeSettings } from '@amara/shared';
import { col } from './db.ts';

export const EXTRA_CATEGORIES_KEY = 'extraCategories';

/** Categorías que admiten "Extra". Sin configuración guardada, las de fábrica. */
export async function getExtraCategories(): Promise<string[]> {
  const d = await col('settings').findOne({ _id: EXTRA_CATEGORIES_KEY as any });
  if (!d || !Array.isArray(d.value)) return [...DEFAULT_EXTRA_CATEGORIES];
  return sanitizeExtraCategories(d.value as string[]);
}

export async function setExtraCategories(categories: string[], userId: string): Promise<string[]> {
  const clean = sanitizeExtraCategories(categories);
  await col('settings').updateOne(
    { _id: EXTRA_CATEGORIES_KEY as any },
    { $set: { value: clean, updatedAt: new Date().toISOString(), updatedBy: userId } },
    { upsert: true },
  );
  return clean;
}

export const EXTRA_CATALOG_KEY = 'extraCatalog';

/** Extras por tipo de producto (vacío hasta que el administrador los cree). */
export async function getExtraCatalog(): Promise<ExtraOption[]> {
  const d = await col('settings').findOne({ _id: EXTRA_CATALOG_KEY as any });
  return d && Array.isArray(d.value) ? sanitizeExtraCatalog(d.value) : [];
}

export async function setExtraCatalog(items: unknown, userId: string): Promise<ExtraOption[]> {
  const clean = sanitizeExtraCatalog(items);
  await col('settings').updateOne(
    { _id: EXTRA_CATALOG_KEY as any },
    { $set: { value: clean, updatedAt: new Date().toISOString(), updatedBy: userId } },
    { upsert: true },
  );
  return clean;
}

export const THEME_KEY = 'theme';

/** Apariencia global (claro / oscuro / personalizado). Sin configuración: claro. */
export async function getTheme(): Promise<ThemeSettings> {
  const d = await col('settings').findOne({ _id: THEME_KEY as any });
  return d && d.value ? sanitizeTheme(d.value) : { ...DEFAULT_THEME };
}

export async function setTheme(raw: unknown, userId: string): Promise<ThemeSettings> {
  const clean = sanitizeTheme(raw);
  await col('settings').updateOne(
    { _id: THEME_KEY as any },
    { $set: { value: clean, updatedAt: new Date().toISOString(), updatedBy: userId } },
    { upsert: true },
  );
  return clean;
}
