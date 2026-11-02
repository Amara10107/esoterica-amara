/** v2.3: retiros/gastos con autorización y anticipos de limpias (alta, abonos, usos, permisos). */
import { describe, expect, it } from 'vitest';
import type { SyncOp } from '@amara/shared';
import { applySyncOp } from '../src/sync-apply.ts';
import { B1, ctxTerminal, GER, seedRepo, T1, uid, VEN } from './fixtures.ts';

const apply = (repo: ReturnType<typeof seedRepo>, op: SyncOp) => applySyncOp(repo, op, ctxTerminal);
const SES = 'ses-v3';
const AT = '2026-10-22T16:00:00.000Z';

const openOp = (userId = GER): SyncOp => ({
  opId: uid(), type: 'cash.open', branchId: B1, terminalId: T1, userId, localTs: '2026-10-22T14:00:00.000Z',
  payload: { session: { id: SES, branchId: B1, terminalId: T1, openedBy: userId, openedAt: '2026-10-22T14:00:00.000Z', openingCents: 50000 } },
});
const mov = (userId: string, type: 'entrada' | 'retiro' | 'gasto', extra: Record<string, unknown> = {}, movExtra: Record<string, unknown> = {}): SyncOp => ({
  opId: uid(), type: 'cash.movement', branchId: B1, terminalId: T1, userId, localTs: AT,
  payload: { movement: { id: uid(), sessionId: SES, type, amountCents: 3000, concept: 'Comida del personal', userId, createdAt: AT, ...movExtra }, ...extra },
});

describe('retiros y gastos', () => {
  it('el gerente saca dinero sin autorización extra', async () => {
    const repo = seedRepo();
    await apply(repo, openOp());
    const r = await apply(repo, mov(GER, 'retiro'));
    expect(r.status).toBe('applied');
    expect(repo.cashMovements.size).toBe(1);
  });

  it('el vendedor sin autorización: el dinero ya salió, se aplica y queda conflicto autorizacion_invalida', async () => {
    const repo = seedRepo();
    await apply(repo, openOp());
    const r = await apply(repo, mov(VEN, 'gasto'));
    expect(r.status).toBe('conflict');
    expect(r.conflictKind).toBe('autorizacion_invalida');
    expect(repo.cashMovements.size).toBe(1);
  });

  it('el vendedor con la contraseña de un gerente de la sucursal: se aplica', async () => {
    const repo = seedRepo();
    await apply(repo, openOp());
    const r = await apply(repo, mov(VEN, 'retiro', { authorization: { kind: 'admin_password', adminUserId: GER } }));
    expect(r.status).toBe('applied');
  });

  it('el vendedor no puede meter efectivo a la caja (entrada) salvo el abono de un anticipo', async () => {
    const repo = seedRepo();
    await apply(repo, openOp());
    expect((await apply(repo, mov(VEN, 'entrada'))).conflictKind).toBe('sin_permiso');
    const r = await apply(repo, mov(VEN, 'entrada', {}, { advanceId: 'no-existe' }));
    expect(r.conflictKind).toBe('anticipo_no_encontrado');
  });
});

describe('anticipos de limpias', () => {
  const ADV = 'adv-0001';
  const advance = (userId = VEN) => ({
    id: ADV, code: 'ANT-P1-0001', branchId: B1, terminalId: T1, clientName: 'María López', clientPhone: '5512345678', concept: 'Limpia', createdBy: userId, createdByName: 'Vendedora', createdAt: AT,
  });
  const entry = (kind: string, userId: string, over: Record<string, unknown> = {}) => ({
    id: uid(), advanceId: ADV, kind, amountCents: kind === 'cierre' || kind === 'reapertura' ? 0 : 30000, method: kind === 'abono' ? 'efectivo' : null, note: kind === 'uso' ? '5 velas' : '',
    userId, userName: 'X', createdAt: AT, cashSessionId: null, ...over,
  });
  const createOp = (userId = VEN): SyncOp => ({ opId: uid(), type: 'advance.create', branchId: B1, terminalId: T1, userId, localTs: AT, payload: { advance: advance(userId), entry: entry('abono', userId) } });
  const entryOp = (kind: string, userId: string, over: Record<string, unknown> = {}): SyncOp => ({ opId: uid(), type: 'advance.entry', branchId: B1, terminalId: T1, userId, localTs: AT, payload: { entry: entry(kind, userId, over) } });

  it('el vendedor crea el anticipo con su primer abono; reenviarlo es idempotente', async () => {
    const repo = seedRepo();
    const op = createOp();
    expect((await apply(repo, op)).status).toBe('applied');
    expect((await apply(repo, op)).status).toBe('duplicate');
    expect(repo.advances.size).toBe(1);
    expect(repo.advanceEntries.size).toBe(1);
  });

  it('el abono en efectivo del anticipo entra al cajón y se acepta aunque lo registre el vendedor', async () => {
    const repo = seedRepo();
    await apply(repo, openOp());
    await apply(repo, createOp());
    const r = await apply(repo, mov(VEN, 'entrada', {}, { advanceId: ADV, amountCents: 30000, concept: 'Anticipo de limpia ANT-P1-0001 - María López' }));
    expect(r.status).toBe('applied');
  });

  it('solo el gerente agrega abonos, usos, cierra y reabre', async () => {
    const repo = seedRepo();
    await apply(repo, createOp());
    for (const kind of ['abono', 'uso', 'cierre']) {
      expect((await apply(repo, entryOp(kind, VEN))).conflictKind).toBe('sin_permiso');
    }
    expect((await apply(repo, entryOp('abono', GER))).status).toBe('applied');
    expect((await apply(repo, entryOp('uso', GER))).status).toBe('applied');
    expect((await apply(repo, entryOp('cierre', GER))).status).toBe('applied');
    expect(repo.advanceEntries.size).toBe(4);
  });

  it('valida la forma: uso sin descripción, cierre con importe, anticipo inexistente o ajeno al usuario', async () => {
    const repo = seedRepo();
    await apply(repo, createOp());
    expect((await apply(repo, entryOp('uso', GER, { note: 'x' }))).status).toBe('rejected');
    expect((await apply(repo, entryOp('cierre', GER, { amountCents: 100 }))).status).toBe('rejected');
    expect((await apply(repo, entryOp('abono', GER, { advanceId: 'otro' }))).conflictKind).toBe('anticipo_no_encontrado');
    expect((await apply(repo, entryOp('abono', GER, { userId: VEN }))).conflictKind).toBe('payload_inconsistente');
    const bad = createOp();
    (bad.payload as any).entry.kind = 'uso';
    expect((await apply(seedRepo(), bad)).status).toBe('rejected');
  });
});
