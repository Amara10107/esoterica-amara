import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMatches, buildAdvanceCode, buildAdvanceTicketLines, parseAdvanceCode, summarizeAdvance } from '../src/advances.ts';
import type { AdvanceFull } from '../src/advances.ts';

const adv = (): AdvanceFull => ({
  id: 'a1', code: 'ANT-P1-0007', branchId: 'b', terminalId: 't', clientName: 'María López', clientPhone: '5511', concept: 'Limpia de abundancia', createdBy: 'u', createdByName: 'Vendedora', createdAt: '2026-10-22T16:00:00.000Z',
  entries: [
    { id: 'e1', advanceId: 'a1', kind: 'abono', amountCents: 30000, method: 'efectivo', note: '', userId: 'u', userName: 'Vendedora', createdAt: '2026-10-22T16:00:00.000Z', cashSessionId: null },
    { id: 'e2', advanceId: 'a1', kind: 'abono', amountCents: 20000, method: 'transferencia', note: '', userId: 'g', userName: 'Gerente', createdAt: '2026-10-25T16:00:00.000Z', cashSessionId: null },
    { id: 'e3', advanceId: 'a1', kind: 'uso', amountCents: 25000, method: null, note: '5 velas', userId: 'g', userName: 'Gerente', createdAt: '2026-10-26T16:00:00.000Z', cashSessionId: null },
  ],
});
const pick = (o: any, ks: string[]) => Object.fromEntries(ks.map((k) => [k, o[k]]));
const fmt = { fmtMoney: (c: number) => `$${(c / 100).toFixed(2)}`, fmtDateTime: (i: string) => i.slice(0, 10) };

test('anticipos: código y QR se leen de ambas formas', () => {
    assert.equal(buildAdvanceCode('p1', 7), 'ANT-P1-0007');
    assert.equal(parseAdvanceCode('amara:anticipo:ant-p1-0007'), 'ANT-P1-0007');
    assert.equal(parseAdvanceCode(' ANT-P1-0007 '), 'ANT-P1-0007');
    assert.equal(parseAdvanceCode('María'), null);
    assert.equal(parseAdvanceCode('amara:v1:abc'), null);
});
test('anticipos: saldo y estado', () => {
    assert.deepEqual(pick(summarizeAdvance(adv()), ['totalAbonosCents', 'totalUsoCents', 'balanceCents', 'status']), { totalAbonosCents: 50000, totalUsoCents: 25000, balanceCents: 25000, status: 'abierto' });
    const a = adv();
    a.entries.push({ ...a.entries[2]!, id: 'e4', kind: 'cierre', amountCents: 0, note: '', createdAt: '2026-10-27T16:00:00.000Z' });
    assert.equal(summarizeAdvance(a).status, 'cerrado');
    a.entries.push({ ...a.entries[2]!, id: 'e5', kind: 'reapertura', amountCents: 0, note: '', createdAt: '2026-10-28T16:00:00.000Z' });
    assert.equal(summarizeAdvance(a).status, 'abierto');
});
test('anticipos: búsqueda por nombre sin acentos, código, QR, día y teléfono', () => {
    const a = adv();
    for (const q of ['maria', 'LOPEZ', 'maria lopez', 'ANT-P1-0007', 'amara:anticipo:ANT-P1-0007', '2026-10-22', '5511', 'abundancia', '']) assert.equal(advanceMatches(a, q), true, q);
    for (const q of ['pedro', '2026-11-01', 'ANT-P1-0008']) assert.equal(advanceMatches(a, q), false, q);
});
test('anticipos: ticket: el primero es anticipo, el abono dice qué se dejó esta vez y el saldo corresponde a ese momento', () => {
    const a = adv();
    const first = buildAdvanceTicketLines(a, { ...fmt, uptoEntryId: 'e1' });
    assert.equal((first.find((l) => l.kind === 'band') as any).text, 'ANTICIPO DE LIMPIA');
    assert.equal((first.find((l) => l.kind === 'qr') as any).text, 'amara:anticipo:ANT-P1-0007');
    assert.equal((first.find((l) => l.kind === 'pair' && l.text === 'Saldo a favor') as any).value, '$300.00');
    const second = buildAdvanceTicketLines(a, { ...fmt, uptoEntryId: 'e2' });
    assert.equal((second.find((l) => l.kind === 'band') as any).text, 'ABONO A ANTICIPO');
    assert.equal((second.find((l) => l.kind === 'pair' && l.text === 'Saldo a favor') as any).value, '$500.00');
    const full = buildAdvanceTicketLines(a, fmt);
    assert.equal((full.find((l) => l.kind === 'pair' && l.text === 'Saldo a favor') as any).value, '$250.00');
    assert.ok(full.some((l) => l.kind === 'small' && l.text === '5 velas'));
});

