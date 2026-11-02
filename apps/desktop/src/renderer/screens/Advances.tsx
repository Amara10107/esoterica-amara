/** Anticipos de limpias (solo gerente): buscar por nombre, día, código o QR; abrir uno para agregar abonos o anotar en qué se utilizó. */
import { useCallback, useEffect, useState } from 'react';
import { summarizeAdvance } from '@amara/shared';
import type { AdvanceFull } from '@amara/shared';
import { AdvanceDetailModal, NewAdvanceModal } from '../components/AdvanceModals.tsx';
import { DocPreviewModal } from '../components/DocPreviewModal.tsx';
import { Banner } from '../components/Field.tsx';
import { call, errorText } from '../lib/api.ts';
import { dateTime, money } from '../lib/format.ts';
import { useFeedback } from '../state/Feedback.tsx';
import { useScanHandler } from '../state/Scanner.tsx';

export function AdvancesScreen() {
  const { toast } = useFeedback();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'todos' | 'abierto' | 'cerrado'>('todos');
  const [items, setItems] = useState<AdvanceFull[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AdvanceFull | null>(null);
  const [creating, setCreating] = useState(false);
  const [doc, setDoc] = useState<{ advanceId: string; entryId?: string } | null>(null);

  const load = useCallback(async (q: string, st: typeof status) => {
    try {
      setItems(await call('advances:list', { text: q.trim() || undefined, status: st }));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(text, status), 200);
    return () => clearTimeout(t);
  }, [text, status, load]);

  // Un QR de anticipo leído con la pistola o con el teléfono llena la búsqueda y abre el anticipo si es único.
  useScanHandler((code) => {
    setText(code);
    void call('advances:list', { text: code, status: 'todos' }).then((r) => {
      if (r.length === 1) setOpen(r[0]!);
      else if (r.length === 0) toast('warn', 'No se encontró ningún anticipo con ese código.');
    });
  });

  return (
    <div className="page">
      <div className="row-between">
        <h1>Anticipos de limpias</h1>
        <button className="btn btn-gold" onClick={() => setCreating(true)}>Recibir anticipo</button>
      </div>
      <div className="row-gap">
        <input className="inp" style={{ flex: 1 }} placeholder="Buscar por nombre, teléfono, día (2026-10-22), código o escanea el QR del ticket" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        <select className="inp" style={{ width: 150 }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="todos">Todos</option><option value="abierto">Abiertos</option><option value="cerrado">Cerrados</option>
        </select>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {items === null ? <p className="muted">Cargando...</p> : items.length === 0 ? <p className="muted">No hay anticipos con ese criterio. Los de otras terminales aparecen después de sincronizar.</p> : (
        <table className="table">
          <thead><tr><th>Código</th><th>Cliente</th><th>Para</th><th>Fecha</th><th className="num">Dejó</th><th className="num">Usado</th><th className="num">Saldo</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {items.map((a) => {
              const s = summarizeAdvance(a);
              return (
                <tr key={a.id}>
                  <td className="mono">{a.code}</td><td>{a.clientName}</td><td>{a.concept}</td><td>{dateTime(a.createdAt)}</td>
                  <td className="num">{money(s.totalAbonosCents)}</td><td className="num">{money(s.totalUsoCents)}</td><td className="num"><strong>{money(s.balanceCents)}</strong></td>
                  <td><span className={s.status === 'abierto' ? 'chip chip-info' : 'chip'}>{s.status === 'abierto' ? 'Abierto' : 'Cerrado'}</span></td>
                  <td><button className="btn btn-sm" onClick={() => setOpen(a)}>Abrir</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {creating && <NewAdvanceModal onClose={() => setCreating(false)} onDone={(r) => { setCreating(false); setDoc({ advanceId: r.advance.id, entryId: r.entryId }); void load(text, status); }} />}
      {open && <AdvanceDetailModal advance={open} onClose={() => setOpen(null)} onChanged={(a) => { setOpen(a); void load(text, status); }} onPrint={(advanceId, entryId) => setDoc({ advanceId, entryId })} />}
      {doc && <DocPreviewModal doc={{ kind: 'advance', advanceId: doc.advanceId, entryId: doc.entryId }} title="Ticket de anticipo" onClose={() => setDoc(null)} />}
    </div>
  );
}
