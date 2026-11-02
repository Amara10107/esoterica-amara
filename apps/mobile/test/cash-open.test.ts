import test from 'node:test';
import assert from 'node:assert/strict';
import { B1, T1, cachedToken, gerente, newStore, pullPayload, vendedor } from '../../../packages/database/test/helpers.ts';
import { authorizeAction } from '../src/lib/authorize.ts';

/** Terminal configurada con la caja CERRADA (readyStore la abre). */
async function closedStore() {
  const { store } = await newStore();
  await store.applyPull(pullPayload());
  await store.setDeviceInfo({ branchId: B1, branchCode: 'A', terminalId: T1, terminalCode: 'P1' });
  return store;
}

test('abrir caja en el teléfono: el vendedor solo con token «apertura_caja» o contraseña de admin; el gerente con la suya', async () => {
  const store = await closedStore();
  const base = { branchId: B1, terminalId: T1, openingCents: 50000, requireAuthorization: true };
  await assert.rejects(store.openCash({ ...base, actor: vendedor }), (e: any) => e.code === 'autorizacion_requerida');

  const p = pullPayload();
  p.securityTokens = [cachedToken('ABCD2345', { purposes: ['limpias'] })];
  await store.applyPull(p);
  const wrong = await authorizeAction(store, { purpose: 'apertura_caja', branchId: B1, userId: vendedor.userId, role: 'vendedor', mode: 'token', secret: 'ABCD2345' }, null);
  assert.ok(!wrong.ok, 'un token de otro propósito no sirve');

  p.securityTokens = [cachedToken('ABCD2345', { purposes: ['apertura_caja'] })];
  await store.applyPull(p);
  const auth = await authorizeAction(store, { purpose: 'apertura_caja', branchId: B1, userId: vendedor.userId, role: 'vendedor', mode: 'token', secret: 'ABCD2345' }, null);
  assert.ok(auth.ok);
  const id = await store.openCash({ ...base, actor: vendedor, authorization: auth.ok ? auth.authorization : undefined });
  assert.ok(id);
  assert.ok(await store.currentSession(T1));

  // Sin la bandera (PC) el vendedor sigue abriendo libremente: la regla de emergencia es solo del teléfono.
  const s2 = await closedStore();
  assert.ok(await s2.openCash({ branchId: B1, terminalId: T1, openingCents: 100, actor: vendedor }));
  // El gerente no necesita token.
  const s3 = await closedStore();
  assert.ok(await s3.openCash({ ...base, actor: gerente }));
});
