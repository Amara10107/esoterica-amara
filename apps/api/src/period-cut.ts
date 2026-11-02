/**
 * Corte por periodo (v2.3, solo gerente): junta los cortes de caja cerrados entre dos fechas (por ejemplo, de lunes a domingo)
 * y lo vendido y ganado en esos días. Es una foto: al guardarla queda tal cual, aunque después se corrijan datos.
 * PURO: la ruta carga los documentos y llama aquí.
 */
import { PROFIT_DISCLAIMER, summarizeSales } from '@amara/shared';
import type { PeriodCutData, PeriodCutOutflow, PeriodCutSession, ReportAdjustment, ReportSale } from '@amara/shared';

type Doc = Record<string, any>;

export type { PeriodCutData, PeriodCutOutflow, PeriodCutSession } from '@amara/shared';

export function buildPeriodCut(p: {
  range: { fromDay: string; toDay: string; from: string; to: string };
  sessions: Doc[];
  openSessions: number;
  movements: Doc[];
  sales: ReportSale[];
  adjustments: ReportAdjustment[];
  advanceEntries: Doc[];
  userNames: Map<string, string>;
}): PeriodCutData {
  const name = (id: unknown) => p.userNames.get(String(id)) ?? '—';
  const sessions: PeriodCutSession[] = p.sessions
    .map((s) => ({
      id: String(s._id ?? s.id),
      terminalId: String(s.terminalId ?? ''),
      branchId: String(s.branchId ?? ''),
      openedAt: s.openedAt,
      openedByName: name(s.openedBy),
      closedAt: s.closedAt,
      closedByName: name(s.closedBy),
      openingCents: Number(s.openingCents ?? 0),
      expectedCents: Number(s.expectedCents ?? 0),
      countedCents: Number(s.countedCents ?? 0),
      differenceCents: Number(s.differenceCents ?? 0),
      provisional: !!s.provisional,
    }))
    .sort((a, b) => (a.closedAt < b.closedAt ? -1 : 1));

  const ids = new Set(sessions.map((s) => s.id));
  let cashIn = 0;
  let withdrawals = 0;
  let expenses = 0;
  const outflows: PeriodCutOutflow[] = [];
  for (const m of p.movements) {
    if (!ids.has(String(m.sessionId))) continue;
    const amt = Number(m.amountCents ?? 0);
    if (m.type === 'entrada') cashIn += amt;
    else {
      if (m.type === 'retiro') withdrawals += amt;
      else expenses += amt;
      outflows.push({ at: m.createdAt, type: m.type, amountCents: amt, concept: String(m.concept ?? ''), userName: name(m.userId) });
    }
  }
  outflows.sort((a, b) => (a.at < b.at ? -1 : 1));

  const sum = summarizeSales(p.sales, p.adjustments, { from: p.range.from, to: p.range.to }, 0);
  let abonos = 0;
  let usos = 0;
  let advCount = 0;
  for (const e of p.advanceEntries) {
    if (e.kind === 'abono') {
      abonos += Number(e.amountCents ?? 0);
      advCount++;
    } else if (e.kind === 'uso') usos += Number(e.amountCents ?? 0);
  }
  const t = sessions.reduce(
    (a, s) => ({ openingCents: a.openingCents + s.openingCents, expectedCents: a.expectedCents + s.expectedCents, countedCents: a.countedCents + s.countedCents, differenceCents: a.differenceCents + s.differenceCents }),
    { openingCents: 0, expectedCents: 0, countedCents: 0, differenceCents: 0 },
  );
  return {
    range: { fromDay: p.range.fromDay, toDay: p.range.toDay },
    cutsCount: sessions.length,
    openSessions: p.openSessions,
    provisionalCount: sessions.filter((s) => s.provisional).length,
    sessions,
    totals: { ...t, cashInCents: cashIn, withdrawalsCents: withdrawals, expensesCents: expenses },
    outflows,
    sales: {
      ticketCount: sum.ticketCount, grossCents: sum.grossCents, cancelledCents: sum.cancelledCents, refundedCents: sum.refundedCents, netCents: sum.netCents,
      cogsCents: sum.cogsCents, grossProfitCents: sum.grossProfitCents, unitsSold: sum.unitsSold, byMethod: sum.byMethod,
    },
    advances: { abonosCents: abonos, usosCents: usos, count: advCount },
    profitAfterExpensesCents: sum.grossProfitCents - withdrawals - expenses,
    disclaimer: PROFIT_DISCLAIMER,
  };
}
