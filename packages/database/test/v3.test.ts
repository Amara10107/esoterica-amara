/**
 * v2.3: retiros/gastos con motivo y autorización, y anticipos de limpias (abonos, usos, cierre, búsqueda, sincronización).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAdvance } from '@amara/shared';
import { StoreError } from '../src/types.ts';
import { ADMIN_PASSWORD, B1, T1, cachedToken, gerente, pullPayload, readyStore, vendedor } from './helpers.ts';

const code = (e: unknown, c: string) => e instanceof StoreError && e.code === c;

async function withToken(store: Awaited<ReturnType<typeof readyStore>>['store'], purposes: string[]) {
  const p = pullPayload();
  p.securityTokens = [cachedToken('ABCD2345', { purposes: purposes as any })];
  await store.applyPull(p);
}

test('retiro: el motivo es obligatorio y el gerente lo registra con su sesión', async () => {
  const { store } = await readyStore();
  await assert.rejects(store.addCashMovement({ actor: gerente, terminalId: T1, type: 'retiro', amountCents: 5000, concept: 'abc' }), (e) => code(e, 'motivo_requerido'));
  await store.addCashMovement({ actor: gerente, terminalId: T1, type: 'retiro', amountCents: 5000, concept: 'Comida del personal' });
  const s = await store.currentSession(T1);
  const { breakdown } = await store.cashBreakdown(s.id);
  assert.equal(breakdown.withdrawalsCents, 5000);
  assert.equal(breakdown.expectedCents, 100000 - 5000);
});

test('retiro/gasto: el vendedor necesita contraseña de administrador o token retiro_caja', async () => {
  const { store } = await readyStore();
  const base = { actor: vendedor, terminalId: T1, type: 'gasto' as const, amountCents: 3000, concept: 'Pago de luz del local' };
  await assert.rejects(store.addCashMovement(base), (e) => code(e, 'autorizacion_requerida'));
  await assert.rejects(store.addCashMovement({ ...base, type: 'entrada' }), (e) => code(e, 'sin_permiso'));
  // contraseña de administrador (verificada sin internet)
  const v = await store.verifyActionAuthorization({ purpose: 'retiro_caja', branchId: B1, userId: vendedor.userId, adminPassword: ADMIN_PASSWORD });
  assert.ok(v.ok);
  if (v.ok) await store.addCashMovement({ ...base, authorization: v.authorization });
  // un token de otro propósito NO sirve
  await withToken(store, ['limpias']);
  const bad = await store.verifyActionAuthorization({ purpose: 'retiro_caja', branchId: B1, userId: vendedor.userId, code: 'ABCD2345' });
  assert.equal(bad.ok, false);
  // token correcto
  await withToken(store, ['retiro_caja']);
  const good = await store.verifyActionAuthorization({ purpose: 'retiro_caja', branchId: B1, userId: vendedor.userId, code: 'ABCD2345' });
  assert.ok(good.ok);
  if (good.ok) await store.addCashMovement({ ...base, concept: 'Agua para el local', authorization: good.authorization });
  const queued = (await store.db.all<any>("SELECT payload_json FROM sync_queue WHERE type = 'cash.movement'")).map((r) => JSON.parse(r.payload_json));
  assert.ok(queued.filter((q) => q.authorization).length >= 2, 'la autorización viaja con el movimiento');
  const aud = await store.db.all<any>("SELECT detail_json FROM audit_log WHERE action = 'caja.gasto'");
  assert.ok(aud.every((a) => JSON.parse(a.detail_json).concept));
});

test('anticipo: cualquiera lo recibe; entra al cajón, genera código y queda en la cola', async () => {
  const { store } = await readyStore();
  const r = await store.createAdvance({ actor: vendedor, branchId: B1, terminalId: T1, terminalCode: 'P1', clientName: '  María   López ', clientPhone: '5512345678', concept: 'Limpia de abundancia', amountCents: 30000 });
  assert.equal(r.advance.code, 'ANT-P1-0001');
  assert.equal(r.advance.clientName, 'María López');
  assert.equal(r.cashRegistered, true);
  const s = await store.currentSession(T1);
  assert.equal((await store.cashBreakdown(s.id)).breakdown.cashInCents, 30000);
  const types = (await store.db.all<any>('SELECT type FROM sync_queue ORDER BY rowid')).map((x) => x.type);
  assert.ok(types.includes('advance.create') && types.filter((t) => t === 'cash.movement').length === 1);
  const r2 = await store.createAdvance({ actor: vendedor, branchId: B1, terminalId: T1, terminalCode: 'P1', clientName: 'Juan', amountCents: 10000, method: 'transferencia' });
  assert.equal(r2.advance.code, 'ANT-P1-0002');
  assert.equal(r2.cashRegistered, false, 'una transferencia no entra al cajón');
  await assert.rejects(store.createAdvance({ actor: vendedor, branchId: B1, terminalId: T1, terminalCode: 'P1', clientName: 'X', amountCents: 100 }), (e) => code(e, 'nombre_requerido'));
  await assert.rejects(store.createAdvance({ actor: vendedor, branchId: B1, terminalId: T1, terminalCode: 'P1', clientName: 'Ana', amountCents: 0 }), (e) => code(e, 'importe_invalido'));
});

test('anticipo: solo el gerente agrega abonos, registra usos, cierra y reabre; el saldo cuadra', async () => {
  const { store } = await readyStore();
  const { advance } = await store.createAdvance({ actor: vendedor, branchId: B1, terminalId: T1, terminalCode: 'P1', clientName: 'María', amountCents: 30000 });
  await assert.rejects(store.addAdvanceEntry({ actor: vendedor, terminalId: T1, advanceId: advance.id, kind: 'abono', amountCents: 100 }), (e) => code(e, 'sin_permiso'));
  const a2 = await store.addAdvanceEntry({ actor: gerente, terminalId: T1, advanceId: advance.id, kind: 'abono', amountCents: 20000 });
  assert.equal(a2.cashRegistered, true);
  assert.equal(summarizeAdvance(a2.advance).balanceCents, 50000);
  await assert.rejects(store.addAdvanceEntry({ actor: gerente, terminalId: T1, advanceId: advance.id, kind: 'uso', amountCents: 1000, note: 'x' }), (e) => code(e, 'motivo_requerido'));
  await assert.rejects(store.addAdvanceEntry({ actor: gerente, terminalId: T1, advanceId: advance.id, kind: 'uso', amountCents: 60000, note: '5 velas' }), (e) => code(e, 'excede_saldo'));
  const a3 = await store.addAdvanceEntry({ actor: gerente, terminalId: T1, advanceId: advance.id, kind: 'uso', amountCents: 25000, note: '5 velas' });
  assert.equal(summarizeAdvance(a3.advance).balanceCents, 25000);
  const a4 = await store.addAdvanceEntry({ actor: gerente, terminalId: T1, advanceId: advance.id, kind: 'cierre', note: 'Terminada' });
  assert.equal(summarizeAdvance(a4.advance).status, 'cerrado');
  await assert.rejects(store.addAdvanceEntry({ actor: gerente, terminalId: T1, advanceId: advance.id, kind: 'abono', amountCents: 100 }), (e) => code(e, 'anticipo_cerrado'));
  const a5 = await store.addAdvanceEntry({ actor: gerente, terminalId: T1, advanceId: advance.id, kind: 'reapertura' });
  assert.equal(summarizeAdvance(a5.advance).status, 'abierto');
  // el efectivo de los dos abonos está en el corte
  const s = await store.currentSession(T1);
  assert.equal((await store.cashBreakdown(s.id)).breakdown.cashInCents, 50000);
  // el historial no se modifica
  await assert.rejects(store.db.run('UPDATE advance_entries SET amount_cents = 1'));
  await assert.rejects(store.db.run('DELETE FROM advances'));
});

test('anticipo: búsqueda por nombre, código, QR, día y estado; el pull no pisa lo local', async () => {
  const { store } = await readyStore();
  const a = await store.createAdvance({ actor: vendedor, branchId: B1, terminalId: T1, terminalCode: 'P1', clientName: 'María López', amountCents: 30000 });
  await store.createAdvance({ actor: gerente, branchId: B1, terminalId: T1, terminalCode: 'P1', clientName: 'José Pérez', amountCents: 5000, method: 'tarjeta' });
  assert.equal((await store.searchAdvances({ text: 'maria' })).length, 1);
  assert.equal((await store.searchAdvances({ text: 'LOPEZ' }))[0]!.id, a.advance.id);
  assert.equal((await store.searchAdvances({ text: 'amara:anticipo:ANT-P1-0001' }))[0]!.id, a.advance.id);
  assert.equal((await store.searchAdvances({ text: 'ant-p1-0002' }))[0]!.clientName, 'José Pérez');
  assert.equal((await store.searchAdvances({ text: '2026-10-22' })).length, 2);
  assert.equal((await store.searchAdvances({ text: '2026-01-01' })).length, 0);
  assert.equal((await store.searchAdvances({ status: 'cerrado' })).length, 0);
  assert.ok(await store.getAdvance('ANT-P1-0001'));
  // Un pull con el mismo anticipo (más movimientos de otro equipo) agrega sin duplicar ni borrar.
  const full = (await store.getAdvance(a.advance.id))!;
  const p = pullPayload();
  p.advances = [{ ...full, entries: [...full.entries, { id: 'e-remota', advanceId: full.id, kind: 'uso', amountCents: 1000, method: null, note: 'velas', userId: gerente.userId, userName: 'Gerente', createdAt: '2026-10-22T16:30:00.000Z', cashSessionId: null }] }];
  await store.applyPull(p);
  await store.applyPull(p);
  const after = (await store.getAdvance(a.advance.id))!;
  assert.equal(after.entries.length, 2);
  assert.equal((await store.searchAdvances({})).length, 2);
});
