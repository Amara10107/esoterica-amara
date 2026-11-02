import { describe, expect, it } from 'vitest';
import type { AdvanceFull } from '@amara/shared';
import { buildAdvanceTicketHtml } from '../src/shared/advance-ticket.ts';

const adv: AdvanceFull = {
  id: 'a1', code: 'ANT-P1-0003', branchId: 'b', terminalId: 't', clientName: 'María <López>', clientPhone: '5511223344', concept: 'Limpia de abundancia', createdBy: 'u', createdByName: 'Vendedora', createdAt: '2026-10-22T16:00:00.000Z',
  entries: [
    { id: 'e1', advanceId: 'a1', kind: 'abono', amountCents: 30000, method: 'efectivo', note: '', userId: 'u', userName: 'Vendedora', createdAt: '2026-10-22T16:00:00.000Z', cashSessionId: 's' },
    { id: 'e2', advanceId: 'a1', kind: 'uso', amountCents: 25000, method: null, note: '5 velas', userId: 'g', userName: 'Gerente', createdAt: '2026-10-25T16:00:00.000Z', cashSessionId: null },
  ],
};

describe('ticket de anticipo', () => {
  const html = buildAdvanceTicketHtml(adv, { paperMm: 80, qrSvg: '<svg id="qr"/>', branchName: 'Centro' });
  it('lleva código, QR, cliente escapado, fecha, importes y saldo', () => {
    expect(html).toContain('ANT-P1-0003');
    expect(html).toContain('<svg id="qr"/>');
    expect(html).toContain('María &lt;López&gt;');
    expect(html).not.toContain('<López>');
    expect(html).toContain('ANTICIPO DE LIMPIA');
    expect(html).toContain('$300.00');
    expect(html).toContain('5 velas');
    expect(html).toContain('Saldo a favor');
    expect(html).toContain('$50.00');
  });
  it('el ticket del primer abono muestra el saldo de ese momento', () => {
    const first = buildAdvanceTicketHtml(adv, { paperMm: 58, qrSvg: '<svg/>', uptoEntryId: 'e1' });
    expect(first).not.toContain('5 velas');
    expect(first).toContain('$300.00');
  });
});
