/**
 * Corte por periodo (v2.3, solo gerente): tipos compartidos y renglones del ticket/impresión.
 * El cálculo vive en el servidor (apps/api/src/period-cut.ts); aquí solo está la forma de los datos.
 */
import type { TicketLine } from './advances.ts';

export interface PeriodCutSession {
  id: string;
  terminalId: string;
  branchId: string;
  openedAt: string;
  openedByName: string;
  closedAt: string;
  closedByName: string;
  openingCents: number;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  provisional: boolean;
}

export interface PeriodCutOutflow {
  at: string;
  type: 'retiro' | 'gasto';
  amountCents: number;
  concept: string;
  userName: string;
}

export interface PeriodCutData {
  range: { fromDay: string; toDay: string };
  cutsCount: number;
  /** Sesiones que empezaron en el periodo y siguen abiertas (el corte aún no las incluye). */
  openSessions: number;
  provisionalCount: number;
  sessions: PeriodCutSession[];
  totals: {
    openingCents: number;
    expectedCents: number;
    countedCents: number;
    differenceCents: number;
    cashInCents: number;
    withdrawalsCents: number;
    expensesCents: number;
  };
  outflows: PeriodCutOutflow[];
  sales: {
    ticketCount: number;
    grossCents: number;
    cancelledCents: number;
    refundedCents: number;
    netCents: number;
    cogsCents: number;
    /** Lo que ganaste: ventas netas − costo de lo vendido (utilidad bruta estimada). */
    grossProfitCents: number;
    unitsSold: number;
    byMethod: Record<'efectivo' | 'tarjeta' | 'transferencia' | 'otro', { grossCents: number; refundedCents: number; netCents: number }>;
  };
  advances: { abonosCents: number; usosCents: number; count: number };
  /** Lo que ganaste menos los gastos pagados de la caja en el periodo (estimado). */
  profitAfterExpensesCents: number;
  disclaimer: string;
}


export interface PeriodCutRecord {
  id: string;
  title: string;
  note: string;
  branchName: string;
  createdAt: string;
  createdByName: string;
  data: PeriodCutData;
}

/** Renglones imprimibles del corte por periodo. */
export function buildPeriodCutLines(rec: Pick<PeriodCutRecord, 'title' | 'branchName' | 'createdAt' | 'createdByName' | 'note' | 'data'>, f: { fmtMoney: (c: number) => string; fmtDateTime: (iso: string) => string }): TicketLine[] {
  const d = rec.data;
  const m = f.fmtMoney;
  const L: TicketLine[] = [];
  L.push({ kind: 'title', text: 'Esotérica Amara' });
  L.push({ kind: 'band', text: 'CORTE POR PERIODO' });
  L.push({ kind: 'text', text: rec.title });
  if (rec.branchName) L.push({ kind: 'text', text: rec.branchName });
  L.push({ kind: 'text', text: `Del ${d.range.fromDay} al ${d.range.toDay}` });
  L.push({ kind: 'small', text: `Guardado ${f.fmtDateTime(rec.createdAt)} por ${rec.createdByName}` });
  L.push({ kind: 'rule' });
  L.push({ kind: 'bold', text: 'Cortes de caja del periodo' });
  L.push({ kind: 'pair', text: 'Cortes realizados', value: String(d.cutsCount), strong: true });
  if (d.provisionalCount > 0) L.push({ kind: 'small', text: `${d.provisionalCount} corte(s) provisional(es): se concilian al sincronizar.` });
  if (d.openSessions > 0) L.push({ kind: 'small', text: `${d.openSessions} caja(s) del periodo siguen abiertas y no están incluidas.` });
  L.push({ kind: 'pair', text: 'Efectivo esperado', value: m(d.totals.expectedCents) });
  L.push({ kind: 'pair', text: 'Efectivo contado', value: m(d.totals.countedCents) });
  L.push({ kind: 'pair', text: d.totals.differenceCents === 0 ? 'Diferencia' : d.totals.differenceCents < 0 ? 'Faltante' : 'Sobrante', value: m(Math.abs(d.totals.differenceCents)), strong: true });
  L.push({ kind: 'rule' });
  L.push({ kind: 'bold', text: 'Lo que se vendió' });
  L.push({ kind: 'pair', text: 'Tickets', value: String(d.sales.ticketCount) });
  L.push({ kind: 'pair', text: 'Ventas', value: m(d.sales.grossCents) });
  if (d.sales.cancelledCents > 0) L.push({ kind: 'pair', text: '- Canceladas', value: m(d.sales.cancelledCents) });
  if (d.sales.refundedCents > 0) L.push({ kind: 'pair', text: '- Devoluciones', value: m(d.sales.refundedCents) });
  L.push({ kind: 'pair', text: 'Ventas netas', value: m(d.sales.netCents), strong: true });
  L.push({ kind: 'pair', text: '- Costo de lo vendido', value: m(d.sales.cogsCents) });
  L.push({ kind: 'pair', text: 'Lo que ganaste', value: m(d.sales.grossProfitCents), strong: true });
  L.push({ kind: 'rule' });
  L.push({ kind: 'bold', text: 'Dinero que salió de la caja' });
  L.push({ kind: 'pair', text: 'Retiros', value: m(d.totals.withdrawalsCents) });
  L.push({ kind: 'pair', text: 'Gastos', value: m(d.totals.expensesCents) });
  for (const o of d.outflows) {
    L.push({ kind: 'pair', text: `${f.fmtDateTime(o.at)} ${o.type === 'retiro' ? 'Retiro' : 'Gasto'}`, value: m(o.amountCents) });
    L.push({ kind: 'small', text: `${o.concept} (${o.userName})` });
  }
  L.push({ kind: 'pair', text: 'Ganancia menos salidas', value: m(d.profitAfterExpensesCents), strong: true });
  if (d.advances.count > 0 || d.advances.usosCents > 0) {
    L.push({ kind: 'rule' });
    L.push({ kind: 'bold', text: 'Anticipos de limpias' });
    L.push({ kind: 'pair', text: `Abonos recibidos (${d.advances.count})`, value: m(d.advances.abonosCents) });
    L.push({ kind: 'pair', text: 'Usado en el periodo', value: m(d.advances.usosCents) });
  }
  if (rec.note) {
    L.push({ kind: 'rule' });
    L.push({ kind: 'text', text: `Nota: ${rec.note}` });
  }
  L.push({ kind: 'gap' });
  L.push({ kind: 'small', text: d.disclaimer });
  return L;
}
