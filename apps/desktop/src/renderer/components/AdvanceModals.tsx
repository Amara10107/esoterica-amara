/**
 * Anticipos de limpias (v2.3).
 *  - NewAdvanceModal: cualquier vendedor o gerente RECIBE un anticipo (nombre, cuánto deja, para qué). Genera código y ticket con QR.
 *  - AdvanceDetailModal: SOLO el gerente. Ve todo el historial, agrega más abonos, registra en qué se utilizó el dinero
 *    (ej. "5 velas"), cierra o reabre el anticipo, e imprime el ticket (completo o de un abono).
 */
import { useRef, useState } from 'react';
import { ADVANCE_KIND_LABEL, ADVANCE_METHOD_LABEL, summarizeAdvance } from '@amara/shared';
import type { AdvanceFull, AdvanceMethod } from '@amara/shared';
import { call, errorText } from '../lib/api.ts';
import { dateTime, money, parsePesos } from '../lib/format.ts';
import { useFeedback } from '../state/Feedback.tsx';
import { Banner, Field } from './Field.tsx';
import { Modal } from './Modal.tsx';

const METHODS: AdvanceMethod[] = ['efectivo', 'tarjeta', 'transferencia'];

export function NewAdvanceModal({ onClose, onDone }: { onClose: () => void; onDone: (r: { advance: AdvanceFull; entryId: string; cashRegistered: boolean }) => void }) {
  const [f, setF] = useState({ clientName: '', clientPhone: '', concept: '', amount: '', method: 'efectivo' as AdvanceMethod, note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  const cents = parsePesos(f.amount);
  const ok = f.clientName.trim().length >= 2 && cents !== null && !Number.isNaN(cents) && cents > 0;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (submitting.current || !ok) return;
    submitting.current = true;
    setBusy(true);
    try {
      const r = await call('advances:create', {
        clientName: f.clientName.trim(), clientPhone: f.clientPhone.trim() || undefined, concept: f.concept.trim() || undefined,
        amountCents: cents as number, method: f.method, note: f.note.trim() || undefined,
      });
      onDone({ advance: r.advance, entryId: r.advance.entries[0]!.id, cashRegistered: r.cashRegistered });
    } catch (e) {
      setError(errorText(e));
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal title="Anticipo de limpia" size="md" onClose={onClose} dirty={f.clientName !== '' || f.amount !== ''} busy={busy}
      footer={<><button className="btn" onClick={onClose} disabled={busy}>Cancelar</button><button className="btn btn-gold" onClick={() => void submit()} disabled={busy || !ok}>Recibir y generar ticket</button></>}>
      <div className="stack">
        <Banner kind="info">Se registra quién deja el dinero, cuánto y el día. Se genera un ticket con código y QR para que el administrador lo encuentre después.</Banner>
        <Field label="Nombre de quien deja el dinero"><input className="inp" value={f.clientName} onChange={set('clientName')} autoFocus /></Field>
        <div className="grid2">
          <Field label="Teléfono (opcional)"><input className="inp" inputMode="tel" value={f.clientPhone} onChange={set('clientPhone')} /></Field>
          <Field label="Cuánto deja ($)"><input className="inp inp-lg" inputMode="decimal" value={f.amount} onChange={set('amount')} /></Field>
        </div>
        <Field label="¿Para qué es? (opcional)" hint="Ejemplo: limpia de abundancia, 5 velas"><input className="inp" value={f.concept} onChange={set('concept')} /></Field>
        <Field label="Forma de pago" hint="Solo el efectivo entra al cajón y cuenta en el corte de caja">
          <select className="inp" value={f.method} onChange={set('method')}>{METHODS.map((m) => <option key={m} value={m}>{ADVANCE_METHOD_LABEL[m]}</option>)}</select>
        </Field>
        <Field label="Nota (opcional)"><input className="inp" value={f.note} onChange={set('note')} /></Field>
        {error && <Banner kind="error">{error}</Banner>}
      </div>
    </Modal>
  );
}

export function AdvanceDetailModal({ advance, onClose, onChanged, onPrint }: {
  advance: AdvanceFull; onClose: () => void; onChanged: (a: AdvanceFull) => void; onPrint: (advanceId: string, entryId?: string) => void;
}) {
  const { toast } = useFeedback();
  const sum = summarizeAdvance(advance);
  const [mode, setMode] = useState<'abono' | 'uso' | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<AdvanceMethod>('efectivo');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = parsePesos(amount);
  const amountOk = cents !== null && !Number.isNaN(cents) && cents > 0;
  const noteOk = mode === 'abono' || note.trim().length >= 3;

  const send = async (kind: 'abono' | 'uso' | 'cierre' | 'reapertura') => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await call('advances:addEntry', {
        advanceId: advance.id, kind, amountCents: kind === 'abono' || kind === 'uso' ? (cents as number) : undefined,
        method: kind === 'abono' ? method : undefined, note: note.trim() || undefined,
      });
      toast('ok', kind === 'abono' ? (r.cashRegistered ? 'Abono registrado y sumado al cajón.' : 'Abono registrado (no entró al cajón: no hay caja abierta o no fue en efectivo).') : kind === 'uso' ? 'Quedó anotado en qué se utilizó.' : kind === 'cierre' ? 'Anticipo cerrado.' : 'Anticipo abierto de nuevo.');
      setMode(null);
      setAmount('');
      setNote('');
      onChanged(r.advance);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Anticipo ${advance.code}`} size="lg" onClose={onClose} busy={busy}
      footer={<><button className="btn" onClick={() => onPrint(advance.id)}>Imprimir ticket (con QR)</button><button className="btn btn-gold" onClick={onClose}>Cerrar</button></>}>
      <div className="stack">
        <div className="row-between">
          <div>
            <h3>{advance.clientName}</h3>
            <div className="muted">{advance.clientPhone ? `Tel. ${advance.clientPhone} - ` : ''}{advance.concept} - recibió {advance.createdByName} el {dateTime(advance.createdAt)}</div>
          </div>
          <div className="stat">
            <span className="muted">Saldo a favor</span>
            <div className="stat-big gold">{money(sum.balanceCents)}</div>
            <span className={sum.status === 'abierto' ? 'chip chip-info' : 'chip'}>{sum.status === 'abierto' ? 'Abierto' : 'Cerrado'}</span>
          </div>
        </div>
        <div className="muted small">Dejó en total {money(sum.totalAbonosCents)} - Se ha utilizado {money(sum.totalUsoCents)}</div>

        <table className="table table-tight">
          <thead><tr><th>Cuándo</th><th>Movimiento</th><th>Detalle</th><th>Atendió</th><th className="num">Importe</th><th /></tr></thead>
          <tbody>
            {advance.entries.map((e) => (
              <tr key={e.id}>
                <td>{dateTime(e.createdAt)}</td>
                <td>{ADVANCE_KIND_LABEL[e.kind]}{e.method ? ` (${ADVANCE_METHOD_LABEL[e.method]})` : ''}</td>
                <td>{e.note}</td>
                <td>{e.userName}</td>
                <td className="num">{e.kind === 'abono' ? money(e.amountCents) : e.kind === 'uso' ? `-${money(e.amountCents)}` : ''}</td>
                <td><button className="btn btn-sm" onClick={() => onPrint(advance.id, e.id)}>Ticket</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        {mode === null ? (
          <div className="row-gap">
            {sum.status === 'abierto' ? (
              <>
                <button className="btn btn-gold" onClick={() => setMode('abono')}>Agregar abono</button>
                <button className="btn" onClick={() => setMode('uso')} disabled={sum.balanceCents <= 0}>Anotar en qué se utilizó</button>
                <button className="btn" onClick={() => { if (window.confirm('¿Cerrar este anticipo? Ya no se podrán agregar abonos ni usos hasta abrirlo de nuevo.')) void send('cierre'); }} disabled={busy}>Cerrar anticipo</button>
              </>
            ) : (
              <button className="btn btn-gold" onClick={() => void send('reapertura')} disabled={busy}>Abrir de nuevo</button>
            )}
          </div>
        ) : (
          <div className="card stack">
            <h4>{mode === 'abono' ? 'Nuevo abono' : 'En qué se utilizó el dinero'}</h4>
            <div className="grid2">
              <Field label={mode === 'abono' ? 'Cuánto deja ($)' : 'Cuánto se utilizó ($)'} hint={mode === 'uso' ? `Saldo disponible: ${money(sum.balanceCents)}` : undefined}>
                <input className="inp inp-lg" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              </Field>
              {mode === 'abono' && (
                <Field label="Forma de pago">
                  <select className="inp" value={method} onChange={(e) => setMethod(e.target.value as AdvanceMethod)}>{METHODS.map((m) => <option key={m} value={m}>{ADVANCE_METHOD_LABEL[m]}</option>)}</select>
                </Field>
              )}
            </div>
            <Field label={mode === 'abono' ? 'Nota (opcional)' : 'En qué se utilizó (obligatorio)'} hint={mode === 'uso' ? 'Ejemplo: 5 velas, aceite y hierbas' : undefined}>
              <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {error && <Banner kind="error">{error}</Banner>}
            <div className="row-gap">
              <button className="btn" onClick={() => { setMode(null); setError(null); }} disabled={busy}>Cancelar</button>
              <button className="btn btn-gold" onClick={() => void send(mode)} disabled={busy || !amountOk || !noteOk}>Guardar</button>
            </div>
          </div>
        )}
        {mode === null && error && <Banner kind="error">{error}</Banner>}
      </div>
    </Modal>
  );
}
