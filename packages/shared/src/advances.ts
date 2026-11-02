/**
 * Anticipos de limpias (v2.3).
 *
 * Un cliente deja dinero por adelantado para una limpia. Cada anticipo tiene un código (y un QR) para
 * encontrarlo después. Solo se AGREGAN movimientos (nunca se editan ni se borran):
 *   - 'abono'      dinero que el cliente deja (el primero crea el anticipo; los demás los agrega el administrador)
 *   - 'uso'        en qué se utilizó (ej. "5 velas"), con el importe gastado
 *   - 'cierre'     el administrador da por terminado el anticipo
 *   - 'reapertura' el administrador lo abre de nuevo
 * Saldo = abonos − usos. El estado sale del último cierre/reapertura.
 */
export type AdvanceEntryKind = 'abono' | 'uso' | 'cierre' | 'reapertura';
export type AdvanceMethod = 'efectivo' | 'tarjeta' | 'transferencia';

export interface Advance {
  id: string;
  /** Ej. ANT-M1-0007. Es el texto del QR (con prefijo) y lo que se busca. */
  code: string;
  branchId: string;
  terminalId: string;
  clientName: string;
  clientPhone: string | null;
  /** Para qué es el anticipo (libre): "Limpia de abundancia", etc. */
  concept: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface AdvanceEntry {
  id: string;
  advanceId: string;
  kind: AdvanceEntryKind;
  /** Importe en centavos (0 para cierre/reapertura). */
  amountCents: number;
  method: AdvanceMethod | null;
  /** Abono: nota opcional. Uso: en qué se utilizó (obligatorio). */
  note: string;
  userId: string;
  userName: string;
  createdAt: string;
  /** Sesión de caja en la que el efectivo entró al cajón (solo abonos en efectivo con caja abierta). */
  cashSessionId: string | null;
}

export interface AdvanceFull extends Advance {
  entries: AdvanceEntry[];
}

export interface AdvanceSummary {
  totalAbonosCents: number;
  totalUsoCents: number;
  balanceCents: number;
  status: 'abierto' | 'cerrado';
  lastActivityAt: string;
}

export const ADVANCE_QR_PREFIX = 'amara:anticipo:';

export function advanceQrValue(code: string): string {
  return `${ADVANCE_QR_PREFIX}${code}`;
}

/** Acepta el texto de un QR de anticipo ("amara:anticipo:ANT-M1-0007") o el código a secas. */
export function parseAdvanceCode(text: string): string | null {
  const t = text.trim();
  if (t === '') return null;
  const code = t.toLowerCase().startsWith(ADVANCE_QR_PREFIX) ? t.slice(ADVANCE_QR_PREFIX.length) : t;
  return /^ANT-[A-Z0-9]{1,3}-\d{1,6}$/i.test(code) ? code.toUpperCase() : null;
}

export function buildAdvanceCode(terminalCode: string, seq: number): string {
  return `ANT-${terminalCode.toUpperCase()}-${String(seq).padStart(4, '0')}`;
}

export function summarizeAdvance(a: Pick<AdvanceFull, 'createdAt' | 'entries'>): AdvanceSummary {
  let abonos = 0;
  let usos = 0;
  let status: 'abierto' | 'cerrado' = 'abierto';
  let last = a.createdAt;
  // Orden estable: a la misma hora se respeta el orden en que llegaron los movimientos.
  const ordered = [...a.entries].sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0));
  for (const e of ordered) {
    if (e.kind === 'abono') abonos += e.amountCents;
    else if (e.kind === 'uso') usos += e.amountCents;
    else if (e.kind === 'cierre') status = 'cerrado';
    else status = 'abierto';
    if (e.createdAt > last) last = e.createdAt;
  }
  return { totalAbonosCents: abonos, totalUsoCents: usos, balanceCents: abonos - usos, status, lastActivityAt: last };
}

export const ADVANCE_METHOD_LABEL: Record<AdvanceMethod, string> = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
export const ADVANCE_KIND_LABEL: Record<AdvanceEntryKind, string> = { abono: 'Abono', uso: 'Se utilizó', cierre: 'Cerrado', reapertura: 'Reabierto' };

/** Texto en minúsculas y sin acentos, para buscar por nombre. */
export function foldText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** ¿Coincide el anticipo con lo escrito? Busca en código, nombre, teléfono, concepto y día (AAAA-MM-DD o DD/MM). */
export function advanceMatches(a: Advance, q: string): boolean {
  const t = foldText(q);
  if (t === '') return true;
  const code = parseAdvanceCode(q);
  if (code && a.code.toUpperCase() === code) return true;
  const hay = foldText(`${a.code} ${a.clientName} ${a.clientPhone ?? ''} ${a.concept} ${a.createdAt.slice(0, 10)} ${a.createdByName}`);
  return t.split(/\s+/).every((w) => hay.includes(w));
}

// ───────────────────────── Ticket (modelo de renglones, común a PC y teléfono) ─────────────────────────

