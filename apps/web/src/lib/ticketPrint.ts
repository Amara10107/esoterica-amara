import QRCode from 'qrcode';
import type { TicketLine } from '@amara/shared';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Convierte los renglones de un ticket (comunes a PC y teléfono) en HTML imprimible de 80 mm. */
export async function ticketLinesToHtml(lines: TicketLine[]): Promise<string> {
  const out: string[] = [];
  for (const l of lines) {
    switch (l.kind) {
      case 'band': out.push(`<div class="band">${esc(l.text)}</div>`); break;
      case 'title': out.push(`<div class="title">${esc(l.text)}</div>`); break;
      case 'text': out.push(`<div class="c">${esc(l.text)}</div>`); break;
      case 'bold': out.push(`<div class="b">${esc(l.text)}</div>`); break;
      case 'small': out.push(`<div class="c s">${esc(l.text)}</div>`); break;
      case 'code': out.push(`<div class="code">${esc(l.text)}</div>`); break;
      case 'qr': {
        const url = await QRCode.toDataURL(l.text, { margin: 1, width: 220 });
        out.push(`<div class="c"><img src="${url}" width="150" height="150" alt="QR"/></div>`);
        break;
      }
      case 'pair': out.push(`<div class="pair${l.strong ? ' b' : ''}"><span>${esc(l.text)}</span><span>${esc(l.value)}</span></div>`); break;
      case 'rule': out.push('<hr/>'); break;
      case 'gap': out.push('<div style="height:8px"></div>'); break;
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Esotérica Amara</title><style>
@page{size:80mm auto;margin:3mm}body{font-family:Arial,sans-serif;font-size:12px;width:74mm;margin:0 auto;color:#000}
.band{background:#302142;color:#fff;text-align:center;font-weight:bold;padding:4px;margin:4px 0}
.title{text-align:center;font-size:16px;font-weight:bold;color:#302142}.c{text-align:center}.s{font-size:10px;color:#444}.b{font-weight:bold}
.code{text-align:center;font-family:monospace;font-size:15px;font-weight:bold;margin:4px 0}
.pair{display:flex;justify-content:space-between;gap:8px}hr{border:0;border-top:1px dashed #000;margin:6px 0}
</style></head><body>${out.join('')}</body></html>`;
}

/** Imprime un HTML en un iframe oculto (no imprime la aplicación). */
export function printHtml(html: string): void {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(f);
  const doc = f.contentDocument;
  if (!doc) { f.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    try { f.contentWindow?.focus(); f.contentWindow?.print(); } catch { /* el usuario puede imprimir desde la vista */ }
    setTimeout(() => f.remove(), 60_000);
  }, 300);
}
