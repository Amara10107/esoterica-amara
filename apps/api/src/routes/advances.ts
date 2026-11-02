/**
 * /advances (v2.3): anticipos de limpias. Búsqueda y consulta (solo gerente) y movimientos hechos desde la web.
 * Un abono agregado desde la web NO entra al cajón de ninguna caja (la web no tiene caja): queda registrado como abono sin sesión.
 */
import { Router } from 'express';
import { z } from 'zod';
import { advanceMatches, newId, summarizeAdvance } from '@amara/shared';
import type { AdvanceFull, SyncOp } from '@amara/shared';
import { branchScope, requirePerm } from '../auth.ts';
import { col } from '../db.ts';
import { ah, HttpError, parse } from '../http.ts';
import { applySyncOp } from '../sync-apply.ts';
import type { ApplyContext } from '../sync-apply.ts';
import { createMongoSyncRepo } from '../sync-repo.ts';
import { dayStr, rejectionToHttp, sessionUser } from '../util.ts';

export const advancesRouter = Router();
advancesRouter.use(requirePerm('caja.corte')); // solo el administrador
const repo = createMongoSyncRepo();
const ctx = (): ApplyContext => ({ now: () => new Date(), source: 'servidor' });

async function load(filter: Record<string, unknown>, limit: number): Promise<AdvanceFull[]> {
  const advs = await col('advances').find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  if (advs.length === 0) return [];
  const entries = await col('advance_entries').find({ advanceId: { $in: advs.map((a) => a._id as unknown as string) } }).sort({ createdAt: 1 }).toArray();
  const by = new Map<string, any[]>();
  for (const e of entries) by.set(e.advanceId, [...(by.get(e.advanceId) ?? []), e]);
  return advs.map((a) => ({
    id: a._id as unknown as string, code: a.code, branchId: a.branchId, terminalId: a.terminalId, clientName: a.clientName, clientPhone: a.clientPhone ?? null,
    concept: a.concept ?? '', createdBy: a.createdBy, createdByName: a.createdByName, createdAt: a.createdAt,
    entries: (by.get(a._id as unknown as string) ?? []).map((e) => ({
      id: e._id as string, advanceId: e.advanceId, kind: e.kind, amountCents: e.amountCents, method: e.method ?? null, note: e.note ?? '',
      userId: e.userId, userName: e.userName, createdAt: e.createdAt, cashSessionId: e.cashSessionId ?? null,
    })),
  }));
}

const withSummary = (a: AdvanceFull) => ({ ...a, summary: summarizeAdvance(a) });

advancesRouter.get(
  '/',
  ah(async (req, res) => {
    const user = sessionUser(req);
    const q = parse(
      z.object({
        text: z.string().max(100).optional(),
        status: z.enum(['abierto', 'cerrado', 'todos']).optional(),
        branchId: z.string().optional(),
        from: dayStr.optional(),
        to: dayStr.optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      }),
      req.query,
    );
    const filter: Record<string, unknown> = { branchId: { $in: branchScope(user, q.branchId) } };
    const all = await load(filter, 1000);
    const items = all
      .filter((a) => (q.text ? advanceMatches(a, q.text) : true))
      .filter((a) => (q.from ? a.createdAt.slice(0, 10) >= q.from : true) && (q.to ? a.createdAt.slice(0, 10) <= q.to : true))
      .map(withSummary)
      .filter((a) => !q.status || q.status === 'todos' || a.summary.status === q.status)
      .slice(0, q.limit);
    res.json({ items });
  }),
);

advancesRouter.get(
  '/:id',
  ah(async (req, res) => {
    const user = sessionUser(req);
    const key = String(req.params.id);
    const found = (await load({ branchId: { $in: branchScope(user, undefined) }, $or: [{ _id: key }, { code: key.toUpperCase() }] } as any, 1))[0];
    if (!found) throw new HttpError(404, 'Anticipo no encontrado');
    res.json(withSummary(found));
  }),
);

advancesRouter.post(
  '/:id/entries',
  ah(async (req, res) => {
    const user = sessionUser(req);
    const body = parse(
      z.object({
        kind: z.enum(['abono', 'uso', 'cierre', 'reapertura']),
        amountCents: z.number().int().min(0).max(100_000_000_00).optional(),
        method: z.enum(['efectivo', 'tarjeta', 'transferencia']).optional(),
        note: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    const adv = (await load({ branchId: { $in: branchScope(user, undefined) }, _id: String(req.params.id) } as any, 1))[0];
    if (!adv) throw new HttpError(404, 'Anticipo no encontrado');
    const sum = summarizeAdvance(adv);
    const amount = body.kind === 'abono' || body.kind === 'uso' ? body.amountCents ?? 0 : 0;
    if ((body.kind === 'abono' || body.kind === 'uso') && amount <= 0) throw new HttpError(400, 'Escribe un importe mayor a $0');
    if (body.kind === 'uso' && (body.note ?? '').length < 3) throw new HttpError(400, 'Escribe en qué se utilizó (por ejemplo: 5 velas)');
    if (body.kind === 'uso' && amount > sum.balanceCents) throw new HttpError(409, 'El importe es mayor al saldo del anticipo');
    if (sum.status === 'cerrado' && body.kind !== 'reapertura') throw new HttpError(409, 'El anticipo está cerrado: ábrelo de nuevo primero');
    if (sum.status === 'abierto' && body.kind === 'reapertura') throw new HttpError(409, 'El anticipo ya está abierto');
    const now = new Date().toISOString();
    const entryId = newId();
    const op: SyncOp = {
      opId: newId(), type: 'advance.entry', branchId: adv.branchId, terminalId: 'web', userId: user.id, localTs: now,
      payload: {
        entry: {
          id: entryId, advanceId: adv.id, kind: body.kind, amountCents: amount, method: body.kind === 'abono' ? body.method ?? 'efectivo' : null,
          note: body.note ?? '', userId: user.id, userName: user.name, createdAt: now, cashSessionId: null,
        },
      },
    };
    const r = await applySyncOp(repo, op, ctx());
    if (r.status === 'rejected') throw rejectionToHttp(r.conflictKind, r.detail);
    const fresh = (await load({ _id: adv.id } as any, 1))[0]!;
    res.status(201).json(withSummary(fresh));
  }),
);