export type TicketLine =
  | { kind: 'band' | 'title' | 'text' | 'bold' | 'small' | 'code' | 'qr'; text: string }
  | { kind: 'pair'; text: string; value: string; strong?: boolean }
  | { kind: 'rule' | 'gap' };

/**
 * Renglones del ticket de un anticipo. Si `uptoEntryId` viene, el ticket muestra el estado hasta ese movimiento
 * (el "ticket del abono"); si no, el estado completo actual. El QR lleva `amara:anticipo:<código>`.
 */
export function buildAdvanceTicketLines(
  a: AdvanceFull,
  opts: { business?: string; branchName?: string; uptoEntryId?: string | null; fmtMoney: (cents: number) => string; fmtDateTime: (iso: string) => string },
): TicketLine[] {
  const ordered = [...a.entries].sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0));
  const idx = opts.uptoEntryId ? ordered.findIndex((e) => e.id === opts.uptoEntryId) : -1;
  const shown = idx >= 0 ? ordered.slice(0, idx + 1) : ordered;
  const focus = idx >= 0 ? ordered[idx]! : null;
  const sum = summarizeAdvance({ createdAt: a.createdAt, entries: shown });
  const money = opts.fmtMoney;
  const L: TicketLine[] = [];
  L.push({ kind: 'title', text: opts.business ?? 'Esotérica Amara' });
  if (opts.branchName) L.push({ kind: 'text', text: opts.branchName });
  const heading = !focus || focus === ordered[0] ? 'ANTICIPO DE LIMPIA' : focus.kind === 'abono' ? 'ABONO A ANTICIPO' : focus.kind === 'uso' ? 'USO DE ANTICIPO' : focus.kind === 'cierre' ? 'ANTICIPO CERRADO' : 'ANTICIPO REABIERTO';
  L.push({ kind: 'band', text: heading });
  L.push({ kind: 'small', text: 'Comprobante interno. No es un ticket de venta.' });
  L.push({ kind: 'code', text: a.code });
  L.push({ kind: 'qr', text: advanceQrValue(a.code) });
  L.push({ kind: 'small', text: 'El administrador puede buscarlo con este código o el QR' });
  L.push({ kind: 'rule' });
  L.push({ kind: 'bold', text: 'Dejó el dinero' });
  L.push({ kind: 'text', text: a.clientName });
  if (a.clientPhone) L.push({ kind: 'text', text: `Tel: ${a.clientPhone}` });
  if (a.concept) L.push({ kind: 'text', text: `Para: ${a.concept}` });
  L.push({ kind: 'pair', text: 'Fecha del anticipo', value: opts.fmtDateTime(a.createdAt) });
  L.push({ kind: 'text', text: `Recibió: ${a.createdByName}` });
  if (focus && focus !== ordered[0]) {
    L.push({ kind: 'rule' });
    L.push({ kind: 'bold', text: focus.kind === 'abono' ? 'Este abono' : focus.kind === 'uso' ? 'Esta vez se utilizó' : 'Movimiento' });
    if (focus.amountCents > 0) L.push({ kind: 'pair', text: opts.fmtDateTime(focus.createdAt), value: money(focus.amountCents), strong: true });
    if (focus.note) L.push({ kind: 'text', text: focus.note });
    L.push({ kind: 'text', text: `Atendió: ${focus.userName}` });
  }
  L.push({ kind: 'rule' });
  L.push({ kind: 'bold', text: 'Movimientos' });
  for (const e of shown) {
    if (e.kind === 'abono') {
      L.push({ kind: 'pair', text: `${opts.fmtDateTime(e.createdAt)} Abono${e.method ? ` (${ADVANCE_METHOD_LABEL[e.method]})` : ''}`, value: money(e.amountCents) });
      if (e.note) L.push({ kind: 'small', text: e.note });
    } else if (e.kind === 'uso') {
      L.push({ kind: 'pair', text: `${opts.fmtDateTime(e.createdAt)} Se utilizó`, value: `-${money(e.amountCents)}` });
      L.push({ kind: 'small', text: e.note });
    } else {
      L.push({ kind: 'pair', text: `${opts.fmtDateTime(e.createdAt)} ${ADVANCE_KIND_LABEL[e.kind]}`, value: '' });
      if (e.note) L.push({ kind: 'small', text: e.note });
    }
  }
  L.push({ kind: 'rule' });
  L.push({ kind: 'pair', text: 'Total dejado', value: money(sum.totalAbonosCents) });
  L.push({ kind: 'pair', text: 'Total utilizado', value: money(sum.totalUsoCents) });
  L.push({ kind: 'pair', text: 'Saldo a favor', value: money(sum.balanceCents), strong: true });
  if (sum.status === 'cerrado') L.push({ kind: 'small', text: 'ANTICIPO CERRADO' });
  L.push({ kind: 'gap' });
  L.push({ kind: 'small', text: 'Conserva este ticket. Para agregar abonos o ver en qué se usó, acude con el administrador.' });
  return L;
}
