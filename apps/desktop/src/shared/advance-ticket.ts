/**
 * Ticket de ANTICIPO DE LIMPIA (v2.3). El modelo de renglones sale de @amara/shared (buildAdvanceTicketLines) y aquí se dibuja
 * como HTML de 58 u 80 mm con el estilo de los demás tickets. El QR (SVG) lo genera quien llama.
 */
import { buildAdvanceTicketLines, formatMXN, formatMxDateTime } from '@amara/shared';
import type { AdvanceFull } from '@amara/shared';
import { BASE_CSS, escapeHtml } from './ticket-format.ts';

const EXTRA_CSS = (paperMm: 58 | 80) => {
  const qr = paperMm === 58 ? 30 : 38;
  return `
.band { background: #000; color: #fff; text-align: center; font-weight: bold; letter-spacing: 1px; padding: 1mm 0; margin: 2mm 0; -webkit-print-color-adjust: exact; }
.code { text-align: center; font-weight: bold; font-size: 15px; letter-spacing: 1px; margin: 1mm 0; }
.small { text-align: center; font-size: 10px; margin: 1mm 0; word-break: break-word; }
.qr { display: block; margin: 2mm auto; width: ${qr}mm; height: ${qr}mm; }
.qr svg { width: 100%; height: 100%; }
.bold { font-weight: bold; margin-top: 1mm; }
.gap { height: 3mm; }
`;
};

export function advanceBodyHtml(a: AdvanceFull, o: { qrSvg: string; branchName?: string; uptoEntryId?: string | null; logoSrc?: string; business?: string }): string {
  const lines = buildAdvanceTicketLines(a, { business: o.business, branchName: o.branchName, uptoEntryId: o.uptoEntryId, fmtMoney: formatMXN, fmtDateTime: formatMxDateTime });
  return lines
    .map((l) => {
      switch (l.kind) {
        case 'title':
          return `${o.logoSrc ? `<img class="logo" src="${escapeHtml(o.logoSrc)}" alt="">` : ''}<div class="biz">${escapeHtml(l.text)}</div>`;
        case 'text':
          return `<div class="c">${escapeHtml(l.text)}</div>`;
        case 'band':
          return `<div class="band">${escapeHtml(l.text)}</div>`;
        case 'bold':
          return `<div class="bold">${escapeHtml(l.text)}</div>`;
        case 'small':
          return `<div class="small">${escapeHtml(l.text)}</div>`;
        case 'code':
          return `<div class="code">${escapeHtml(l.text)}</div>`;
        case 'qr':
          return `<div class="qr">${o.qrSvg}</div>`;
        case 'pair':
          return `<div class="row ${l.strong ? 'total' : ''}"><span>${escapeHtml(l.text)}</span><span>${escapeHtml(l.value)}</span></div>`;
        case 'rule':
          return '<div class="sep"></div>';
        case 'gap':
          return '<div class="gap"></div>';
      }
    })
    .join('');
}

export function buildAdvanceTicketHtml(a: AdvanceFull, o: { paperMm: 58 | 80; qrSvg: string; branchName?: string; uptoEntryId?: string | null; logoSrc?: string }): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(`Anticipo ${a.code}`)}</title><style>${BASE_CSS(o.paperMm)}${EXTRA_CSS(o.paperMm)}</style></head><body><div class="t">${advanceBodyHtml(a, o)}</div></body></html>`;
}
