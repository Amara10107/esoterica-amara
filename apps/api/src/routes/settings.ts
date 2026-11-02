/** /settings (v2): configuración editable por el gerente. Hoy: categorías que admiten "Extra". */
import { Router } from 'express';
import { uniqueTypes } from '@amara/shared';
import { extraCatalogSchema, extraCategoriesSchema, themeSchema } from '@amara/shared/schemas';
import { col } from '../db.ts';
import { audit } from '../audit.ts';
import { requirePerm } from '../auth.ts';
import { ah, parse } from '../http.ts';
import { getExtraCatalog, getExtraCategories, getTheme, setExtraCatalog, setExtraCategories, setTheme } from '../settings.ts';
import { sessionUser } from '../util.ts';

export const settingsRouter = Router();

/** Cualquier sesión de usuario (el vendedor la necesita para mostrar el botón Extra). */
settingsRouter.get(
  '/extra-categories',
  ah(async (_req, res) => {
    res.json({ categories: await getExtraCategories() });
  }),
);

settingsRouter.put(
  '/extra-categories',
  requirePerm('config.editar'),
  ah(async (req, res) => {
    const me = sessionUser(req);
    const body = parse(extraCategoriesSchema, req.body);
    const before = await getExtraCategories();
    const categories = await setExtraCategories(body.categories, me.id);
    await audit({ userId: me.id, action: 'config.categorias_extra', entity: 'setting', entityId: 'extraCategories', detail: { before, after: categories } });
    res.json({ categories });
  }),
);

/** v2.1. Extras por tipo de producto. Cualquier sesión los lee (el vendedor los necesita para elegir uno). */
settingsRouter.get(
  '/extras',
  ah(async (_req, res) => {
    res.json({ items: await getExtraCatalog() });
  }),
);

settingsRouter.put(
  '/extras',
  requirePerm('config.editar'),
  ah(async (req, res) => {
    const me = sessionUser(req);
    const body = parse(extraCatalogSchema, req.body);
    const before = await getExtraCatalog();
    const items = await setExtraCatalog(body.items, me.id);
    await audit({ userId: me.id, action: 'config.extras_por_tipo', entity: 'setting', entityId: 'extraCatalog', detail: { before: before.length, after: items.length } });
    res.json({ items });
  }),
);

/** Tipos de producto que existen en el inventario (para armar "Extras por tipo"). */
settingsRouter.get(
  '/product-types',
  requirePerm('config.editar'),
  ah(async (_req, res) => {
    const types = (await col('products').distinct('type', { status: { $ne: 'archivado' } })) as string[];
    res.json({ types: uniqueTypes(types) });
  }),
);

/** v2.2. Apariencia. Cualquier sesión la lee; solo el administrador la cambia. */
settingsRouter.get(
  '/theme',
  ah(async (_req, res) => {
    res.json({ theme: await getTheme() });
  }),
);

settingsRouter.put(
  '/theme',
  requirePerm('config.editar'),
  ah(async (req, res) => {
    const me = sessionUser(req);
    const body = parse(themeSchema, req.body);
    const before = await getTheme();
    const theme = await setTheme(body, me.id);
    await audit({ userId: me.id, action: 'config.apariencia', entity: 'setting', entityId: 'theme', detail: { before: before.mode, after: theme.mode } });
    res.json({ theme });
  }),
);
