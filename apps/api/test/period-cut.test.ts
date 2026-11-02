import { describe, expect, it } from 'vitest';
import { buildPeriodCut } from '../src/period-cut.ts';

const range = { fromDay: '2026-10-19', toDay: '2026-10-25', from: '2026-10-19T06:00:00.000Z', to: '2026-10-26T06:00:00.000Z' };
const session = (id: string, closedAt: string, over: Record<string, unknown> = {}) => ({
  _id: id, terminalId: 't1', branchId: 'b1', openedAt: closedAt.slice(0, 10) + 'T14:00:00.000Z', openedBy: 'u1', closedAt, closedBy: 'u1',
  openingCents: 50000, expectedCents: 100000, countedCents: 99000, differenceCents: -1000, provisional: false, ...over,
});
const sale = (id: string, createdAt: string, total: number, cost: number) => ({
  id, branchId: 'b1', createdAt, totalCents: total, payments: [{ method: 'efectivo' as const, amountCents: total }],
  items: [{ variantId: 'v1', productName: 'Vela', variantLabel: 'Chica', qty: 1, unitCostCents: cost, netCents: total, kind: 'producto' as const }],
});

describe('corte por periodo', () => {
  const data = buildPeriodCut({
    range,
    sessions: [session('s2', '2026-10-22T23:00:00.000Z'), session('s1', '2026-10-20T23:00:00.000Z', { provisional: true, countedCents: 100000, differenceCents: 0 })],
    openSessions: 1,
    movements: [
      { sessionId: 's1', type: 'gasto', amountCents: 2000, concept: 'Comida', userId: 'u1', createdAt: '2026-10-20T18:00:00.000Z' },
      { sessionId: 's2', type: 'retiro', amountCents: 5000, concept: 'Pago a proveedor', userId: 'u2', createdAt: '2026-10-22T18:00:00.000Z' },
      { sessionId: 's2', type: 'entrada', amountCents: 30000, concept: 'Anticipo', userId: 'u2', createdAt: '2026-10-22T19:00:00.000Z' },
      { sessionId: 'otra', type: 'gasto', amountCents: 99999, concept: 'No cuenta', userId: 'u1', createdAt: '2026-10-22T19:00:00.000Z' },
    ],
    sales: [sale('a', '2026-10-20T15:00:00.000Z', 9000, 4000), sale('b', '2026-10-22T15:00:00.000Z', 15000, 8000), sale('fuera', '2026-10-30T15:00:00.000Z', 99999, 0)],
    adjustments: [],
    advanceEntries: [{ kind: 'abono', amountCents: 30000 }, { kind: 'uso', amountCents: 25000 }, { kind: 'cierre', amountCents: 0 }],
    userNames: new Map([['u1', 'Gerente'], ['u2', 'Vendedora']]),
  });

  it('cuenta los cortes y suma esperado, contado y diferencia', () => {
    expect(data.cutsCount).toBe(2);
    expect(data.provisionalCount).toBe(1);
    expect(data.openSessions).toBe(1);
    expect(data.totals.expectedCents).toBe(200000);
    expect(data.totals.countedCents).toBe(199000);
    expect(data.totals.differenceCents).toBe(-1000);
    expect(data.sessions.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(data.sessions[0]!.closedByName).toBe('Gerente');
  });

  it('suma lo vendido y lo ganado solo dentro del periodo', () => {
    expect(data.sales.ticketCount).toBe(2);
    expect(data.sales.netCents).toBe(24000);
    expect(data.sales.cogsCents).toBe(12000);
    expect(data.sales.grossProfitCents).toBe(12000);
  });

  it('movimientos solo de las sesiones del corte; salidas con motivo y quién', () => {
    expect(data.totals.expensesCents).toBe(2000);
    expect(data.totals.withdrawalsCents).toBe(5000);
    expect(data.totals.cashInCents).toBe(30000);
    expect(data.outflows.map((o) => [o.type, o.concept, o.userName])).toEqual([['gasto', 'Comida', 'Gerente'], ['retiro', 'Pago a proveedor', 'Vendedora']]);
    expect(data.profitAfterExpensesCents).toBe(12000 - 7000);
  });

  it('anticipos del periodo', () => {
    expect(data.advances).toEqual({ abonosCents: 30000, usosCents: 25000, count: 1 });
  });

  it('un periodo vacío da ceros', () => {
    const e = buildPeriodCut({ range, sessions: [], openSessions: 0, movements: [], sales: [], adjustments: [], advanceEntries: [], userNames: new Map() });
    expect(e.cutsCount).toBe(0);
    expect(e.sales.netCents).toBe(0);
    expect(e.profitAfterExpensesCents).toBe(0);
  });
});
