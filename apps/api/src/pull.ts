/** Construcción del PullPayload (catálogo incremental + existencias completas de las sucursales autorizadas). */
import type { PullPayload } from '@amara/database';
import { col } from './db.ts';
import { getExtraCatalog, getExtraCategories, getTheme } from './settings.ts';

/**
 * `verifiers`: incluye, solo de los GERENTES, el verificador de contraseña (el hash scrypt que ya existe en el servidor) para que el
 * punto de venta pueda autorizar sin internet. Es un compromiso consciente: ver docs/PENDIENTES-v2-core.md (riesgos).
 */
export async function buildPullPayload(branchIds: string[], since?: string, opts: { verifiers?: boolean } = {}): Promise<PullPayload> {
  // La hora se toma ANTES de leer: lo que cambie durante la lectura se vuelve a traer en el siguiente pull.
  const serverTime = new Date().toISOString();
  const incremental = since ? { updatedAt: { $gte: since } } : {};
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [branches, products, variants, stock, users, grants, tokens, extraCategories, extraCatalog, theme, advances] = await Promise.all([
    col('branches').find({ _id: { $in: branchIds } }).toArray(),
    col('products').find(incremental).toArray(),
    col('variants').find(incremental).toArray(),
    col('stock').find({ branchId: { $in: branchIds } }).toArray(),
    // Solo roles del punto de venta; sin hashes (se piden campos explícitos).
    col('users')
      .find({ branchIds: { $in: branchIds }, role: { $in: ['gerente', 'vendedor'] } })
      .project({ username: 1, name: 1, role: 1, branchIds: 1, active: 1, ...(opts.verifiers ? { passwordHash: 1 } : {}) })
      .toArray(),
    col('grants').find({ branchId: { $in: branchIds }, expiresAt: { $gt: dayAgo } }).toArray(),
    // v2: tokens de las sucursales (y generales) vigentes o vencidos/revocados en las últimas 24 h. Solo sal + hash, nunca el código.
    col('security_tokens').find({ branchId: { $in: [...branchIds, null] }, expiresAt: { $gt: dayAgo } }).sort({ createdAt: -1 }).limit(500).toArray(),
    getExtraCategories(),
    getExtraCatalog(),
    getTheme(),
    // v2.3: anticipos de limpias de las sucursales (los 600 más recientes) con todos sus movimientos.
    col('advances').find({ branchId: { $in: branchIds } }).sort({ createdAt: -1 }).limit(600).toArray(),
  ]);
  const advIds = advances.map((a) => a._id as unknown as string);
  const advEntries = advIds.length ? await col('advance_entries').find({ advanceId: { $in: advIds } }).sort({ createdAt: 1 }).toArray() : [];
  const entriesBy = new Map<string, typeof advEntries>();
  for (const e of advEntries) entriesBy.set(e.advanceId, [...(entriesBy.get(e.advanceId) ?? []), e]);

  return {
    serverTime,
    branches: branches.map((b) => ({ id: b._id, code: b.code, name: b.name, status: b.status ?? 'activa', locations: b.locations ?? [] })),
    products: products.map((p) => ({
      id: p._id, name: p.name, type: p.type, category: p.category, description: p.description ?? null, brand: p.brand ?? null,
      sku: p.sku, photo: p.photo ?? null, specs: p.specs ?? {}, status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt,
    })),
    variants: variants.map((v) => ({
      id: v._id, productId: v.productId, label: v.label, unit: v.unit, barcode: v.barcode ?? null, internalCode: v.internalCode,
      qrValue: v.qrValue, costCents: v.costCents, priceCents: v.priceCents, minStock: v.minStock ?? 0, location: v.location ?? null,
      status: v.status, updatedAt: v.updatedAt,
    })),
    stock: stock.map((s) => ({ variantId: s.variantId, branchId: s.branchId, qty: Number(s.qty ?? 0), location: s.location ?? null })),
    users: users.map((u) => ({
      id: u._id, username: u.username, name: u.name, role: u.role, branchIds: u.branchIds ?? [], active: !!u.active,
      ...(opts.verifiers && u.role === 'gerente' ? { verifier: u.passwordHash ?? null } : {}),
    })),
    grants: grants.map((g) => ({
      id: g._id, sellerId: g.sellerId, branchId: g.branchId, functions: g.functions ?? [], startsAt: g.startsAt, expiresAt: g.expiresAt,
      revokedAt: g.revokedAt ?? null, grantedBy: g.grantedBy,
    })),
    securityTokens: tokens.map((t) => ({
      id: t._id as unknown as string, label: t.label, purposes: t.purposes ?? [], branchId: t.branchId ?? null, forUserId: t.forUserId ?? null,
      createdBy: t.createdBy, createdAt: t.createdAt, expiresAt: t.expiresAt, revokedAt: t.revokedAt ?? null, maxUses: t.maxUses ?? null,
      usedCount: Number(t.usedCount ?? 0), salt: t.salt, hash: t.hash,
    })),
    advances: advances.map((a) => ({
      id: a._id as unknown as string, code: a.code, branchId: a.branchId, terminalId: a.terminalId, clientName: a.clientName, clientPhone: a.clientPhone ?? null,
      concept: a.concept ?? '', createdBy: a.createdBy, createdByName: a.createdByName, createdAt: a.createdAt,
      entries: (entriesBy.get(a._id as unknown as string) ?? []).map((e) => ({
        id: e._id as unknown as string, advanceId: e.advanceId, kind: e.kind, amountCents: e.amountCents, method: e.method ?? null, note: e.note ?? '',
        userId: e.userId, userName: e.userName, createdAt: e.createdAt, cashSessionId: e.cashSessionId ?? null,
      })),
    })),
    settings: { extraCategories, extraCatalog, theme },
  };
}
